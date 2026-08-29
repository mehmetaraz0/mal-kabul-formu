import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockState = {
  rpcResult: { data: 'r1', error: null },
  // .update().eq().select() sonucu — PostgREST 0 satır güncellediğinde de error:null döndüğü için
  // data'nın boş dizi olduğu durumu ayrıca test edebilmemiz gerekiyor.
  updateResult: { data: [{ id: 'r1' }], error: null }
};

vi.mock('../src/lib/supabase.js', () => {
  const rpc = vi.fn(() => Promise.resolve(mockState.rpcResult));
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve(mockState.updateResult))
    }))
  }));
  const from = vi.fn((table) => {
    if (table === 'receipts') {
      return {
        update,
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({
              data: [{ id: 'r1', receipt_date: '2026-08-26', irsaliye_no: 'IRS-1', companies: { name: 'TEST FIRMA' } }],
              error: null
            })),
            single: vi.fn(() => Promise.resolve({
              data: {
                id: 'r1',
                company_id: 1,
                status: 'kalite_bekliyor',
                irsaliye_no: 'IRS-1',
                fatura_no: 'FAT-1',
                arac_hijyen_uygun: true,
                arac_sicaklik: 3.2,
                companies: { name: 'TEST FIRMA' },
                received_profile: { full_name: 'Depo Yöneticisi' },
                quality_profile: { full_name: 'Kalite Kişisi' }
              },
              error: null
            }))
          }))
        }))
      };
    }
    if (table === 'receipt_items') {
      return {
        insert: vi.fn(() => Promise.resolve({ error: null })),
        update,
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({
              data: [{ id: 'i1', line_no: 1, product_id: 1, lot_no: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg', uygunluk: 'beklemede', note: null, urun_sicakligi: 2.1, yari_omur_gecti: false, products: { code: 'YIY01000001', name: 'DANA' } }],
              error: null
            }))
          }))
        }))
      };
    }
    throw new Error('beklenmeyen tablo: ' + table);
  });
  return { supabase: { from, rpc } };
});

import {
  createReceiptWithItems,
  getReceiptDetail
} from '../src/lib/receipts.js';
import { supabase } from '../src/lib/supabase.js';

