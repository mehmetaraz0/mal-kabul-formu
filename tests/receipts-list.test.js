import { describe, it, expect, vi, beforeEach } from 'vitest';

const receiptsQuery = {
  select: vi.fn(function () { return this; }),
  gte: vi.fn(function () { return this; }),
  lte: vi.fn(function () { return this; }),
  eq: vi.fn(function () { return this; }),
  in: vi.fn(function () { return this; }),
  order: vi.fn(function () { return this; }),
  limit: vi.fn(() => Promise.resolve({
    data: [{ id: 'r1', receipt_date: '2026-08-20', irsaliye_no: 'IRS-1', siparis_no: null, status: 'onaylandi', companies: { name: 'TEST FIRMA' } }],
    error: null
  }))
};

const itemsQuery = {
  select: vi.fn(function () { return this; }),
  eq: vi.fn(() => Promise.resolve({ data: [{ receipt_id: 'r1' }], error: null }))
};

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn((table) => (table === 'receipt_items' ? itemsQuery : receiptsQuery))
  }
}));

import { listReceipts } from '../src/lib/receipts.js';

describe('listReceipts', () => {
  beforeEach(() => {
    // Çağrı geçmişini sıfırlıyoruz ki her testte "hiç çağrılmadı" / "şu argümanla çağrıldı"
    // iddiaları önceki testlerin birikmiş çağrılarından etkilenmesin. vi.clearAllMocks() sadece
    // çağrı kaydını temizler, vi.fn(...) ile verilen varsayılan implementasyonları korur.
    vi.clearAllMocks();
  });

  it('filtresiz çağrıldığında tüm kayıtları döner', async () => {
    const result = await listReceipts({});
    expect(result).toHaveLength(1);
    expect(result[0].companies.name).toBe('TEST FIRMA');
  });

  it('tarih aralığı verildiğinde gte/lte çağrılır', async () => {
    await listReceipts({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(receiptsQuery.gte).toHaveBeenCalledWith('receipt_date', '2026-08-01');
    expect(receiptsQuery.lte).toHaveBeenCalledWith('receipt_date', '2026-08-31');
  });

  it('ürün filtresi verildiğinde önce receipt_items sorgulanır', async () => {
    await listReceipts({ productId: 5 });
    expect(itemsQuery.eq).toHaveBeenCalledWith('product_id', 5);
    expect(receiptsQuery.in).toHaveBeenCalledWith('id', ['r1']);
  });

  it('ürün filtresine eşleşen kayıt yoksa .in() hiç çağrılmadan boş dizi döner', async () => {
    itemsQuery.eq.mockResolvedValueOnce({ data: [], error: null });
    const result = await listReceipts({ productId: 999 });
    expect(result).toEqual([]);
    // Regresyon koruması: erken dönüş korumasi kaldırılırsa kod .in('id', []) çağırmaya
    // başlar — bu iddia o durumu yakalar.
    expect(receiptsQuery.in).not.toHaveBeenCalled();
  });

  it('sadece status verildiğinde eq("status", ...) çağrılır', async () => {
    await listReceipts({ status: 'onaylandi' });
    expect(receiptsQuery.eq).toHaveBeenCalledWith('status', 'onaylandi');
  });

  it('sadece companyId verildiğinde eq("company_id", ...) çağrılır', async () => {
    await listReceipts({ companyId: 5 });
    expect(receiptsQuery.eq).toHaveBeenCalledWith('company_id', 5);
  });

  it('birden fazla filtre birlikte verildiğinde hiçbiri kaybolmadan uygulanır', async () => {
    await listReceipts({ companyId: 5, status: 'kalite_bekliyor', productId: 1 });
    expect(itemsQuery.eq).toHaveBeenCalledWith('product_id', 1);
    expect(receiptsQuery.eq).toHaveBeenCalledWith('company_id', 5);
    expect(receiptsQuery.eq).toHaveBeenCalledWith('status', 'kalite_bekliyor');
    expect(receiptsQuery.in).toHaveBeenCalledWith('id', ['r1']);
  });

  it('filtresiz aramada bile sonuç 500 kayıtla sınırlanır', async () => {
    await listReceipts({});
    expect(receiptsQuery.limit).toHaveBeenCalledWith(500);
  });
});
