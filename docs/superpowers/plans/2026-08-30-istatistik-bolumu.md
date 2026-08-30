# İstatistik Bölümü Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ürün ve firma bazında toplam kg/adet alım ile red edilen kalem sayısını gösteren, üç rolün de (admin/depo_yonetici/kalite_ekibi) erişebildiği, tarih aralığıyla filtrelenebilen yeni bir "İstatistik" bölümü eklemek.

**Architecture:** Tek bir Supabase sorgusuyla (`receipt_items` üzerinden `products`/`receipts!inner(companies)` embed'iyle) tarih aralığındaki tüm kalemler çekilir, istemci tarafında (JS) ürün ve firma bazında kg/adet toplamı ve red sayısı hesaplanır. `Kayıt Ara`'nın 500 kayıtlık üst sınırından farklı olarak (o bir liste, bu bir toplam), ayrı ve çok daha yüksek bir güvenlik sınırı kullanılır; sınıra takılırsa arayüzde görünür bir uyarı gösterilir.

**Tech Stack:** Vite + vanilla JS (mevcut proje), Supabase (PostgREST embedded-resource filtreleme), Vitest.

## Global Constraints

- Tasarım belgesi: `docs/superpowers/specs/2026-08-30-istatistik-bolumu-design.md` — bu planın tüm kararları oradan gelir.
- Erişim: `/istatistik` route'u ve nav pill'i KOŞULSUZ — admin, depo_yonetici, kalite_ekibi hepsi görür (Kayıt Ara ile aynı, rol filtresi yok).
- Kg ve adet ayrı sütunlarda tutulur, birbirine toplanmaz.
- "Red Sayısı": `receipt_items.uygunluk = 'uygun_degil'` olan satırların sayısı (tarih filtresi dahilinde).
- Varsayılan sıralama: her iki tabloda da Toplam Kg'ye göre azalan.
- Güvenlik satır sınırı: 10000 (bkz. tasarım belgesi "Açık Sorular"). Dönen satır sayısı tam bu sınıra eşitse `truncated: true` döner ve arayüzde uyarı gösterilir.
- Bu projedeki `arama.js`/`firmalar.js` gibi basit sayfalar için dedike bir sayfa-testi dosyası yok — aynı desen `istatistik.js` için de geçerli (canlı doğrulama yeterli).

---

## Task 1: Veri Katmanı — `src/lib/statistics.js`

**Files:**
- Create: `src/lib/statistics.js`
- Test: `tests/statistics.test.js`

**Interfaces:**
- Consumes: `supabase` client'ı (`src/lib/supabase.js`).
- Produces: `getStatistics({ startDate, endDate } = {}) → Promise<{ products: Array<{id, name, totalKg, totalAdet, rejectedCount}>, companies: Array<{id, name, totalKg, totalAdet, rejectedCount}>, truncated: boolean }>`, `STATISTICS_ROW_LIMIT` (sabit, testte kullanılacak) — Task 2'nin `istatistik.js`'i bu fonksiyonu doğrudan çağıracak.

- [ ] **Step 1: Başarısız testleri yaz**

`tests/statistics.test.js` (yeni dosya):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = {
  select: vi.fn(function () { return this; }),
  gte: vi.fn(function () { return this; }),
  lte: vi.fn(function () { return this; }),
  limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
};

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
    vi.clearAllMocks();
    query.limit.mockResolvedValue({ data: [], error: null });
  });

  it('aynı ürüne ait birden fazla satırın kg toplamını doğru hesaplar', async () => {
    query.limit.mockResolvedValueOnce({
      data: [
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 5, uygunluk: 'uygun' }),
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 3, uygunluk: 'uygun' })
      ],
      error: null
    });
    const { products } = await getStatistics({});
    expect(products).toHaveLength(1);
    expect(products[0].totalKg).toBe(8);
    expect(products[0].totalAdet).toBe(0);
  });

  it('kg ve adet birimlerini ayrı sütunlarda tutar, birbirine toplamaz', async () => {
    query.limit.mockResolvedValueOnce({
      data: [
        row({ productId: 1, productName: 'YUMURTA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 5, uygunluk: 'uygun' }),
        row({ productId: 1, productName: 'YUMURTA', companyId: 10, companyName: 'FIRMA A', unit: 'ad', quantity: 30, uygunluk: 'uygun' })
      ],
      error: null
    });
    const { products } = await getStatistics({});
    expect(products[0].totalKg).toBe(5);
    expect(products[0].totalAdet).toBe(30);
  });

  it('firma bazında da doğru toplar (farklı ürünler, aynı firma)', async () => {
    query.limit.mockResolvedValueOnce({
      data: [
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 5, uygunluk: 'uygun' }),
        row({ productId: 2, productName: 'TAVUK', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 4, uygunluk: 'uygun' })
      ],
      error: null
    });
    const { companies } = await getStatistics({});
    expect(companies).toHaveLength(1);
    expect(companies[0].totalKg).toBe(9);
  });

  it('sadece uygunluk="uygun_degil" olan satırları red sayısına dahil eder', async () => {
    query.limit.mockResolvedValueOnce({
      data: [
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 5, uygunluk: 'uygun_degil' }),
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 3, uygunluk: 'uygun' }),
        row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 2, uygunluk: 'beklemede' })
      ],
      error: null
    });
    const { products, companies } = await getStatistics({});
    expect(products[0].rejectedCount).toBe(1);
    expect(companies[0].rejectedCount).toBe(1);
  });

  it('sonuçları Toplam Kg\'ye göre azalan sıralar (hem ürün hem firma)', async () => {
    query.limit.mockResolvedValueOnce({
      data: [
        row({ productId: 1, productName: 'AZ', companyId: 10, companyName: 'AZ FIRMA', unit: 'kg', quantity: 2, uygunluk: 'uygun' }),
        row({ productId: 2, productName: 'COK', companyId: 20, companyName: 'COK FIRMA', unit: 'kg', quantity: 50, uygunluk: 'uygun' })
      ],
      error: null
    });
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

  it('dönen satır sayısı tam STATISTICS_ROW_LIMIT\'e eşitse truncated=true döner', async () => {
    const data = Array.from({ length: STATISTICS_ROW_LIMIT }, (_, i) =>
      row({ productId: i, productName: 'P' + i, companyId: i, companyName: 'C' + i, unit: 'kg', quantity: 1, uygunluk: 'uygun' })
    );
    query.limit.mockResolvedValueOnce({ data, error: null });
    const { truncated } = await getStatistics({});
    expect(truncated).toBe(true);
  });

  it('dönen satır sayısı limitin altındaysa truncated=false döner', async () => {
    query.limit.mockResolvedValueOnce({
      data: [row({ productId: 1, productName: 'DANA', companyId: 10, companyName: 'FIRMA A', unit: 'kg', quantity: 5, uygunluk: 'uygun' })],
      error: null
    });
    const { truncated } = await getStatistics({});
    expect(truncated).toBe(false);
  });
});
```

- [ ] **Step 2: Testi çalıştır, `Cannot find module '../src/lib/statistics.js'` ile FAIL ettiğini doğrula**

Run: `npm run test -- tests/statistics.test.js`
Expected: FAIL — dosya henüz yok.

- [ ] **Step 3: `src/lib/statistics.js`'i uygula**

```js
import { supabase } from './supabase.js';

