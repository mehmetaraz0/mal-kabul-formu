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
    // Sinif adi `card-title` degil `stacked-title`: `card-title` global ad alaninda mevcut
    // `.card-header-title`'a bir kelime mesafedeydi; ileride yazilacak global bir `.card-title`
    // kurali masaustundeki Firma hucresini sessizce etkileyebilirdi.
    expect(container.querySelector('tbody td.card-title')).toBeNull();
    expect(container.querySelector('tbody td.stacked-title')).not.toBeNull();
    expect(container.querySelector('tbody td.stacked-title').textContent).toContain('TEST FIRMA');
  });

  // Onceki iddia pozisyoneldi: thead ve data-label ayni diziden uretildigi icin ikisi birlikte
  // kayarsa (ornegin RESULT_COLUMNS'ta iki sutun yer degistirir ama satir sablonu siralanmazsa)
  // test yesil kalirdi. Bu, etiketin DOGRU veriye bagli oldugunu dogruluyor.
  it('etiketler doğru değerlerle eşleşir (pozisyonel kayma regresyonu)', async () => {
    const container = await render();
    const bul = (etiket) => container.querySelector(`tbody td[data-label="${etiket}"]`).textContent.trim();

    expect(bul('Tarih')).toBe('2026-08-30');
    expect(bul('Kaydeden')).toBe('mehmet turan araz');
    expect(bul('İrsaliye No')).toBe('IRS-1');
  });

  // Kart basliginda ::before etiketi bilerek gizli (gorsel olarak baslik gibi dursun diye),
  // bu yuzden ekran okuyucu firma adini baglamsiz okuyordu. Gorsel olarak gizli bir etiket
  // bu boslugu kapatir.
  it('kart başlığı ekran okuyucu için etiketlenir', async () => {
    const container = await render();
    const baslik = container.querySelector('tbody td.stacked-title');
    const srEtiket = baslik.querySelector('.sr-only');

    expect(srEtiket).not.toBeNull();
    expect(srEtiket.textContent).toContain('Firma');
    expect(baslik.textContent).toContain('TEST FIRMA');
  });

  it('boş sonuç satırının colspan değeri RESULT_COLUMNS uzunluğundan türetilir', async () => {
    const container = await render([]);
    const basliklar = container.querySelectorAll('thead th').length;
    // Sabit "5" yerine turetilmis olmali: bir sutun eklenirse ikisi birlikte degismeli.
    expect(container.querySelector('tbody td').getAttribute('colspan')).toBe(String(basliklar));
    expect(basliklar).toBe(5);
  });
});

describe('arama sayfası — filtre çubuğu telefon genişliği', () => {
  beforeEach(() => vi.clearAllMocks());

  // Firma/Ürün alanlarında min-width+flex var, tarih alanlarında yoktu: flex-wrap'li konteynerde
  // tarih girdileri "Ara"/"Excel İndir" butonlarıyla aynı satıra sıkışıp gg.aa.yyyy metnini
  // gösteremeyecek kadar daralıyordu (gerçek cihazda yalnızca ok işareti görünüyordu).
  it('tarih filtreleri, firma filtresiyle aynı genişlik davranışını taşır', async () => {
    const container = await render();
    const firmaAlani = container.querySelector('#filter-company').parentElement;

    ['filter-start', 'filter-end'].forEach((id) => {
      const alan = container.querySelector(`#${id}`).parentElement;
      expect(alan.style.flex).toBe(firmaAlani.style.flex);
      expect(parseInt(alan.style.minWidth, 10)).toBeGreaterThanOrEqual(130);
    });
  });
});
