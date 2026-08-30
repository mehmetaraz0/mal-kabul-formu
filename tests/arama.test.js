import { describe, it, expect, vi, beforeEach } from 'vitest';

const listReceipts = vi.fn();
const listCompanies = vi.fn();
const listProducts = vi.fn();

vi.mock('../src/lib/receipts.js', () => ({
  listReceipts: (...a) => listReceipts(...a),
  getReceiptDetail: vi.fn()
}));
vi.mock('../src/lib/companies.js', () => ({ listCompanies: (...a) => listCompanies(...a) }));
vi.mock('../src/lib/products.js', () => ({ listProducts: (...a) => listProducts(...a) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn() }));

import { renderArama } from '../src/pages/arama.js';

const ROW = {
  id: 'r1',
  receipt_date: '2026-08-30',
  irsaliye_no: 'IRS-1',
  status: 'onaylandi',
  companies: { name: 'TEST FIRMA' },
  received_profile: { full_name: 'mehmet turan araz' }
};

async function render(rows = [ROW]) {
  listCompanies.mockResolvedValue([{ id: 'c1', name: 'TEST FIRMA' }]);
  listProducts.mockResolvedValue([{ id: 'p1', code: 'P1', name: 'DANA KIYMA' }]);
  listReceipts.mockResolvedValue(rows);
  const container = document.createElement('div');
  await renderArama(container);
  return container;
}

describe('arama sayfası — durum alanı kaldırıldı', () => {
  beforeEach(() => vi.clearAllMocks());

  it('durum filtresi render edilmez', async () => {
    const container = await render();
    expect(container.querySelector('#filter-status')).toBeNull();
  });

  it('tablo başlığında Durum sütunu yoktur', async () => {
    const container = await render();
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    expect(headers).not.toContain('Durum');
  });

  it('sonuç satırlarında durum rozeti gösterilmez', async () => {
    const container = await render();
    expect(container.querySelector('tbody .badge')).toBeNull();
    expect(container.querySelector('tbody').textContent).not.toContain('Onaylandı');
  });

  it('listReceipts çağrısına status filtresi gönderilmez', async () => {
    await render();
    expect(listReceipts).toHaveBeenCalledTimes(1);
    expect(listReceipts.mock.calls[0][0]).not.toHaveProperty('status');
  });

  it('boş sonuç satırının colspan değeri sütun sayısıyla eşleşir', async () => {
    const container = await render([]);
    const headerCount = container.querySelectorAll('thead th').length;
    expect(container.querySelector('tbody td').getAttribute('colspan')).toBe(String(headerCount));
  });
});

describe('arama sayfası — kalan filtreler (regresyon)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('firma ve ürün filtreleri yerinde kalır', async () => {
    const container = await render();
    expect(container.querySelector('#filter-company')).not.toBeNull();
    expect(container.querySelector('#filter-product')).not.toBeNull();
    expect(container.querySelectorAll('#filter-product option')).toHaveLength(2);
  });

  it('tarih aralığı filtreleri listReceipts’e geçirilir', async () => {
    const container = await render();
    container.querySelector('#filter-start').value = '2026-08-01';
    container.querySelector('#filter-end').value = '2026-08-31';
    listReceipts.mockClear();
    container.querySelector('#search-btn').click();
    await vi.waitFor(() => expect(listReceipts).toHaveBeenCalled());
    expect(listReceipts.mock.calls[0][0]).toMatchObject({ startDate: '2026-08-01', endDate: '2026-08-31' });
  });
});

describe('arama sayfası — telefon kart düzeni', () => {
  beforeEach(() => vi.clearAllMocks());

  // 640px altinda thead gizlenip her satir bir karta donusuyor. Etiketler CSS ::before ile
  // data-label'dan basildigi icin, data-label yanlis/eksikse kartta veri etiketsiz kalir.
  it('tablo stacked sinifi tasir', async () => {
    const container = await render();
    expect(container.querySelector('table.card-table.stacked')).not.toBeNull();
  });

  it('her veri hücresi thead başlığıyla birebir aynı data-label taşır', async () => {
    const container = await render();
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const cells = [...container.querySelectorAll('tbody tr:first-child td')];

    expect(cells).toHaveLength(headers.length);
    cells.forEach((td, i) => {
      // Son sutun (Cikti butonu) basliksiz; onun da data-label'i bos olmali.
      expect(td.getAttribute('data-label')).toBe(headers[i]);
    });
  });

  it('firma hücresi kart başlığı olarak işaretlenir', async () => {
    const container = await render();
    expect(container.querySelector('tbody td.card-title')).not.toBeNull();
    expect(container.querySelector('tbody td.card-title').textContent).toContain('TEST FIRMA');
  });
});
