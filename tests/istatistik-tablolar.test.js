import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getStatistics, getProductDetail, getCompanyDetail, navigate, getQueryParam } = vi.hoisted(() => ({
  getStatistics: vi.fn(),
  getProductDetail: vi.fn(),
  getCompanyDetail: vi.fn(),
  navigate: vi.fn(),
  getQueryParam: vi.fn()
}));

vi.mock('../src/lib/statistics.js', () => ({ getStatistics, getProductDetail, getCompanyDetail }));
vi.mock('../src/router.js', () => ({ navigate, getQueryParam }));

import { renderIstatistik } from '../src/pages/istatistik.js';
import { renderIstatistikUrunDetay } from '../src/pages/istatistik-urun-detay.js';
import { renderIstatistikFirmaDetay } from '../src/pages/istatistik-firma-detay.js';

// Sayisal sutunlarin telefonda saga hizali ve bolunmez kalmasi CSS ile yapiliyor, ama CSS'in
// hangi hucreleri hedefleyecegi bu `num` sinifina bagli. jsdom CSS uygulamadigi icin
// dogrulayabilecegimiz (ve regresyona karsi korumamiz gereken) sey sinifin varligi.
describe('istatistik tablolari — sayisal sutun isaretlemesi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ana istatistik tablosunda 3 sayisal baslik ve 3 sayisal hucre num sinifi tasir', async () => {
    getStatistics.mockResolvedValue({
      products: [{ id: 'p1', name: 'ALABALIK', totalKg: 12.5, totalAdet: 0, rejectedCount: 1 }],
      companies: [],
      truncated: false
    });
    const container = document.createElement('div');
    await renderIstatistik(container);

    const products = container.querySelector('#istatistik-products');
    expect(products.querySelectorAll('th.num')).toHaveLength(3);
    expect(products.querySelectorAll('tbody td.num')).toHaveLength(3);
    // Ilk sutun (isim) sayisal DEGIL — kalan genisligi alip alt satira kaymali.
    expect(products.querySelector('tbody td').classList.contains('num')).toBe(false);
  });

  it('urun detay tablosunda sayisal sutunlar num sinifi tasir', async () => {
    getQueryParam.mockImplementation((k) => (k === 'id' ? 'p1' : null));
    getProductDetail.mockResolvedValue({
      rows: [{ companyName: 'TEST FIRMA', marka: 'MARKA', totalKg: 3, totalAdet: 0, rejectedCount: 0 }],
      truncated: false
    });
    const container = document.createElement('div');
    await renderIstatistikUrunDetay(container);

    expect(container.querySelectorAll('th.num')).toHaveLength(3);
    expect(container.querySelectorAll('tbody td.num')).toHaveLength(3);
  });

  it('firma detay tablosunda sayisal sutunlar num sinifi tasir', async () => {
    getQueryParam.mockImplementation((k) => (k === 'id' ? 'c1' : null));
    getCompanyDetail.mockResolvedValue({
      rows: [{ productName: 'ALABALIK', marka: 'MARKA', totalKg: 3, totalAdet: 0, rejectedCount: 0 }],
      truncated: false
    });
    const container = document.createElement('div');
    await renderIstatistikFirmaDetay(container);

    expect(container.querySelectorAll('th.num')).toHaveLength(3);
    expect(container.querySelectorAll('tbody td.num')).toHaveLength(3);
  });
});