// Kayıt Ara'nın 500 kayıtlık üst sınırından bilerek FARKLI ve çok daha yüksek: o bir liste
// sınırı (kullanıcı en son N kaydı görür, sorun değil), bu ise bir TOPLAM — sessizce eksik
// toplanması yanlış sonuç üretir. Bu yüzden sınıra gerçekten takılırsa (dönen satır sayısı tam
// bu değere eşitse) `truncated: true` ile açıkça işaretlenir, sessizce yanlış sayı dönülmez.
export const STATISTICS_ROW_LIMIT = 10000;

export async function getStatistics({ startDate, endDate } = {}) {
  // Tarih filtresi embed edilen `receipts` kaynağı üzerinden uygulanıyor — PostgREST'in
  // desteklediği standart bir desen, `receipts!inner(...)` join'i zorunlu kılıyor (aksi halde
  // `receipts.receipt_date` filtresi tanımsız bir sütuna işaret eder).
  let query = supabase
    .from('receipt_items')
    .select('product_id, quantity, unit, uygunluk, products (name), receipts!inner (receipt_date, company_id, companies (id, name))')
    .limit(STATISTICS_ROW_LIMIT);
  if (startDate) query = query.gte('receipts.receipt_date', startDate);
  if (endDate) query = query.lte('receipts.receipt_date', endDate);

  const { data, error } = await query;
  if (error) throw error;

  const productMap = new Map();
  const companyMap = new Map();

  for (const item of data) {
    const isRejected = item.uygunluk === 'uygun_degil';
    const kg = item.unit === 'kg' ? Number(item.quantity) : 0;
    const adet = item.unit === 'ad' ? Number(item.quantity) : 0;

    const productId = item.product_id;
    if (!productMap.has(productId)) {
      productMap.set(productId, { id: productId, name: item.products?.name || '-', totalKg: 0, totalAdet: 0, rejectedCount: 0 });
    }
    const product = productMap.get(productId);
    product.totalKg += kg;
    product.totalAdet += adet;
    if (isRejected) product.rejectedCount += 1;

    const companyId = item.receipts?.company_id;
    if (companyId != null) {
      if (!companyMap.has(companyId)) {
        companyMap.set(companyId, {
          id: companyId,
          name: item.receipts.companies?.name || '-',
          totalKg: 0,
          totalAdet: 0,
          rejectedCount: 0
        });
      }
      const company = companyMap.get(companyId);
      company.totalKg += kg;
      company.totalAdet += adet;
      if (isRejected) company.rejectedCount += 1;
    }
  }

  const byKgDesc = (a, b) => b.totalKg - a.totalKg;
  return {
    products: [...productMap.values()].sort(byKgDesc),
    companies: [...companyMap.values()].sort(byKgDesc),
    truncated: data.length === STATISTICS_ROW_LIMIT
  };
}
```

- [ ] **Step 4: Testi çalıştır, PASS ettiğini doğrula**

Run: `npm run test -- tests/statistics.test.js`
Expected: PASS (9/9 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/statistics.js tests/statistics.test.js
git commit -m "feat: istatistik veri katmanini ekle (urun/firma bazinda kg/adet/red toplami)"
```

