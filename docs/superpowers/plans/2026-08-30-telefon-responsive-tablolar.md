# Telefon Responsive Tablolar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telefon ekranlarında (≤640px) veri tablolarının yatay kaydırma gerektirmeden okunabilir olmasını sağlamak.

**Architecture:** Hibrit yaklaşım. Kayıt Ara — taranıp üzerine dokunulan bir liste — 640px altında karta dönüşür; satır hücreleri `data-label` taşır ve etiketler CSS `::before` ile basılır. Üç istatistik sayfası ve Kullanıcılar tablo yapısını korur ama sıkıştırılır; sayısal hücreler açık bir `num` sınıfıyla işaretlenip sağa hizalı ve `nowrap` tutulur, böylece Kg/Adet/Red rakamları alt alta karşılaştırılabilir kalır.

**Tech Stack:** Saf JavaScript (framework yok), Vite, Vitest + jsdom, el yazımı CSS (`src/style.css`).

**Spec:** `docs/superpowers/specs/2026-08-30-telefon-responsive-tablolar-design.md`

## Global Constraints

- Kırılma noktası **640px** — mevcut `.field-grid` kuralıyla aynı eşik, yeni eşik tanımlanmaz.
- Tüm yeni CSS kuralları `@media screen and (max-width: 640px)` altında olur; `@media print` çıktısı (`src/style-print.css`) etkilenmemeli.
- `src/pages/mal-kabul-ciktisi.js` **kapsam dışı** — A4 yatay resmi F.22 formu, bilerek geniş. Hiç dokunulmaz.
- Sayısal sütun tespiti konumdan (`:nth-child`) yapılmaz; açık `num` sınıfı kullanılır.
- Mevcut testler (`tests/arama.test.js`, `tests/kullanicilar.test.js`, `tests/statistics.test.js`) değişiklikten sonra da geçmeli.
- Her task sonunda `npm test` ve `npm run build` temiz olmalı.
- Türkçe kullanıcı arayüzü metinleri ve kod yorumları korunur.

---

### Task 1: İstatistik tablolarını sıkıştır ve sayısal sütunları işaretle

**Files:**
- Modify: `src/pages/istatistik.js` (tablo şablonu, `renderTable`)
- Modify: `src/pages/istatistik-urun-detay.js` (tablo şablonu)
- Modify: `src/pages/istatistik-firma-detay.js` (tablo şablonu)
- Modify: `src/style.css` (640px altı sıkıştırma kuralları)
- Test: `tests/istatistik-tablolar.test.js` (yeni)

**Interfaces:**
- Consumes: `getStatistics({startDate, endDate})` → `{ products, companies, truncated }`; satırlar `{ id, name, totalKg, totalAdet, rejectedCount }`. `getProductDetail(id, {startDate, endDate})` → `{ rows, truncated }`; satırlar `{ companyName, marka, totalKg, totalAdet, rejectedCount }`. `getCompanyDetail(id, {startDate, endDate})` → `{ rows, truncated }`; satırlar `{ productName, marka, totalKg, totalAdet, rejectedCount }`.
- Produces: `.num` sınıfı sözleşmesi — sayısal `th` ve `td` hücreleri bu sınıfı taşır. Task 3'teki CSS bloğu aynı `@media screen and (max-width: 640px)` sorgusunu paylaşır.

- [ ] **Step 1: Failing testi yaz**

`tests/istatistik-tablolar.test.js` dosyasını oluştur:

```javascript
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
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npx vitest run tests/istatistik-tablolar.test.js`
Expected: FAIL — `expected length 3, got 0` (henüz `num` sınıfı yok).

- [ ] **Step 3: `src/pages/istatistik.js` içindeki `renderTable`'a `num` sınıflarını ekle**

`<thead>` satırını değiştir:

```javascript
      <thead><tr><th>${nameLabel}</th><th class="num">Toplam Kg</th><th class="num">Toplam Adet</th><th class="num">Red Sayısı</th></tr></thead>
```

`<tbody>` içindeki üç sayısal hücreyi değiştir (isim hücresi dokunulmadan kalır):

```javascript
            <td class="num">${r.totalKg > 0 ? Math.round(r.totalKg * 100) / 100 : '-'}</td>
            <td class="num">${r.totalAdet > 0 ? Math.round(r.totalAdet * 100) / 100 : '-'}</td>
            <td class="num">${r.rejectedCount > 0 ? r.rejectedCount : '-'}</td>
```

- [ ] **Step 4: `src/pages/istatistik-urun-detay.js` tablosuna `num` sınıflarını ekle**

