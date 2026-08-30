import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockData = { data: [], error: null };

const createQueryMock = () => ({
  select: vi.fn(function () { return this; }),
  eq: vi.fn(function () { return this; }),
  gte: vi.fn(function () { return this; }),
  lte: vi.fn(function () { return this; }),
  limit: vi.fn(function () { return this; }),
  then: function (onFulfilled, onRejected) {
    return Promise.resolve(mockData).then(onFulfilled, onRejected);
  },
  catch: function (onRejected) {
    return Promise.resolve(mockData).catch(onRejected);
  }
});

let query = createQueryMock();

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(() => query) }
}));

import { getStatistics, STATISTICS_ROW_LIMIT } from '../src/lib/statistics.js';

function row({ productId, productName, companyId, companyName, unit, quantity, uygunluk }) {
  return {
    product_id: productId,
    products: { name: productName },
    quantity,
    unit,
    uygunluk,
    receipts: { receipt_date: '2026-08-20', company_id: companyId, companies: { id: companyId, name: companyName } }
  };
}

describe('getStatistics', () => {
  beforeEach(() => {
    mockData = { data: [], error: null };
    query = createQueryMock();
  });

  it('aynı ürüne ait birden fazla satırın kg toplamını doğru hesaplar', async () => {
    mockData = {
      data: [
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 5, uygunluk: 'uygun' }),
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 3, uygunluk: 'uygun' })
      ],
      error: null
    };
    const { products } = await getStatistics({});
    expect(products).toHaveLength(1);
    expect(products[0].totalKg).toBe(8);
    expect(products[0].totalAdet).toBe(0);
  });

  it('kg ve adet birimlerini ayrı sütunlarda tutar, birbirine toplamaz', async () => {
    mockData = {
      data: [
        row({ productId: 1, productName: 'YUMURTA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 5, uygunluk: 'uygun' }),
        row({ productId: 1, productName: 'YUMURTA', companyId: 10, companyName: 'FIRMA A', unit: 'ad', quantity: 30, uygunluk: 'uygun' })
      ],
      error: null
    };
    const { products } = await getStatistics({});
    expect(products[0].totalKg).toBe(5);
    expect(products[0].totalAdet).toBe(30);
  });

  it('firma bazında da doğru toplar (farklı ürünler, aynı firma)', async () => {
    mockData = {
      data: [
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 5, uygunluk: 'uygun' }),
        row({ productId: 2, productName: 'TAVUK', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 4, uygunluk: 'uygun' })
      ],
      error: null
    };
    const { companies } = await getStatistics({});
    expect(companies).toHaveLength(1);
    expect(companies[0].totalKg).toBe(9);
  });

  it('sadece uygunluk="uygun_degil" olan satırları red sayısına dahil eder', async () => {
    mockData = {
      data: [
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 5, uygunluk: 'uygun_degil' }),
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 3, uygunluk: 'uygun' }),
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 2, uygunluk: 'beklemede' })
      ],
      error: null
    };
    const { products, companies } = await getStatistics({});
    expect(products[0].rejectedCount).toBe(1);
    expect(companies[0].rejectedCount).toBe(1);
  });

  it('sonuçları Toplam Kg\'ye göre azalan sıralar (hem ürün hem firma)', async () => {
    mockData = {
      data: [
        row({ productId: 1, productName: 'AZ', companyId: 10, companyName: 'AZ FIRMA', unit: 'kg', quantity: 2, uygunluk: 'uygun' }),
        row({ productId: 2, productName: 'COK', companyId: 20, companyName: 'COK FIRMA', unit: 'kg', quantity: 50, uygunluk: 'uygun' })
      ],
      error: null
    };
    const { products, companies } = await getStatistics({});
    expect(products.map((p) => p.name)).toEqual(['COK', 'AZ']);
    expect(companies.map((c) => c.name)).toEqual(['COK FIRMA', 'AZ FIRMA']);
  });

  it('startDate/endDate verildiğinde receipts.receipt_date üzerinden gte/lte uygular', async () => {
    await getStatistics({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(query.gte).toHaveBeenCalledWith('receipts.receipt_date', '2026-08-01');
    expect(query.lte).toHaveBeenCalledWith('receipts.receipt_date', '2026-08-31');
  });

  it('startDate/endDate verilmezse gte/lte hiç çağrılmaz', async () => {
    await getStatistics({});
    expect(query.gte).not.toHaveBeenCalled();
    expect(query.lte).not.toHaveBeenCalled();
  });

  it('count dönen satır sayısından büyükse truncated=true döner (gerçek toplam satır sayısından daha azı alınmış)', async () => {
    mockData = {
      data: [row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 5, uygunluk: 'uygun' })],
      count: 50,
      error: null
    };
    const { truncated } = await getStatistics({});
    expect(truncated).toBe(true);
  });

  it('count dönen satır sayısına eşitse truncated=false döner (hepsi alınmış)', async () => {
    mockData = {
      data: [row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 5, uygunluk: 'uygun' })],
      count: 1,
      error: null
    };
    const { truncated } = await getStatistics({});
    expect(truncated).toBe(false);
  });

  it('receipts!inner join ile select yapar ve status="onaylandi" filtresi uygular', async () => {
    await getStatistics({});
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('receipts!inner'), expect.objectContaining({ count: 'exact' }));
    expect(query.eq).toHaveBeenCalledWith('receipts.status', 'onaylandi');
  });

  it('STATISTICS_ROW_LIMIT ile limit uygular', async () => {
    await getStatistics({});
    expect(query.limit).toHaveBeenCalledWith(STATISTICS_ROW_LIMIT);
  });

  it('supabase hata dönerse fırlatır', async () => {
    mockData = { data: null, error: { message: 'network error' } };
    await expect(getStatistics({})).rejects.toEqual({ message: 'network error' });
  });
});