---

## Task 2: Sayfa — `src/pages/istatistik.js` + Nav/Route Bağlama

**Files:**
- Create: `src/pages/istatistik.js`
- Modify: `src/main.js:9` (import), `src/main.js:140` (nav pill), `src/main.js:169` (route kaydı)

**Interfaces:**
- Consumes: `getStatistics({startDate, endDate})` (Task 1).
- Produces: `renderIstatistik(container)` — `main.js` bunu `/istatistik` route'una bağlar.

- [ ] **Step 1: `src/pages/istatistik.js`'i yaz**

```js
import { getStatistics } from '../lib/statistics.js';
import { escapeHtml } from '../lib/html.js';

function renderTable(rows, nameLabel) {
  if (rows.length === 0) return '<p>Kayıt bulunamadı.</p>';
  return `
    <table class="card-table">
      <thead><tr><th>${nameLabel}</th><th>Toplam Kg</th><th>Toplam Adet</th><th>Red Sayısı</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(r.name)}</td>
            <td>${r.totalKg > 0 ? r.totalKg : '-'}</td>
            <td>${r.totalAdet > 0 ? r.totalAdet : '-'}</td>
            <td>${r.rejectedCount > 0 ? r.rejectedCount : '-'}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

export async function renderIstatistik(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">📊 İstatistik</div></div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:end;">
        <div class="field"><label class="field-label" for="istatistik-start">Başlangıç</label><input type="date" id="istatistik-start" /></div>
        <div class="field"><label class="field-label" for="istatistik-end">Bitiş</label><input type="date" id="istatistik-end" /></div>
        <div class="field" style="justify-content:end;"><button id="istatistik-filter-btn">Filtrele</button></div>
      </div>
    </div>
    <p id="istatistik-msg"></p>
    <div class="card">
      <div class="card-header"><div class="card-header-title">Ürün Bazlı</div></div>
      <div id="istatistik-products"></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-header-title">Firma Bazlı</div></div>
      <div id="istatistik-companies"></div>
    </div>
  `;

  async function load() {
    const msg = container.querySelector('#istatistik-msg');
    msg.textContent = '';
    try {
      const startDate = container.querySelector('#istatistik-start').value || undefined;
      const endDate = container.querySelector('#istatistik-end').value || undefined;
      const { products, companies, truncated } = await getStatistics({ startDate, endDate });
      container.querySelector('#istatistik-products').innerHTML = renderTable(products, 'Ürün Adı');
      container.querySelector('#istatistik-companies').innerHTML = renderTable(companies, 'Firma Adı');
      if (truncated) {
        msg.style.color = '#a15c00';
        msg.textContent = 'Çok fazla kayıt var, sonuçlar eksik olabilir — tarih aralığını daraltın.';
      }
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    }
  }

  container.querySelector('#istatistik-filter-btn').addEventListener('click', load);
  await load();
}
```

- [ ] **Step 2: `main.js`'e nav pill'i ve route'u bağla**

`src/main.js:9` (import bloğu, `renderArama` import satırının altına) ekle:
```js
import { renderIstatistik } from './pages/istatistik.js';
```

`src/main.js:140` (`<button class="pill-tab" data-nav="/arama">Kayıt Ara</button>` satırının hemen altına, koşulsuz — üç rol de görür):
```js
        <button class="pill-tab" data-nav="/istatistik">İstatistik</button>
```

`src/main.js:169` (`registerRoute('/arama', renderArama);` satırının hemen altına, koşulsuz):
```js
    registerRoute('/istatistik', renderIstatistik);
```

- [ ] **Step 3: Build ile derleme hatasını kontrol et**

Bu sayfa için (arama.js/firmalar.js gibi diğer basit sayfalarla tutarlı olarak) dedike bir test
dosyası yazılmıyor — `npm run build`'in temiz geçmesi ve canlıda görsel doğrulama yeterli.

Run: `npm run build`
Expected: hatasız derleme.

- [ ] **Step 4: Tüm test paketini çalıştır**

Run: `npm run test`
Expected: tüm testler PASS (regresyon yok).

- [ ] **Step 5: Commit**

```bash
git add src/pages/istatistik.js src/main.js
git commit -m "feat: istatistik sayfasini ekle ve nav/route'a bagla"
```

---

## Task 3: Uçtan Uca Canlı Doğrulama

**Files:** yok (sadece doğrulama, kod değişikliği yok)

**Interfaces:** yok.

- [ ] **Step 1: `npm run build` ve `npm run test` ile son durumu doğrula**

Run: `npm run build && npm run test`
Expected: ikisi de temiz/PASS.

- [ ] **Step 2: Canlıda (veya kullanıcıdan) doğrulama iste**

- `/istatistik` sayfası üç rolün de (admin, depo_yonetici, kalite_ekibi) nav'ında görünüyor ve
  açılıyor.
- Tarih aralığı filtresi olmadan tüm zamanların toplamı gösteriliyor; bir tarih aralığı
  seçildiğinde sadece o aralıktaki kayıtlar hesaba katılıyor (ör. bilinen bir kaydın tarihini
  aralık dışına alınca o ürünün/firmanın toplamından düşmesi beklenir).
- Kg ve adet sütunları doğru ayrışıyor (kg birimli bir ürün Toplam Adet'te "-" gösteriyor, tersi
  de geçerli).
- Uygunluk'u "Uygun Değil" işaretlenmiş en az bir test kaydı için Red Sayısı doğru artıyor.
- Sıralama Toplam Kg'ye göre azalan.

- [ ] **Step 3: Bulunan sorunları düzelt, ilgili task'ın testini güncelleyip tekrar çalıştır**
