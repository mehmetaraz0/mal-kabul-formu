import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockState = { rpcResult: { data: 'r1', error: null } };

vi.mock('../src/lib/supabase.js', () => {
  const rpc = vi.fn(() => Promise.resolve(mockState.rpcResult));
  const from = vi.fn((table) => {
    if (table === 'receipts') {
      return {
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({
              data: [{ id: 'r1', receipt_date: '2026-08-26', irsaliye_no: 'IRS-1', companies: { name: 'TEST FIRMA' } }],
              error: null
            })),
            single: vi.fn(() => Promise.resolve({
              data: { id: 'r1', company_id: 1, status: 'kalite_bekliyor' },
              error: null
            }))
          }))
        }))
      };
    }
    if (table === 'receipt_items') {
      return {
        insert: vi.fn(() => Promise.resolve({ error: null })),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [{ id: 'i1', product_id: 1, lot_no: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg', uygunluk: 'beklemede', note: null, products: { code: 'YIY01000001', name: 'DANA' } }],
            error: null
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
  submitForQuality,
  listPendingQuality,
  getReceiptDetail,
  updateItemUygunluk,
  finalizeQuality
} from '../src/lib/receipts.js';
import { supabase } from '../src/lib/supabase.js';

describe('receipts', () => {
  it('createReceiptWithItems en az bir satır ister', async () => {
    await expect(createReceiptWithItems({
      companyId: 1, receiptDate: '2026-08-26', irsaliyeNo: '', siparisNo: '', receivedBy: 'u1', items: []
    })).rejects.toThrow('En az bir ürün satırı gerekli');
  });

  it('createReceiptWithItems geçerli veriyle receipt id döner', async () => {
    const id = await createReceiptWithItems({
      companyId: 1, receiptDate: '2026-08-26', irsaliyeNo: 'IRS-1', siparisNo: '', receivedBy: 'u1',
      items: [{ productId: 1, lotNo: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg' }]
    });
    expect(id).toBe('r1');
    expect(supabase.rpc).toHaveBeenCalledWith('create_receipt_with_items', expect.objectContaining({
      p_company_id: 1,
      p_items: expect.arrayContaining([expect.objectContaining({ productId: 1, lineNo: 1, unit: 'kg' })])
    }));
    const callArgs = supabase.rpc.mock.calls[0][1];
    expect(callArgs.p_items[0].productId).toBe(1);
  });

  it('listPendingQuality kalite_bekliyor kayıtlarını döner', async () => {
    const result = await listPendingQuality();
    expect(result).toHaveLength(1);
    expect(result[0].companies.name).toBe('TEST FIRMA');
  });

  it('getReceiptDetail receipt ve items birlikte döner', async () => {
    const result = await getReceiptDetail('r1');
    expect(result.receipt.status).toBe('kalite_bekliyor');
    expect(result.items).toHaveLength(1);
  });

  it('finalizeQuality tüm satırlar işaretlenmeden onaylandi kabul etmez', async () => {
    await expect(finalizeQuality('r1', { decision: 'onaylandi', qualityBy: 'u2', qualityNote: '' }))
      .rejects.toThrow('Tüm satırlar uygun/uygun değil olarak işaretlenmeden onaylanamaz');
  });
});