```javascript
            <thead><tr><th>Firma</th><th>Marka</th><th class="num">Toplam Kg</th><th class="num">Toplam Adet</th><th class="num">Red Sayısı</th></tr></thead>
```

```javascript
                  <td class="num">${r.totalKg > 0 ? Math.round(r.totalKg * 100) / 100 : '-'}</td>
                  <td class="num">${r.totalAdet > 0 ? Math.round(r.totalAdet * 100) / 100 : '-'}</td>
                  <td class="num">${r.rejectedCount > 0 ? r.rejectedCount : '-'}</td>
```

- [ ] **Step 5: `src/pages/istatistik-firma-detay.js` tablosuna `num` sınıflarını ekle**

```javascript
            <thead><tr><th>Ürün</th><th>Marka</th><th class="num">Toplam Kg</th><th class="num">Toplam Adet</th><th class="num">Red Sayısı</th></tr></thead>
```

```javascript
                  <td class="num">${r.totalKg > 0 ? Math.round(r.totalKg * 100) / 100 : '-'}</td>
                  <td class="num">${r.totalAdet > 0 ? Math.round(r.totalAdet * 100) / 100 : '-'}</td>
                  <td class="num">${r.rejectedCount > 0 ? r.rejectedCount : '-'}</td>
```

- [ ] **Step 6: Sıkıştırma CSS'ini `src/style.css`'e ekle**

`table.card-table td { ... }` bloğunun hemen ardına, `@media (min-width: 768px)` bloğundan ÖNCE ekle:

```css
/* Telefon: veri tabloları sıkıştırılır. Uzun firma/ürün adları alt satıra kayar; sayısal
   sütunlar sağa hizalı ve bölünmez kalır ki Kg/Adet/Red rakamları alt alta
   karşılaştırılabilsin (bkz. docs/superpowers/specs/2026-08-30-telefon-responsive-tablolar-design.md).
   `num` sınıfı bilerek kullanılıyor: sayısal sütunların konumu sayfadan sayfaya değiştiği
   için :nth-child tabanlı bir kural kırılgan olurdu. */
@media screen and (max-width: 640px) {
  table.card-table th { padding: 0.35rem 0.4rem; }
  table.card-table td {
    font-size: 0.85rem;
    padding: 0.35rem 0.4rem;
    word-break: break-word;
  }
  table.card-table .num {
    text-align: right;
    white-space: nowrap;
  }
}
```

- [ ] **Step 7: Testi tekrar çalıştır**

Run: `npx vitest run tests/istatistik-tablolar.test.js`
Expected: PASS (3/3).

- [ ] **Step 8: Tüm test paketini ve build'i çalıştır**

Run: `npm test`
Expected: PASS — mevcut `statistics.test.js` dahil hiçbir test kırılmamalı.

Run: `npm run build`
Expected: `built in ...`, hata yok.

- [ ] **Step 9: Commit**

```bash
git add src/pages/istatistik.js src/pages/istatistik-urun-detay.js src/pages/istatistik-firma-detay.js src/style.css tests/istatistik-tablolar.test.js
git commit -m "feat: istatistik tablolarini telefonda sikistir, sayisal sutunlari num sinifiyla isaretle"
```

---

### Task 2: Kullanıcılar tablosunu taşma sarmalayıcısına al

**Files:**
- Modify: `src/pages/kullanicilar.js:18` (tablo sarmalayıcısı)
- Test: `tests/kullanicilar.test.js` (mevcut dosyaya ekleme)

**Interfaces:**
- Consumes: Task 1'in `@media screen and (max-width: 640px)` bloğundaki `table.card-table` sıkıştırma kuralları — Kullanıcılar tablosu da `card-table` sınıfını kullandığı için ek CSS gerekmez.
- Produces: yok (yaprak task).

- [ ] **Step 1: Failing testi yaz**

`tests/kullanicilar.test.js` dosyasının sonuna ekle:

```javascript
describe('kullanicilar tablosu — telefon tasmasi', () => {
  beforeEach(() => vi.clearAllMocks());

  // Diger dort veri tablosu overflow-x:auto sarmalayicisi icinde; bu tablo degildi ve
  // uzun "Kendi hesabiniz — rolunuzu buradan degistiremezsiniz" metni dar ekranda sayfanin
  // TAMAMINI yana tasiyabiliyordu. Sarmalayici tasmayi tablonun kendi kutusuna hapseder.
  it('tablo overflow-x:auto sarmalayicisi icinde render edilir', async () => {
    listUsers.mockResolvedValue([{ id: 'u1', full_name: 'Test Kullanici', role: 'depo_yonetici' }]);
    getCurrentProfile.mockResolvedValue({ id: 'admin1', full_name: 'Admin', role: 'admin' });

    const container = document.createElement('div');
    await renderKullanicilar(container);

    const table = container.querySelector('table.card-table');
    expect(table).not.toBeNull();
    expect(table.parentElement.style.overflowX).toBe('auto');
  });
});
```

