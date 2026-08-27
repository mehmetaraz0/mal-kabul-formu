# Arama, Yazdırılabilir Çıktı ve PDF/CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Geçmiş mal kabul kayıtlarını firma/tarih aralığı/ürün/durum filtreleriyle aratabilmek ("kayıt arama özelliği"); tek bir mal kabul kaydını, kağıt formu andıran, sayfa başına 13 satır ile bölünen yazdırılabilir/PDF çıktı olarak üretmek; seçilen tarih aralığındaki kayıtları toplu CSV olarak dışa aktarmak.

**Architecture:** `src/lib/receipts.js` içine eklenecek `listReceipts(filters)` fonksiyonu arama sayfasının (`src/pages/arama.js`) veri kaynağıdır. Çıktı sayfası (`src/pages/mal-kabul-ciktisi.js`) tek bir kaydı, satırları `paginateRows` ile 13'erli gruplara bölerek her grubu ayrı bir `.print-page` bloğunda render eder; tarayıcının yazdırma diyaloğu (`window.print()`) ve `html2pdf.js` bu bloklar üzerinden PDF üretir. CSV export saf bir `toCsv` fonksiyonuyla (framework'ten bağımsız, test edilebilir) üretilir.

**Tech Stack:** Plan 1-3'ün üzerine inşa edilir. Yeni bağımlılık: `html2pdf.js` (istemci tarafı, tek tıkla PDF indirme için).

## Global Constraints

- **Kritik varsayım (kullanıcıya doğrulatılmalı):** Gerçek kağıt "Mal Kabul Formu" şablonu (logo, tam sütun/satır yerleşimi) bu plan yazılırken elde değildi. Bu plan, kullanıcının belirttiği "13 satır/sayfa" kuralını ve önceki mesajlarda talep edilen alanları (Firma, Tarih, Ürün, Miktar, Birim, İrsaliye/Sipariş No, Kalite Kontrol alanları, Teslim Alan/Kontrol Eden personel) uygulayan **genel bir tablo düzeni** kullanır; "KASAP SİPARİŞ FORMU" görselinin tablo/başlık stilinden ilham alır. Gerçek şablon (fotoğraf/PDF/Excel + logo dosyası) elde edildiğinde bu plandaki `mal-kabul-ciktisi.js` sayfasının CSS/HTML'i o şablona birebir uyacak şekilde güncellenmelidir — bu bir takip görevi olarak不 (nottur), otomatik yapılmaz.
- Sayfa başına satır sayısı sabit bir değişkende tutulur (`ROWS_PER_PAGE = 13`), tek satırdan değiştirilebilir olacak şekilde.
- CSV export Excel ile uyumlu olması için UTF-8 BOM ile ve noktalı virgül (`;`) ayraçla üretilir (Türkçe Excel varsayılan ayracı).
- PDF/print çıktısı sadece görüntüleme ekranındaki elemanları değil, `.print-page` bloklarını gösterir; ekran arayüzü (menü, arama kutuları) `@media print` ile gizlenir.

---

## Dosya Yapısı

```
src/
  lib/
    receipts.js            # (mevcut dosyaya ekleme) listReceipts(filters)
    csv.js                   # toCsv, downloadCsv
    pagination.js             # paginateRows
  pages/
    arama.js                  # filtre formu + sonuç tablosu + CSV export
    mal-kabul-ciktisi.js        # tek kayıt için yazdırılabilir/PDF çıktı
  style-print.css              # @media print kuralları (main.js'te import edilir)
tests/
  csv.test.js
  pagination.test.js
  receipts-list.test.js
```

---

### Task 1: CSV ve Sayfalama Yardımcı Fonksiyonları

**Files:**
- Create: `src/lib/csv.js`
- Create: `src/lib/pagination.js`
- Test: `tests/csv.test.js`
- Test: `tests/pagination.test.js`

**Interfaces:**
- Produces: `toCsv(rows, columns)`, `downloadCsv(filename, rows, columns)`, `paginateRows(rows, pageSize = 13)` — Task 2 ve Task 3 bunları kullanır.

- [ ] **Step 1: `tests/pagination.test.js` yaz**

```javascript
import { describe, it, expect } from 'vitest';
import { paginateRows } from '../src/lib/pagination.js';

describe('paginateRows', () => {
  it('13 veya daha az satırı tek sayfada döner', () => {
    const rows = Array.from({ length: 13 }, (_, i) => i);
    expect(paginateRows(rows)).toEqual([rows]);
  });

  it('14 satırı iki sayfaya böler (13 + 1)', () => {
    const rows = Array.from({ length: 14 }, (_, i) => i);
    const pages = paginateRows(rows);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(13);
    expect(pages[1]).toHaveLength(1);
  });

  it('boş listede tek boş sayfa döner (form yine de basılabilsin)', () => {
    expect(paginateRows([])).toEqual([[]]);
  });

  it('özel sayfa boyutu kabul eder', () => {
    const rows = [1, 2, 3, 4, 5];
    expect(paginateRows(rows, 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `pagination.js` bulunamadı.

- [ ] **Step 3: `src/lib/pagination.js` yaz**

```javascript
export const ROWS_PER_PAGE = 13;

