import { describe, it, expect, vi } from 'vitest';

const receiptsQuery = {
  select: vi.fn(function () { return this; }),
  gte: vi.fn(function () { return this; }),
  lte: vi.fn(function () { return this; }),
  eq: vi.fn(function () { return this; }),
  in: vi.fn(function () { return this; }),
  order: vi.fn(() => Promise.resolve({
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
});