**Not:** Bu adların hepsi dosyanın en üstünde zaten mevcut — doğrulandı: `tests/kullanicilar.test.js:3` `vi.hoisted` ile `listUsers`, `updateUserRole`, `createUser`, `getCurrentProfile` mock'luyor; satır 13 `renderKullanicilar`'ı import ediyor; satır 1 `describe/it/expect/vi/beforeEach` import ediyor. Yeni mock veya import EKLEME, sadece yukarıdaki `describe` bloğunu dosyanın sonuna ekle.

`renderKullanicilar` içinde rol kapısı yoktur (`src/pages/kullanicilar.js:11-13` doğrudan `listUsers()` + `getCurrentProfile()` çağırır), bu yüzden testteki profil rolü tabloyu etkilemez.

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npx vitest run tests/kullanicilar.test.js`
Expected: FAIL — `expected '' to be 'auto'` (tablonun ebeveyni `.card`, sarmalayıcı yok).

- [ ] **Step 3: `src/pages/kullanicilar.js`'te tabloyu sarmala**

`<table class="card-table">` ile onu kapatan `</table>` etiketini bir `div` içine al. Mevcut girinti korunur:

```javascript
      <div style="overflow-x:auto;">
      <table class="card-table">
        <thead><tr><th>Ad Soyad</th><th>Rol</th></tr></thead>
```

ve tablonun kapanışından sonra sarmalayıcıyı kapat:

```javascript
      </table>
      </div>