export function paginateRows(rows, pageSize = ROWS_PER_PAGE) {
  if (rows.length === 0) return [[]];
  const pages = [];
  for (let i = 0; i < rows.length; i += pageSize) {
    pages.push(rows.slice(i, i + pageSize));
  }
  return pages;
}
```

- [ ] **Step 4: Testi tekrar çalıştır**

Run: `npm run test`
Expected: PASS (4/4).

- [ ] **Step 5: `tests/csv.test.js` yaz**

```javascript
import { describe, it, expect } from 'vitest';
import { toCsv } from '../src/lib/csv.js';

describe('toCsv', () => {
  const columns = [
    { key: 'name', label: 'Firma' },
    { key: 'date', label: 'Tarih' }
  ];

  it('başlık satırını ve verileri noktalı virgülle ayırır', () => {
    const csv = toCsv([{ name: 'ANKA GRUP', date: '2026-08-26' }], columns);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Firma;Tarih');
    expect(lines[1]).toBe('ANKA GRUP;2026-08-26');
  });

  it('değer içinde noktalı virgül varsa tırnak içine alır', () => {
    const csv = toCsv([{ name: 'FIRMA; A.S.', date: '2026-08-26' }], columns);
    expect(csv.split('\n')[1]).toBe('"FIRMA; A.S.";2026-08-26');
  });

  it('boş/undefined değeri boş string yapar', () => {
    const csv = toCsv([{ name: 'FIRMA', date: undefined }], columns);
    expect(csv.split('\n')[1]).toBe('FIRMA;');
  });

  it('veri yoksa sadece başlık satırı döner', () => {
    const csv = toCsv([], columns);
    expect(csv).toBe('Firma;Tarih');
  });
});
```

- [ ] **Step 6: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `csv.js` bulunamadı.

- [ ] **Step 7: `src/lib/csv.js` yaz**

```javascript
function escapeCell(value) {
  const str = value === undefined || value === null ? '' : String(value);
  return str.includes(';') || str.includes('"') || str.includes('\n')
    ? '"' + str.replace(/"/g, '""') + '"'
    : str;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => c.label).join(';');
  const lines = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(';'));
  return [header, ...lines].join('\n');
}