const validItems = [{ productId: 1, lotNo: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg' }];
const baseArgs = { companyId: 1, receiptDate: '2026-08-26', irsaliyeNo: 'IRS-1', siparisNo: '', receivedBy: 'u1' };

describe('receipts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.rpcResult = { data: 'r1', error: null };
    mockState.updateResult = { data: [{ id: 'r1' }], error: null };
  });

  it('createReceiptWithItems en az bir satır ister', async () => {
    await expect(createReceiptWithItems({ ...baseArgs, irsaliyeNo: '', items: [] }))
      .rejects.toThrow('En az bir ürün satırı gerekli');
  });

  it('createReceiptWithItems geçerli veriyle receipt id döner', async () => {
    const id = await createReceiptWithItems({ ...baseArgs, items: validItems });
    expect(id).toBe('r1');
    expect(supabase.rpc).toHaveBeenCalledWith('create_receipt_with_items', expect.objectContaining({
      p_company_id: 1,
      p_items: expect.arrayContaining([expect.objectContaining({ productId: 1, lineNo: 1, unit: 'kg' })])
    }));
    const callArgs = supabase.rpc.mock.calls[0][1];
    expect(callArgs.p_items[0].productId).toBe(1);
  });

  it('createReceiptWithItems urunSicakligi/yariOmurGecti verilmezse varsayılan null/false gönderir', async () => {
    await createReceiptWithItems({ ...baseArgs, items: validItems });
    const item = supabase.rpc.mock.calls[0][1].p_items[0];
    expect(item.urunSicakligi).toBeNull();
    expect(item.yariOmurGecti).toBe(false);
  });

  it('createReceiptWithItems satır başına urunSicakligi/yariOmurGecti değerlerini RPC\'ye geçirir', async () => {
    const items = [{ productId: 1, lotNo: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg', urunSicakligi: 4.5, yariOmurGecti: true }];
    await createReceiptWithItems({ ...baseArgs, items });
    const item = supabase.rpc.mock.calls[0][1].p_items[0];
    expect(item.urunSicakligi).toBe(4.5);
    expect(item.yariOmurGecti).toBe(true);
  });

  it('createReceiptWithItems faturaNo/aracHijyenUygun/aracSicaklik verilmezse null gönderir', async () => {
    await createReceiptWithItems({ ...baseArgs, items: validItems });
    const callArgs = supabase.rpc.mock.calls[0][1];
    expect(callArgs.p_fatura_no).toBeNull();
    expect(callArgs.p_arac_hijyen_uygun).toBeNull();
    expect(callArgs.p_arac_sicaklik).toBeNull();
  });

  it('createReceiptWithItems faturaNo/aracHijyenUygun/aracSicaklik değerlerini RPC\'ye geçirir', async () => {
    await createReceiptWithItems({
      ...baseArgs,
      items: validItems,
      faturaNo: 'FAT-1',
      aracHijyenUygun: true,
      aracSicaklik: 3.2
    });
    const callArgs = supabase.rpc.mock.calls[0][1];
    expect(callArgs.p_fatura_no).toBe('FAT-1');
    expect(callArgs.p_arac_hijyen_uygun).toBe(true);
    expect(callArgs.p_arac_sicaklik).toBe(3.2);
  });

  it('createReceiptWithItems varsayılan olarak p_submit_to_quality=false gönderir', async () => {
    await createReceiptWithItems({ ...baseArgs, items: validItems });
    expect(supabase.rpc.mock.calls[0][1].p_submit_to_quality).toBe(false);
  });

  it('createReceiptWithItems submitToQuality=true ile p_submit_to_quality=true gönderir', async () => {
    await createReceiptWithItems({ ...baseArgs, items: validItems, submitToQuality: true });
    expect(supabase.rpc.mock.calls[0][1].p_submit_to_quality).toBe(true);
  });

  it('createReceiptWithItems verilen clientUuid\'yi aynen kullanır', async () => {
    const clientUuid = '11111111-2222-3333-4444-555555555555';
    await createReceiptWithItems({ ...baseArgs, items: validItems, clientUuid });
    expect(supabase.rpc.mock.calls[0][1].p_client_uuid).toBe(clientUuid);
  });

  it('createReceiptWithItems clientUuid verilmezse kendi üretir', async () => {
    await createReceiptWithItems({ ...baseArgs, items: validItems });
    const generated = supabase.rpc.mock.calls[0][1].p_client_uuid;
    expect(typeof generated).toBe('string');
    expect(generated).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('getReceiptDetail receipt ve items birlikte döner', async () => {
    const result = await getReceiptDetail('r1');
    expect(result.receipt.status).toBe('kalite_bekliyor');
    expect(result.items).toHaveLength(1);
  });

  it('getReceiptDetail yeni alanları (fatura_no, arac_hijyen_uygun, arac_sicaklik) ve isim join\'lerini döner', async () => {
    const result = await getReceiptDetail('r1');
    expect(result.receipt.fatura_no).toBe('FAT-1');
    expect(result.receipt.arac_hijyen_uygun).toBe(true);
    expect(result.receipt.arac_sicaklik).toBe(3.2);
    expect(result.receipt.companyName).toBe('TEST FIRMA');
    expect(result.receipt.receivedByName).toBe('Depo Yöneticisi');
    expect(result.receipt.qualityByName).toBe('Kalite Kişisi');
    expect(result.items[0].urun_sicakligi).toBe(2.1);
    expect(result.items[0].yari_omur_gecti).toBe(false);
  });

  it('createReceiptWithItems her satır için uygunluk ve not değerini RPC\'ye gönderir', async () => {
    await createReceiptWithItems({
      companyId: 1, receiptDate: '2026-08-29', irsaliyeNo: '', siparisNo: '', receivedBy: 'u1',
      items: [{ productId: 1, lotNo: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg', uygunluk: 'uygun', note: 'Kutu ezik' }]
    });
    const rpcCall = supabase.rpc.mock.calls.find((call) => call[0] === 'create_receipt_with_items');
    expect(rpcCall[1].p_items[0].uygunluk).toBe('uygun');
    expect(rpcCall[1].p_items[0].note).toBe('Kutu ezik');
  });

  it('createReceiptWithItems uygunluk/not verilmezse RPC\'ye null/undefined göndermez, RPC kendi varsayılanını kullanır', async () => {
    await createReceiptWithItems({
      companyId: 1, receiptDate: '2026-08-29', irsaliyeNo: '', siparisNo: '', receivedBy: 'u1',
      items: [{ productId: 1, lotNo: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg' }]
    });
    const rpcCall = supabase.rpc.mock.calls.find((call) => call[0] === 'create_receipt_with_items');
    expect(rpcCall[1].p_items[0].uygunluk).toBeUndefined();
    expect(rpcCall[1].p_items[0].note).toBeUndefined();
  });
});