```

- [ ] **Step 4: Testi tekrar çalıştır**

Run: `npx vitest run tests/kullanicilar.test.js`
Expected: PASS — yeni test dahil dosyadaki tüm testler.

- [ ] **Step 5: Tüm test paketini ve build'i çalıştır**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: `built in ...`, hata yok.

- [ ] **Step 6: Commit**

```bash
git add src/pages/kullanicilar.js tests/kullanicilar.test.js
git commit -m "fix: kullanicilar tablosunu overflow sarmalayicisina al (telefonda sayfayi yana tasiyordu)"
```

---

### Task 3: Kayıt Ara sonuç tablosunu telefonda karta çevir

**Files:**
- Modify: `src/pages/arama.js:35` (tablo etiketi), `src/pages/arama.js:64-74` (satır şablonu)
- Modify: `src/style.css` (Task 1'de eklenen 640px bloğunun içine kart kuralları)
- Test: `tests/arama.test.js` (mevcut dosyaya ekleme)

**Interfaces:**
- Consumes: Task 1'in `@media screen and (max-width: 640px)` bloğu — kart kuralları aynı bloğun içine yazılır, ikinci bir media sorgusu açılmaz.
- Produces: yok (yaprak task).

- [ ] **Step 1: Failing testi yaz**

`tests/arama.test.js` dosyasının sonuna ekle:

```javascript
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
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npx vitest run tests/arama.test.js`
Expected: FAIL — üç testin üçü de (`stacked` sınıfı, `data-label`, `card-title` yok).

- [ ] **Step 3: `src/pages/arama.js`'te başlıkları tek kaynağa çıkar**

`renderArama` fonksiyonunun DIŞINA, dosyanın üst kısmına ekle:

```javascript
// Tablo başlıkları tek yerde: hem <thead> hem de telefon kart düzeninin data-label'ları
// buradan üretilir. Ayrı ayrı yazılsalardı biri değiştiğinde diğeri sessizce eskirdi.
const RESULT_COLUMNS = ['Tarih', 'Firma', 'Kaydeden', 'İrsaliye No', ''];
```

- [ ] **Step 4: `<thead>` satırını bu diziden üret**

`src/pages/arama.js:35` civarındaki tablo bloğunu değiştir:

```javascript
        <table class="card-table stacked">
          <thead><tr>${RESULT_COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
```

- [ ] **Step 5: Satır şablonuna `data-label` ve `card-title` ekle**

`runSearch` içindeki `tbody.innerHTML` atamasını değiştir:

```javascript
      tbody.innerHTML = lastResults
        .map(
          (r) => `<tr>
            <td data-label="${escapeHtml(RESULT_COLUMNS[0])}">${escapeHtml(r.receipt_date)}</td>
            <td data-label="${escapeHtml(RESULT_COLUMNS[1])}" class="card-title">${escapeHtml(r.companies.name)}</td>
            <td data-label="${escapeHtml(RESULT_COLUMNS[2])}">${escapeHtml(r.received_profile?.full_name || '-')}</td>
            <td data-label="${escapeHtml(RESULT_COLUMNS[3])}">${escapeHtml(r.irsaliye_no || '-')}</td>
            <td data-label="${escapeHtml(RESULT_COLUMNS[4])}"><button data-view="${escapeHtml(r.id)}">Çıktı</button></td>
          </tr>`
        )
        .join('');
```

- [ ] **Step 6: Kart CSS'ini `src/style.css`'e ekle**

Task 1'de eklenen `@media screen and (max-width: 640px)` bloğunun İÇİNE, `.num` kuralından sonra ekle:

```css
  /* Kayıt Ara: satırlar karta dönüşür. Bu tablo taranıp üzerine dokunulan bir liste —
     satırlar arası karşılaştırma yapılmadığı için tablo hizalamasını korumaya gerek yok. */
  table.card-table.stacked,
  table.card-table.stacked tbody,
  table.card-table.stacked tr,
  table.card-table.stacked td {
    display: block;
    width: 100%;
  }
  table.card-table.stacked thead { display: none; }
  table.card-table.stacked tr {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: 0.75rem;
    margin-bottom: 0.75rem;
  }
  table.card-table.stacked td {
    border-bottom: none;
    padding: 0.2rem 0;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  table.card-table.stacked td::before {
    content: attr(data-label);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-label);
    flex-shrink: 0;
  }
  /* Firma adı kartın başlığı: etiketsiz, tam genişlik, vurgulu. */
  table.card-table.stacked td.card-title {
    display: block;
    font-weight: 700;
    font-size: 1rem;
    margin-bottom: 0.4rem;
  }
  table.card-table.stacked td.card-title::before { content: none; }
  /* Çıktı butonu: etiketi boş, tam genişlik. */
  table.card-table.stacked td:last-child { padding-top: 0.6rem; }
  table.card-table.stacked td:last-child::before { content: none; }
  table.card-table.stacked td:last-child button { width: 100%; }
  /* "Sonuç bulunamadı" tek hücreli satır kart gibi görünmesin. */
  table.card-table.stacked td[colspan]::before { content: none; }
```

- [ ] **Step 7: Testi tekrar çalıştır**

Run: `npx vitest run tests/arama.test.js`
Expected: PASS — yeni üç test ve mevcut testlerin tamamı.

- [ ] **Step 8: Tüm test paketini ve build'i çalıştır**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: `built in ...`, hata yok.

- [ ] **Step 9: Commit**

```bash
git add src/pages/arama.js src/style.css tests/arama.test.js
git commit -m "feat: kayit ara sonuc tablosunu telefonda kart duzenine cevir"
```

---

### Task 4: Görsel doğrulama ve yazdırma regresyon kontrolü

**Files:**
- Create: `tmp-responsive-onizleme.html` (geçici, task sonunda silinir)

**Interfaces:**
- Consumes: Task 1-3'te eklenen tüm CSS kuralları.
- Produces: yok (doğrulama task'ı).

**Neden geçici bir HTML dosyası:** Bu sayfalar giriş gerektiriyor ve asistan şifre giremiyor (bkz. `docs/PROJE-DURUMU.md`, kural 4), yani gerçek sayfalar tarayıcıda açılamıyor. `src/style.css`'i sabit örnek işaretlemeyle birlikte yükleyen bağımsız bir dosya, CSS kurallarının 375px'te gerçekten çalıştığını görmenin tek yolu.

- [ ] **Step 1: Geçici önizleme dosyasını oluştur**

Proje kökünde `tmp-responsive-onizleme.html`:

```html
<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/src/style.css" />
    <title>Responsive Önizleme</title>
  </head>
  <body>
    <div id="app" style="padding:1rem;">
      <div class="card">
        <div class="card-header"><div class="card-header-title">Kayıt Ara (stacked)</div></div>
        <div style="overflow-x:auto;">
          <table class="card-table stacked">
            <thead><tr><th>Tarih</th><th>Firma</th><th>Kaydeden</th><th>İrsaliye No</th><th></th></tr></thead>
            <tbody>
              <tr>
                <td data-label="Tarih">2026-08-30</td>
                <td data-label="Firma" class="card-title">4S DENIZ URUNLERI GIDA SAN.TIC.A.S.</td>
                <td data-label="Kaydeden">mehmet turan araz</td>
                <td data-label="İrsaliye No">IRS-12345</td>
                <td data-label=""><button>Çıktı</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-header-title">İstatistik (sıkıştırılmış)</div></div>
        <div style="overflow-x:auto;">
          <table class="card-table">
            <thead><tr><th>Ürün Adı</th><th class="num">Toplam Kg</th><th class="num">Toplam Adet</th><th class="num">Red Sayısı</th></tr></thead>
            <tbody>
              <tr>
                <td>YIY02000011 — ALABALIK PORSIYONLUK SOKLU-200</td>
                <td class="num">1234.56</td>
                <td class="num">-</td>
                <td class="num">3</td>
              </tr>
              <tr>
                <td>YIY02000072 — BARBUN TAVALIK</td>
                <td class="num">7.5</td>
                <td class="num">12</td>
                <td class="num">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Dev sunucusunu başlat ve önizlemeyi aç**

`.claude/launch.json`'daki `dev` yapılandırmasıyla preview başlat, ardından `http://localhost:5173/tmp-responsive-onizleme.html` adresine git.

- [ ] **Step 3: 375px genişlikte kontrol et**

Görünümü mobil ölçüye al (375×812) ve şunları doğrula:

- Kayıt Ara tablosu kart görünümünde: başlık satırı görünmüyor, firma adı kalın ve tam satır, diğer alanlar `ETİKET ... değer` biçiminde, Çıktı butonu tam genişlik
- İstatistik tablosunda Kg / Adet / Red sütunları **sağa hizalı ve aynı hizada**; uzun ürün adı alt satıra kayıyor
- **Sayfa gövdesi yatay kaymıyor:** `document.documentElement.scrollWidth <= window.innerWidth` doğru olmalı

- [ ] **Step 4: Masaüstü genişliğinde regresyon kontrolü**

Görünümü 1280px'e al ve doğrula:

- Kayıt Ara tekrar normal tablo (başlık satırı görünür, hücreler yan yana)
- İstatistik tablosunda hücre boşlukları eski haline döndü

- [ ] **Step 5: Yazdırma çıktısının etkilenmediğini doğrula**

`src/style.css`'te eklenen blokların tamamının `@media screen and (max-width: 640px)` içinde olduğunu doğrula:

Run: `grep -n "max-width: 640px" src/style.css`

Expected: **tam olarak iki eşleşme**

1. `@media (max-width: 640px) {` — `.field-grid` için var olan ESKİ kural (`src/style.css:99` civarı). `screen` niteleyicisi yok; bu bu task'ın kapsamı dışında ve DEĞİŞTİRİLMEZ.
2. `@media screen and (max-width: 640px) {` — bu planda eklenen YENİ tablo bloğu. `screen` niteleyicisi mutlaka bulunmalı.

Üçüncü bir eşleşme varsa, Task 3'ün kart kuralları yanlışlıkla ikinci bir media sorgusu açmış demektir — Task 1'in bloğuyla birleştir.

- [ ] **Step 6: Geçici dosyayı sil**

```bash
rm tmp-responsive-onizleme.html
```

- [ ] **Step 7: Son kontrol ve commit**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: `built in ...`, hata yok.

Run: `git status --porcelain`
Expected: `tmp-responsive-onizleme.html` listede OLMAMALI (silindi).

Bu task kod değişikliği üretmezse commit gerekmez. Doğrulama sırasında bir CSS düzeltmesi gerektiyse:

```bash
git add src/style.css
git commit -m "fix: telefon tablo kurallarinda gorsel dogrulama duzeltmeleri"
```

---

## Bu Plan Tamamlandığında Doğrulanacaklar

- Telefonda (≤640px) Kayıt Ara sonuçları kart olarak görünüyor, yatay kaydırma gerekmiyor
- Üç istatistik sayfasında Kg / Adet / Red rakamları sağa hizalı ve alt alta karşılaştırılabilir
- Kullanıcılar tablosu sayfayı yana taşımıyor
- Masaüstü ve tablet görünümü değişmedi
- Mal Kabul Çıktısı (F.22) ve yazdırma çıktısı hiç etkilenmedi
- `npm test` ve `npm run build` temiz
- Gerçek cihaz doğrulaması kullanıcıya bırakıldı (asistan giriş yapamıyor)