export function downloadCsv(filename, rows, columns) {
  const csv = toCsv(rows, columns);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 8: Testi tekrar çalıştır**

Run: `npm run test`
Expected: PASS (4/4).

- [ ] **Step 9: Commit**

```bash
git add src/lib/csv.js src/lib/pagination.js tests/csv.test.js tests/pagination.test.js
git commit -m "feat: CSV export ve 13 satır/sayfa bölme yardımcı fonksiyonları"
```

---

### Task 2: `listReceipts(filters)` — Arama Veri Katmanı

**Files:**
- Modify: `src/lib/receipts.js` (Plan 3'te oluşturulmuştu, buraya fonksiyon eklenir)
- Test: `tests/receipts-list.test.js`

**Interfaces:**
- Consumes: `supabase` (Plan 1).
- Produces: `listReceipts({ companyId, startDate, endDate, status, productId })` → `Promise<Array>` — her satır `{id, receipt_date, irsaliye_no, siparis_no, status, companies: {name}}`. Task 3'teki arama sayfası bunu kullanır.

- [ ] **Step 1: `tests/receipts-list.test.js` yaz**

```javascript
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
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `listReceipts` export edilmemiş.

- [ ] **Step 3: `src/lib/receipts.js` dosyasının sonuna ekle**

```javascript
export async function listReceipts({ companyId, startDate, endDate, status, productId } = {}) {
  let query = supabase
    .from('receipts')
    .select('id, receipt_date, irsaliye_no, siparis_no, status, companies (name)');

  if (companyId) query = query.eq('company_id', companyId);
  if (startDate) query = query.gte('receipt_date', startDate);
  if (endDate) query = query.lte('receipt_date', endDate);
  if (status) query = query.eq('status', status);

  if (productId) {
    const { data: itemRows, error: itemsError } = await supabase
      .from('receipt_items')
      .select('receipt_id')
      .eq('product_id', productId);
    if (itemsError) throw itemsError;
    const receiptIds = [...new Set(itemRows.map((r) => r.receipt_id))];
    query = query.in('id', receiptIds);
  }

  const { data, error } = await query.order('receipt_date', { ascending: false });
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Testi tekrar çalıştır**

Run: `npm run test`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/receipts.js tests/receipts-list.test.js
git commit -m "feat: firma/tarih/durum/ürün filtreli mal kabul arama sorgusu"
```

---

### Task 3: Arama Sayfası (Filtreler + Sonuç Tablosu + CSV Export)

**Files:**
- Create: `src/pages/arama.js`
- Modify: `src/main.js` (rota + nav linki)

**Interfaces:**
- Consumes: `listReceipts` (Task 2), `listCompanies`/`listProducts` (Plan 2), `downloadCsv` (Task 1), `renderSearchList` (Plan 2).
- Produces: `/arama` rotası. Her sonuç satırındaki "Çıktı" butonu Task 4'teki `/mal-kabul-ciktisi/:id` rotasına yönlendirir (query param olarak `#/mal-kabul-ciktisi?id=...` kullanılır, mevcut hash router path bazlı olduğu için).

- [ ] **Step 1: `src/pages/arama.js` yaz**

```javascript
import { listReceipts } from '../lib/receipts.js';
import { listCompanies } from '../lib/companies.js';
import { downloadCsv } from '../lib/csv.js';
import { navigate } from '../router.js';

const STATUS_LABELS = {
  taslak: 'Taslak',
  kalite_bekliyor: 'Kalite Bekliyor',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi'
};

export async function renderArama(container) {
  const companies = await listCompanies();

  container.innerHTML = `
    <h2>Mal Kabul Kayıtlarında Ara</h2>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:end;margin-bottom:1rem;">
      <label>Firma
        <select id="filter-company"><option value="">Tümü</option>${companies.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
      </label>
      <label>Başlangıç <input type="date" id="filter-start" /></label>
      <label>Bitiş <input type="date" id="filter-end" /></label>
      <label>Durum
        <select id="filter-status">
          <option value="">Tümü</option>
          <option value="taslak">Taslak</option>
          <option value="kalite_bekliyor">Kalite Bekliyor</option>
          <option value="onaylandi">Onaylandı</option>
          <option value="reddedildi">Reddedildi</option>
        </select>
      </label>
      <button id="search-btn">Ara</button>
      <button id="export-csv-btn">CSV İndir</button>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="text-align:left;border-bottom:2px solid #333;"><th>Tarih</th><th>Firma</th><th>İrsaliye No</th><th>Durum</th><th></th></tr></thead>
      <tbody id="results-body"></tbody>
    </table>
  `;

  let lastResults = [];

  function currentFilters() {
    return {
      companyId: container.querySelector('#filter-company').value || undefined,
      startDate: container.querySelector('#filter-start').value || undefined,
      endDate: container.querySelector('#filter-end').value || undefined,
      status: container.querySelector('#filter-status').value || undefined
    };
  }

  async function runSearch() {
    lastResults = await listReceipts(currentFilters());
    const tbody = container.querySelector('#results-body');
    if (lastResults.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">Sonuç bulunamadı.</td></tr>';
      return;
    }
    tbody.innerHTML = lastResults
      .map(
        (r) => `<tr>
          <td>${r.receipt_date}</td>
          <td>${r.companies.name}</td>
          <td>${r.irsaliye_no || '-'}</td>
          <td>${STATUS_LABELS[r.status] || r.status}</td>
          <td><button data-view="${r.id}">Çıktı</button></td>
        </tr>`
      )
      .join('');
    tbody.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => navigate('/mal-kabul-ciktisi?id=' + btn.dataset.view));
    });
  }

  container.querySelector('#search-btn').addEventListener('click', runSearch);
  container.querySelector('#export-csv-btn').addEventListener('click', () => {
    if (lastResults.length === 0) return;
    downloadCsv(
      `mal-kabul-${new Date().toISOString().slice(0, 10)}.csv`,
      lastResults.map((r) => ({ tarih: r.receipt_date, firma: r.companies.name, irsaliye_no: r.irsaliye_no, durum: STATUS_LABELS[r.status] || r.status })),
      [
        { key: 'tarih', label: 'Tarih' },
        { key: 'firma', label: 'Firma' },
        { key: 'irsaliye_no', label: 'İrsaliye No' },
        { key: 'durum', label: 'Durum' }
      ]
    );
  });

  await runSearch();
}
```

- [ ] **Step 2: Rotayı ve nav linkini `src/main.js`'e ekle**

```javascript
import { renderArama } from './pages/arama.js';
```

```javascript
  registerRoute('/arama', renderArama);
```

Nav bloğuna ekle:

```html
<button data-nav="/arama">Kayıt Ara</button>
```

Not: `router.js` (Plan 2) sadece hash'in `#` sonrası kısmını path olarak kullanıyor; `?id=...` kısmı path'in bir parçası olarak `routes` Map'inde aranmayacağından Task 4'te router'a küçük bir query-string ayrıştırma eklenecek (bkz. Task 4 Step 1).

- [ ] **Step 3: Tarayıcıda doğrula (Task 4 tamamlanana kadar "Çıktı" butonu geçici olarak boş sayfaya düşebilir, bu normaldir)**

Run: `npm run dev`, "Kayıt Ara"ya git.
Expected: Filtresiz arama tüm kayıtları listeler. Firma seçip "Ara"ya basınca sadece o firmanın kayıtları görünür. "CSV İndir"e basınca bir `.csv` dosyası iner, Excel'de açıldığında Türkçe karakterler doğru görünür.

- [ ] **Step 4: Commit**

```bash
git add src/pages/arama.js src/main.js
git commit -m "feat: mal kabul kayıtları arama sayfası ve CSV export"
```

---

### Task 4: Query-String Destekli Router Güncellemesi

**Files:**
- Modify: `src/router.js` (Plan 2'de oluşturulmuştu)
- Test: `tests/router.test.js` (Plan 2'de oluşturulmuştu, buraya ek testler eklenir)

**Interfaces:**
- Produces: `getQueryParam(name)` — Task 5'teki çıktı sayfası `id` parametresini bununla okur.

- [ ] **Step 1: `tests/router.test.js` dosyasının sonuna ekle**

```javascript
import { getQueryParam } from '../src/router.js';

describe('getQueryParam', () => {
  it('hash içindeki query stringden değeri okur', () => {
    window.location.hash = '/mal-kabul-ciktisi?id=abc-123';
    expect(getQueryParam('id')).toBe('abc-123');
  });

  it('parametre yoksa null döner', () => {
    window.location.hash = '/mal-kabul-ciktisi';
    expect(getQueryParam('id')).toBeNull();
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `getQueryParam` export edilmemiş, ayrıca mevcut `renderCurrent` path'i `?` dahil aldığı için route eşleşmesi de bozulur.

- [ ] **Step 3: `src/router.js` içindeki `renderCurrent` fonksiyonunu ve export'ları güncelle**

```javascript
function currentPathAndQuery() {
  const full = window.location.hash.slice(1) || '/';
  const [path, query = ''] = full.split('?');
  return { path, query };
}

export function getQueryParam(name) {
  const { query } = currentPathAndQuery();
  return new URLSearchParams(query).get(name);
}

function renderCurrent() {
  if (!rootContainer) return;
  const { path } = currentPathAndQuery();
  const renderFn = routes.get(path) || routes.get('/');
  if (renderFn) renderFn(rootContainer);
}
```

(`registerRoute`, `navigate`, `startRouter`, `_resetRoutes` fonksiyonları değişmeden kalır — sadece `renderCurrent` içindeki path ayrıştırma mantığı değişti ve yeni `getQueryParam` export'u eklendi.)

- [ ] **Step 4: Testleri tekrar çalıştır**

Run: `npm run test`
Expected: PASS (tüm router testleri dahil).

- [ ] **Step 5: Commit**

```bash
git add src/router.js tests/router.test.js
git commit -m "feat: router'a query-string desteği ekle"
```

---

### Task 5: Mal Kabul Formu Alan Genişletmesi (Fatura No, Araç Kontrolü, Ürün Sıcaklığı, Yarı Ömür)

**Bağlam:** Kullanıcı gerçek "MAL KABUL FORMU" belgesini (gürok Turizm Grubu, Doküman No: F.22) paylaştı. Şu ana kadarki şemada karşılığı olmayan alanlar tespit edildi. Bu görev, çıktı tasarımından (Task 6) önce bu alanları veritabanına ve giriş formuna ekler.

**Gerçek form → şema eşlemesi:**
- Tarih, Firma Adı, İrsaliye No, Parti No (`lot_no`), Malzeme Adı, SKT, Açıklama (`note`) → zaten mevcut.
- **Fatura No** → yeni, `receipts.fatura_no` (İrsaliye No'dan ayrı bir alan).
- **Araç Hijyeni / Araç Sıcaklığı** → yeni, receipt (sevkiyat) başına bir kez: `receipts.arac_hijyen_uygun` (boolean), `receipts.arac_sicaklik` (numeric).
- **Yarı Ömrünü Geçmiş mi?** → yeni, ürün satırı başına: `receipt_items.yari_omur_gecti` (boolean, varsayılan false).
- **Ürün Sıcaklığı** → yeni, ürün satırı başına: `receipt_items.urun_sicakligi` (numeric).
- **MKK** (kullanıcı tanımı: "mal kabul kriteri uygun ise +") → **yeni bir sütun gerekmiyor**, mevcut `uygunluk` alanının çıktıdaki karşılığı: `uygun` → "+", `uygun_degil` → `note` metni, `beklemede` → boş.

**Files:**
- Create: `supabase/migrations/0008_mal_kabul_form_alanlari.sql`
- Modify: `src/lib/receipts.js` (`createReceiptWithItems` imzası + RPC çağrısı, `getReceiptDetail` select listesi)
- Modify: `src/pages/yeni-kabul.js` (form alanları: Fatura No, Araç Hijyeni, Araç Sıcaklığı; satır başına: Ürün Sıcaklığı, Yarı Ömür Geçti mi)
- Modify: `src/pages/kalite-onay.js` (bu alanları salt-okunur gösterir — kalite ekibi karar verirken görsün diye)
- Test: `tests/receipts.test.js` güncellemesi

**Interfaces:**
- `createReceiptWithItems`'ın seçenek nesnesi 3 yeni alan alır: `faturaNo`, `aracHijyenUygun`, `aracSicaklik`; `items` dizisindeki her öğe artık `urunSicakligi` ve `yariOmurGecti` de taşıyabilir.

- [ ] **Step 1: `supabase/migrations/0008_mal_kabul_form_alanlari.sql` yaz**

```sql
-- 0008_mal_kabul_form_alanlari.sql
alter table receipts add column fatura_no text;
alter table receipts add column arac_hijyen_uygun boolean;
alter table receipts add column arac_sicaklik numeric(5,2);

alter table receipt_items add column urun_sicakligi numeric(5,2);
alter table receipt_items add column yari_omur_gecti boolean not null default false;

-- ÖNEMLİ: 0007'deki 8 parametreli create_receipt_with_items'a 3 yeni parametre eklendiği için
-- (Task 1/4'te öğrenilen ders) eski imzayı önce açıkça düşürüyoruz, yoksa "function is not unique" hatası alınır.
drop function if exists create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean);

create or replace function create_receipt_with_items(
  p_company_id bigint,
  p_receipt_date date,
  p_irsaliye_no text,
  p_siparis_no text,
  p_received_by uuid,
  p_client_uuid text,
  p_items jsonb,
  p_submit_to_quality boolean default false,
  p_fatura_no text default null,
  p_arac_hijyen_uygun boolean default null,
  p_arac_sicaklik numeric default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_receipt_id uuid;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'En az bir ürün satırı gerekli';
  end if;

  insert into receipts (
    client_uuid, company_id, receipt_date, irsaliye_no, siparis_no, received_by, status,
    fatura_no, arac_hijyen_uygun, arac_sicaklik
  )
  values (
    p_client_uuid, p_company_id, p_receipt_date, p_irsaliye_no, p_siparis_no, p_received_by, 'taslak',
    p_fatura_no, p_arac_hijyen_uygun, p_arac_sicaklik
  )
  returning id into v_receipt_id;

  insert into receipt_items (
    receipt_id, product_id, line_no, lot_no, skt, quantity, unit, uygunluk,
    urun_sicakligi, yari_omur_gecti
  )
  select
    v_receipt_id,
    (item->>'productId')::bigint,
    (item->>'lineNo')::int,
    item->>'lotNo',
    nullif(item->>'skt', '')::date,
    (item->>'quantity')::numeric,
    item->>'unit',
    'beklemede',
    nullif(item->>'urunSicakligi', '')::numeric,
    coalesce((item->>'yariOmurGecti')::boolean, false)
  from jsonb_array_elements(p_items) as item;

  if p_submit_to_quality then
    update receipts set status = 'kalite_bekliyor' where id = v_receipt_id;
  end if;

  return v_receipt_id;
end;
$$;

revoke execute on function create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean, text, boolean, numeric) from public;
grant execute on function create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean, text, boolean, numeric) to authenticated;
```

- [ ] **Step 2: `src/lib/receipts.js`'i güncelle — `createReceiptWithItems` yeni alanları RPC'ye geçirsin**

`createReceiptWithItems`'ın parametre nesnesine `faturaNo`, `aracHijyenUygun`, `aracSicaklik` ekle; `items.map(...)` içine `urunSicakligi: item.urunSicakligi ?? null, yariOmurGecti: item.yariOmurGecti ?? false` ekle; `supabase.rpc(...)` çağrısına `p_fatura_no: faturaNo || null, p_arac_hijyen_uygun: aracHijyenUygun ?? null, p_arac_sicaklik: aracSicaklik ?? null` ekle.

- [ ] **Step 3: `getReceiptDetail`'i genişlet — yeni alanlar + Task 6'nın çıktı ekranının ihtiyaç duyduğu firma/personel isimleri**

`src/lib/receipts.js`'teki `getReceiptDetail`'i şu hale getir (yeni alanlar VE firma/personel isim join'leri bir arada):

```javascript
export async function getReceiptDetail(receiptId) {
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select(`
      id, company_id, receipt_date, irsaliye_no, siparis_no, status, received_by, quality_by, quality_note,
      fatura_no, arac_hijyen_uygun, arac_sicaklik,
      companies (name),
      received_profile:profiles!receipts_received_by_fkey (full_name),
      quality_profile:profiles!receipts_quality_by_fkey (full_name)
    `)
    .eq('id', receiptId)
    .single();
  if (receiptError) throw receiptError;

  const { data: items, error: itemsError } = await supabase
    .from('receipt_items')
    .select('id, product_id, lot_no, skt, quantity, unit, uygunluk, note, urun_sicakligi, yari_omur_gecti, products (code, name)')
    .eq('receipt_id', receiptId);
  if (itemsError) throw itemsError;

  return {
    receipt: {
      ...receipt,
      companyName: receipt.companies?.name,
      receivedByName: receipt.received_profile?.full_name,
      qualityByName: receipt.quality_profile?.full_name
    },
    items
  };
}
```

(Not: `profiles!receipts_received_by_fkey` / `profiles!receipts_quality_by_fkey` Supabase'in Plan 1'deki `references profiles(id)` tanımından otomatik ürettiği kısıtlama adlarına dayanır; Supabase SQL Editor'de `select conname from pg_constraint where conrelid = 'receipts'::regclass;` ile doğrula, farklıysa güncelle.)

Bu değişiklik `kalite-onay.js`'in `getReceiptDetail`'i çağıran `renderDetail` fonksiyonunun `receipt` nesnesindeki alanlarla uyumlu kalmasını gerektirir — mevcut kullanım (`receipt.irsaliye_no`, `receipt.siparis_no` vb.) bozulmaz, sadece yeni alanlar eklenir.

- [ ] **Step 4: `src/pages/yeni-kabul.js`'e yeni form alanlarını ekle**

Başlık alanlarına (Tarih/İrsaliye/Sipariş No'nun yanına) ekle:
- `<input type="text" id="kabul-fatura" placeholder="Fatura No" />`
- `<select id="kabul-arac-hijyen"><option value="">Araç Hijyeni —</option><option value="true">Uygun</option><option value="false">Uygun Değil</option></select>`
- `<input type="number" step="0.1" id="kabul-arac-sicaklik" placeholder="Araç Sıcaklığı (°C)" />`

Satır tablosuna (`renderItemsBody`) iki sütun daha ekle: "Ürün Sıcaklığı" (`<input type="number" step="0.1" data-field="urunSicakligi">`) ve "Yarı Ömür Geçti mi" (`<input type="checkbox" data-field="yariOmurGecti">`, checkbox olduğu için `input` event yerine `change` event ve `.checked` okunmalı). Yeni satır eklenirken `state.items.push({..., urunSicakligi: '', yariOmurGecti: false})`. `save()` fonksiyonunda `createReceiptWithItems`'a bu üç yeni başlık alanını da geçir (`faturaNo: ...value, aracHijyenUygun: ...value === '' ? null : ...value === 'true', aracSicaklik: ...value ? Number(...value) : null`).

Tablodaki `item.code`/`item.name` gibi DB kaynaklı metinler zaten `escapeHtml()` ile kaçışlanıyordu (Plan 3'te yapıldı) — bu iki yeni sütun sayısal/boolean değerler olduğu için ek kaçışlama gerekmez, ama mevcut satırdaki escapeHtml çağrılarını bozmadığından emin ol.

- [ ] **Step 5: `src/pages/kalite-onay.js`'in detay görünümüne bu alanları salt-okunur ekle**

Detay başlığına (İrsaliye/Sipariş No satırının yanına) `Araç Hijyeni: ${receipt.arac_hijyen_uygun === null ? '-' : receipt.arac_hijyen_uygun ? 'Uygun' : 'Uygun Değil'} — Araç Sıcaklığı: ${receipt.arac_sicaklik ?? '-'}°C` ekle (kalite ekibinin karar verirken görmesi için, düzenlenemez). Satır tablosuna "Ürün Sıcaklığı" ve "Yarı Ömür Geçti mi" sütunlarını salt metin olarak ekle (`item.urun_sicakligi ?? '-'`, `item.yari_omur_gecti ? 'Evet' : 'Hayır'`).

- [ ] **Step 6: Testleri güncelle, çalıştır, commit et**

`tests/receipts.test.js`'teki `createReceiptWithItems` testlerini yeni parametrelerin RPC'ye doğru geçtiğini doğrulayacak şekilde güncelle. `npm run test` ve `npm run build` çalıştır, temiz olduğunu doğrula.

```bash
git add supabase/migrations/0008_mal_kabul_form_alanlari.sql src/lib/receipts.js src/pages/yeni-kabul.js src/pages/kalite-onay.js tests/receipts.test.js
git commit -m "feat: fatura no, arac kontrolu, urun sicakligi ve yari omur alanlarini ekle"
```

---

### Task 6: Yazdırılabilir / PDF Mal Kabul Çıktısı — Gerçek Forma Birebir Uygun

**Bağlam:** Kullanıcının paylaştığı gerçek "MAL KABUL FORMU" (gürok Turizm Grubu, Doküman No: F.22) belgesi artık elde — bu görev artık genel bir varsayım değil, o belgenin **birebir sütun sırasına ve içeriğine** göre tasarlanır. Sayfa başına 13 satır kuralı (kullanıcının kendi talebi) korunur; gerçek belgenin tam satır/sayfa sayısı görselden belirlenemediği için bu varsayım geçerliliğini korur.

**Gerçek formun sütun sırası (soldan sağa):** Tarih | Firma Adı | Fatura No | İrsaliye No | Seri No/Parti No | Araç: Hijyen | Araç: Sıcaklık | Malzeme Adı | SKT | Yarı Ömrünü Geçmiş mi? | Ürün Sıcaklığı | Kg. | Adet | MKK | Açıklama | İmzalar. (Kağıt formda Tarih/Firma Adı/Fatura No/İrsaliye No/Araç bilgisi her satırda tekrarlanır çünkü kağıt üzerinde tek bir "başlık" alanı yok — bu çıktıda da aynı şekilde her satırda tekrarlanacak.)

**Files:**
- Create: `src/pages/mal-kabul-ciktisi.js`
- Create: `src/style-print.css`
- Modify: `src/main.js` (rota kaydı + `style-print.css` import + `html2pdf.js` bağımlılığı)
- Modify: `package.json` (yeni bağımlılık)

**Interfaces:**
- Consumes: `getReceiptDetail` (Task 5'te genişletildi), `getQueryParam` (Task 4), `paginateRows`/`ROWS_PER_PAGE` (Task 1), `escapeHtml` (Plan 1).
- Produces: `/mal-kabul-ciktisi` rotası — Task 3'teki "Çıktı" butonunun hedefi.

- [ ] **Step 1: `html2pdf.js` bağımlılığını ekle**

`package.json` `dependencies` bloğuna ekle: `"html2pdf.js": "^0.10.2"`.

Run: `npm install`
Expected: `node_modules/html2pdf.js` klasörü oluşur.

- [ ] **Step 2: `src/style-print.css` oluştur (yatay/A4 landscape — gerçek formun genişliğine uyacak şekilde)**

```css
@media screen {
  .print-only { display: none; }
}

@media print {
  @page { size: A4 landscape; margin: 10mm; }
  header, nav, .no-print { display: none !important; }
  .print-only { display: block; }
  .print-page {
    page-break-after: always;
  }
  .print-page:last-child { page-break-after: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #333; padding: 2px 3px; font-size: 8px; text-align: center; }
  th { font-size: 8px; }
}

.print-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #333;
  padding-bottom: 6px;
  margin-bottom: 6px;
}
.print-header img { max-height: 40px; }
.print-title { text-align: center; font-weight: bold; font-size: 16px; }
.print-doc-footer {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #555;
  margin-top: 4px;
}
.print-legend {
  font-size: 8px;
  margin-top: 8px;
  line-height: 1.4;
}
.print-signoff {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  font-size: 11px;
}
```

- [ ] **Step 3: `src/pages/mal-kabul-ciktisi.js` yaz — gerçek "MAL KABUL FORMU" (Doküman No: F.22) sütun sırasıyla**

```javascript
import { getReceiptDetail } from '../lib/receipts.js';
import { getQueryParam } from '../router.js';
import { paginateRows, ROWS_PER_PAGE } from '../lib/pagination.js';
import { escapeHtml } from '../lib/html.js';

// Kullanıcının paylaştığı gerçek forma ait doküman kontrol bilgileri (Doküman No:F.22,
// Yayın Tarihi:15.02.2026, Rev.Tarihi/No:/00). Form revize edilirse burası güncellenir.
const DOC_NO = 'F.22';
const DOC_YAYIN_TARIHI = '15.02.2026';
const DOC_REV = '/00';

const RISK_LEGEND = `
  <strong>1. Derece riskli ürünler:</strong> Tüm et ve et ürünleri, sakatat ürünleri, balık ve deniz hayvanları ürünleri, kümes hayvanları ürünleri, pasta kreması, yumurta.
  <strong>2. Derece riskli ürünler:</strong> Dondurulmuş meyve sebze, konserve, katı ve sıvı yağlar.
  <strong>3. Derece riskli ürünler:</strong> Turşular, kuru gıda, baharat, bal, corn flakes, marmelat, reçel, pekmez, zeytin, tahin, bakliyat.
  <strong>4. Derece riskli ürünler:</strong> Sebze, meyve.
  <br/><strong>Alerjen gıdalar:</strong> Gluten içeren tahıllar, kabuklular, yumurta, balık, kerevit, hardal, susam tohumu, kükürt dioksit, sülfitler, acı bakla, yumuşakçalar.
`;

function evetHayirYokBilgi(value) {
  if (value === null || value === undefined) return '-';
  return value ? 'Uygun' : 'Uygun Değil';
}

function mkkHucresi(item) {
  if (item.uygunluk === 'uygun') return '+';
  if (item.uygunluk === 'uygun_degil') return escapeHtml(item.note || 'Uygun Değil');
  return '-';
}

export async function renderMalKabulCiktisi(container) {
  const receiptId = getQueryParam('id');
  if (!receiptId) {
    container.innerHTML = '<p>Gösterilecek kayıt bulunamadı.</p>';
    return;
  }

  const { receipt, items } = await getReceiptDetail(receiptId);
  const pages = paginateRows(items, ROWS_PER_PAGE);

  const pagesHtml = pages
    .map(
      (pageItems, pageIndex) => `
    <div class="print-page">
      <div class="print-header">
        <img src="/logo.png" alt="Logo" onerror="this.style.display='none'" />
        <div class="print-title">MAL KABUL FORMU</div>
        <div>Sayfa ${pageIndex + 1} / ${pages.length}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Tarih</th><th>Firma Adı</th><th>Fatura No</th><th>İrsaliye No</th>
            <th>Seri No/<br/>Parti No</th><th>Araç<br/>Hijyen</th><th>Araç<br/>Sıcaklık</th>
            <th>Malzeme Adı</th><th>SKT</th><th>Yarı Ömrünü<br/>Geçmiş mi?</th>
            <th>Ürün<br/>Sıcaklığı</th><th>Kg.</th><th>Adet</th><th>MKK</th>
            <th>Açıklama</th><th>İmzalar</th>
          </tr>
        </thead>
        <tbody>
          ${pageItems
            .map(
              (item) => `
            <tr>
              <td>${escapeHtml(receipt.receipt_date)}</td>
              <td>${escapeHtml(receipt.companyName)}</td>
              <td>${escapeHtml(receipt.fatura_no || '-')}</td>
              <td>${escapeHtml(receipt.irsaliye_no || '-')}</td>
              <td>${escapeHtml(item.lot_no || '-')}</td>
              <td>${evetHayirYokBilgi(receipt.arac_hijyen_uygun)}</td>
              <td>${receipt.arac_sicaklik ?? '-'}</td>
              <td>${escapeHtml(item.products.name)}</td>
              <td>${escapeHtml(item.skt || '-')}</td>
              <td>${item.yari_omur_gecti ? 'Evet' : 'Hayır'}</td>
              <td>${item.urun_sicakligi ?? '-'}</td>
              <td>${item.unit === 'kg' ? item.quantity : ''}</td>
              <td>${item.unit === 'ad' ? item.quantity : ''}</td>
              <td>${mkkHucresi(item)}</td>
              <td>${escapeHtml(item.note || '-')}</td>
              <td></td>
            </tr>`
            )
            .join('')}
          ${Array.from({ length: ROWS_PER_PAGE - pageItems.length }, () => '<tr><td colspan="16">&nbsp;</td></tr>').join('')}
        </tbody>
      </table>
      <div class="print-doc-footer">
        <div>Doküman No:${DOC_NO}</div>
        <div>Yayın Tarihi:${DOC_YAYIN_TARIHI}</div>
        <div>Rev.Tarihi/No:${DOC_REV}</div>
      </div>
      ${
        pageIndex === pages.length - 1
          ? `<div class="print-signoff">
              <div>Teslim Alan: ${escapeHtml(receipt.receivedByName || '-')}</div>
              <div>Kalite Kontrol: ${escapeHtml(receipt.qualityByName || '-')}</div>
              <div>Durum: ${escapeHtml(receipt.status)}</div>
            </div>
            <div>Kalite Notu: ${escapeHtml(receipt.quality_note || '-')}</div>
            <div class="print-legend">
              <strong>Not:</strong> Denetim sırasında UYGUN görülen durumlar için ilgili kolona <strong>+</strong> yazılacaktır.
              Denetim sırasında UYGUN OLMADIĞI görülen durumlar için ise uygunsuzluğun tanımı yapılacaktır.
              Mal Kabul Kriterleri: Gıda malzemesinin uygunluğu için Hammadde Özellikleri Tablosu niteliklerine bakılır.
              ${RISK_LEGEND}
            </div>`
          : ''
      }
    </div>`
    )
    .join('');

  container.innerHTML = `
    <div class="no-print" style="margin-bottom:1rem;display:flex;gap:0.5rem;">
      <button id="print-btn">Yazdır</button>
      <button id="pdf-btn">PDF İndir</button>
    </div>
    <div id="print-area">${pagesHtml}</div>
  `;

  container.querySelector('#print-btn').addEventListener('click', () => window.print());
  container.querySelector('#pdf-btn').addEventListener('click', async () => {
    const html2pdf = (await import('html2pdf.js')).default;
    html2pdf()
      .set({ filename: `mal-kabul-${receipt.receipt_date}-${receiptId.slice(0, 8)}.pdf`, margin: 5, jsPDF: { format: 'a4', orientation: 'landscape' } })
      .from(container.querySelector('#print-area'))
      .save();
  });
}
```

**Not:** `mkkHucresi` ve `escapeHtml(item.note || '-')` bilerek AYNI notu iki farklı sütunda (MKK ve Açıklama) gösterebilir — gerçek formda MKK "kritere uygunluk" işareti, Açıklama ise serbest not alanıdır; `uygun_degil` durumunda ikisi de aynı açıklamayı taşıması kabul edilebilir bir sadeleştirmedir (ayrı bir "MKK notu" alanı şu an şemada yok).

- [ ] **Step 4: `src/main.js`'e rota, CSS import ve `html2pdf.js` bağlantısını ekle**

Dosyanın en üstüne CSS import ekle:

```javascript
import './style-print.css';
```

```javascript
import { renderMalKabulCiktisi } from './pages/mal-kabul-ciktisi.js';
```

```javascript
  registerRoute('/mal-kabul-ciktisi', renderMalKabulCiktisi);
```

- [ ] **Step 5: `public/logo.png` için placeholder not bırak**

`public/logo.png` dosyası henüz yok — `onerror="this.style.display='none'"` sayesinde dosya yoksa logo alanı sessizce gizlenir, sayfa hata vermez. "gürok Turizm Grubu" logosu elde edildiğinde bu path'e (`public/logo.png`) eklenmesi yeterlidir, kod değişikliği gerekmez.

- [ ] **Step 6: Tarayıcıda uçtan uca doğrula**

1. `npm run dev`, "Kayıt Ara"ya git, Task 5'te yeni alanları (Fatura No, Araç Hijyeni/Sıcaklığı, Ürün Sıcaklığı, Yarı Ömür) doldurulmuş bir kayıt bul, "Çıktı"ya bas.
2. 13'ten fazla ürün satırı olan bir test kaydı oluştur (Yeni Mal Kabul'den 15 satır ekleyip kaydet) ve onun çıktısını aç.

Expected: Ekranda 16 sütunlu (Tarih...İmzalar) tablo gerçek formun sırasıyla görünür, Tarih/Firma Adı/Fatura No/İrsaliye No her satırda tekrarlanır, MKK sütunu uygun satırlarda "+", uygun olmayanlarda açıklama gösterir, sayfa numarası "Sayfa 1/2" ve "Sayfa 2/2" görünür, her sayfa 13 satır (boş satırlarla doldurulmuş) gösterir, doküman kontrol bilgisi (Doküman No/Yayın Tarihi/Rev.Tarihi) her sayfada, imza/kalite notu/risk derecesi lejantı sadece son sayfada görünür. "Yazdır"a basınca tarayıcı yazdırma önizlemesi yatay (landscape) açılır, menü/nav görünmez. "PDF İndir"e basınca yatay yönlü bir `.pdf` dosyası iner.

- [ ] **Step 7: Commit**

```bash
git add src/pages/mal-kabul-ciktisi.js src/style-print.css src/main.js package.json
git commit -m "feat: gercek Mal Kabul Formu (F.22) sablonuna birebir uyan yazdirilabilir cikti"
```

---

## Bu Plan Tamamlandığında Doğrulanacaklar

- `npm run test` yeşil (csv, pagination, receipts-list, router, receipts testleri dahil).
- Arama sayfası firma/tarih aralığı/durum filtreleriyle çalışıyor, sonuçlar CSV olarak inebiliyor.
- Mal kabul giriş formu artık Fatura No, Araç Hijyeni/Sıcaklığı, Ürün Sıcaklığı ve Yarı Ömür alanlarını da alıyor; kalite onay ekranı bunları salt-okunur gösteriyor.
- Herhangi bir kayıt için "Çıktı" ekranı gerçek "MAL KABUL FORMU" (Doküman No: F.22) şablonunun sütun sırasına birebir uyan, 13 satır/sayfa kuralına göre bölünmüş, yatay (landscape) yazdırılabilir ve PDF olarak indirilebilir bir çıktı üretiyor.
- **Kalan açık nokta:** Gerçek "gürok Turizm Grubu" logosu henüz `public/logo.png` olarak eklenmedi — sadece görsel, işlevi etkilemiyor (logo yoksa alan sessizce gizleniyor).
