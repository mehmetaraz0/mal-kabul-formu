# İstatistik Detay Sayfaları + Marka Alanı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task'ları bu dosyadaki sırayla uygula.**

**Goal:** Mal kabul formuna bir "Marka" alanı eklemek, ve İstatistik sayfasındaki ürün/firma satırlarını tıklanabilir yapıp, o ürünün/firmanın hangi firma/ürün+marka kombinasyonlarından ne kadar geldiğini gösteren detay sayfaları eklemek.

**Architecture:** `receipt_items`e yeni `marka` sütunu; mevcut `create_receipt_with_items` RPC'sinin imzası değişmeden (sadece `p_items` içindeki bir alan) güncellenir. İstatistik veri katmanına, mevcut `getStatistics` ile aynı sorgu desenini kullanan iki yeni fonksiyon eklenir (`getProductDetail`, `getCompanyDetail`), farklı filtre/gruplama anahtarıyla. İki yeni sayfa bu fonksiyonları tüketir.

**Tech Stack:** Vite + vanilla JS (mevcut proje), Supabase (RLS zaten üç rolü de kapsıyor, yeni politika gerekmiyor), Vitest.

## Global Constraints

- Tasarım belgesi: `docs/superpowers/specs/2026-08-30-istatistik-detay-marka-design.md` — bu planın tüm kararları oradan gelir.
- Migration `supabase/migrations/` altında sıradaki numarayla eklenir (bu plan `0016` kullanır) ve **Supabase SQL Editor'da kullanıcı tarafından elle çalıştırılır** — otomatik uygulanmaz.
- Marka serbest metin, opsiyonel — ayrı bir yönetim tablosu/CRUD sayfası YOK.
- PDF/Excel çıktılarına (F.22) marka eklenmiyor — kapsam dışı.
- Detay sayfaları üç rolün de eriştiği koşulsuz route'lar (ana `/istatistik` ile aynı erişim), nav pill gerekmiyor (sadece tıklamayla erişilir, `/mal-kabul-ciktisi` gibi).
- Detay sayfalarına tarih filtresi taşınmıyor (kapsam dışı, her zaman tüm zamanlar).
- Bu projedeki basit sayfalar (arama.js, firmalar.js, istatistik.js) için dedike sayfa-testi yok — aynı desen yeni sayfalar için de geçerli.

---

## Task 1: Migration 0016 — `marka` Sütunu + RPC Güncellemesi

**Files:**
- Create: `supabase/migrations/0016_marka_alani_ekle.sql`

**Interfaces:**
- Consumes: mevcut `create_receipt_with_items` RPC'si (0013'teki hali — imza değişmiyor).
- Produces: `receipt_items.marka` sütunu; RPC artık `p_items` içindeki her öğenin `marka` alanını okuyup yazıyor. Task 2 (form) ve Task 3 (veri katmanı) buna bağımlı.

- [ ] **Step 1: Migration dosyasını yaz**

`supabase/migrations/0016_marka_alani_ekle.sql`:

```sql
-- 0016_marka_alani_ekle.sql
--
-- Ürün kararı: aynı ürün farklı teslimatlarda farklı markalarla (üretici markası, ör.
-- "Dardanel") gelebiliyor — bu bilgi firma (tedarikçi) bilgisinden ayrı ve şu ana kadar hiç
-- tutulmuyordu. İstatistik bölümünde ürün/firma bazında marka kırılımı gösterebilmek için
-- receipt_items'a ayrı bir `marka` sütunu ekleniyor (serbest metin, opsiyonel — Firma/Ürün
-- gibi ayrı bir yönetim tablosu/CRUD sayfası GEREKTİRMİYOR, lot_no/note ile aynı basitlikte).

alter table receipt_items add column if not exists marka text;

-- create_receipt_with_items: imza (parametre listesi) DEĞİŞMEDİ — sadece p_items içindeki
-- her öğeye bir alan daha eklendiği için `create or replace` yeterli (0013'teki gibi bir
-- DROP FUNCTION gerekmiyor, çünkü fonksiyonun kendi parametreleri aynı kalıyor).
create or replace function create_receipt_with_items(
  p_company_id bigint,
  p_receipt_date date,
  p_irsaliye_no text,
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

  -- UYARI: bu insert'e asla bir `on conflict (client_uuid) do update ...` SET listesi
  -- eklenmesin — RLS UPDATE-politikası sorununu geri getirir (bkz. 0011). `do nothing`
  -- + aşağıdaki erken-dönüş bilerek tercih edildi.
  insert into receipts (
    client_uuid, company_id, receipt_date, irsaliye_no, received_by, status,
    fatura_no, arac_hijyen_uygun, arac_sicaklik
  )
  values (
    p_client_uuid, p_company_id, p_receipt_date, p_irsaliye_no, p_received_by, 'taslak',
    p_fatura_no, p_arac_hijyen_uygun, p_arac_sicaklik
  )
  on conflict (client_uuid) do nothing
  returning id into v_receipt_id;

  if v_receipt_id is null then
    select id into v_receipt_id from receipts where client_uuid = p_client_uuid;
    return v_receipt_id;
  end if;

  insert into receipt_items (
    receipt_id, product_id, line_no, lot_no, skt, quantity, unit, uygunluk, note,
    urun_sicakligi, yari_omur_gecti, marka
  )
  select
    v_receipt_id,
    (item->>'productId')::bigint,
    (item->>'lineNo')::int,
    item->>'lotNo',
    nullif(item->>'skt', '')::date,
    (item->>'quantity')::numeric,
    item->>'unit',
    coalesce(item->>'uygunluk', 'beklemede'),
    nullif(item->>'note', ''),
    nullif(item->>'urunSicakligi', '')::numeric,
    coalesce((item->>'yariOmurGecti')::boolean, false),
    nullif(item->>'marka', '')
  from jsonb_array_elements(p_items) as item;

  if p_submit_to_quality then
    update receipts set status = 'onaylandi' where id = v_receipt_id and status = 'taslak';
  end if;

  return v_receipt_id;
end;
$$;
```

- [ ] **Step 2: Kullanıcıdan migration'ı Supabase SQL Editor'da çalıştırmasını iste**

Kullanıcıya şu mesajı ilet: "0016_marka_alani_ekle.sql dosyasının tamamını Supabase SQL Editor'da
çalıştırıp onaylar mısın?" — onay gelmeden Task 5'e (canlı doğrulama) geçme.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0016_marka_alani_ekle.sql
git commit -m "feat: receipt_items'a marka alani ekle, create_receipt_with_items RPC'sini guncelle"
```

---

## Task 2: Form — Marka Girişi (Yeni Mal Kabul)

**Files:**
- Modify: `src/pages/yeni-kabul.js:53` (tablo başlığı), `src/pages/yeni-kabul.js:88-105` (satır şablonu), `src/pages/yeni-kabul.js:143` (yeni satır varsayılan değerleri)
- Modify: `src/lib/receipts.js:26-37` (`p_items` mapping)
- Test: `tests/receipts.test.js`

**Interfaces:**
- Consumes: yok (saf UI + veri geçişi).
- Produces: `createReceiptWithItems`'a geçirilen her item artık `marka` alanı taşıyor. Task 1'in RPC'si bunu okuyor.

- [ ] **Step 1: Form tablosuna Marka sütunu ekle**

`src/pages/yeni-kabul.js:53`:
```js
            <tr><th>Ürün</th><th>Lot No</th><th>SKT</th><th>Miktar</th><th>Birim</th><th>Ürün Sıcaklığı</th><th>Yarı Ömür Geçti mi</th><th>Uygunluk</th><th>Not</th><th></th></tr>
```
şuna çevir (Ürün'den hemen sonra Marka eklendi):
```js
            <tr><th>Ürün</th><th>Marka</th><th>Lot No</th><th>SKT</th><th>Miktar</th><th>Birim</th><th>Ürün Sıcaklığı</th><th>Yarı Ömür Geçti mi</th><th>Uygunluk</th><th>Not</th><th></th></tr>
```

`src/pages/yeni-kabul.js:88-90` (satır şablonunun başı):
```js
      <tr>
        <td>${escapeHtml(item.code)} — ${escapeHtml(item.name)}</td>
        <td><input type="text" data-field="lotNo" data-index="${i}" value="${escapeHtml(item.lotNo)}" /></td>
```
şuna çevir:
```js
      <tr>
        <td>${escapeHtml(item.code)} — ${escapeHtml(item.name)}</td>
        <td><input type="text" data-field="marka" data-index="${i}" value="${escapeHtml(item.marka)}" style="width:100px;" placeholder="Marka" /></td>
        <td><input type="text" data-field="lotNo" data-index="${i}" value="${escapeHtml(item.lotNo)}" /></td>
```

- [ ] **Step 2: Yeni satır varsayılan değerine `marka: ''` ekle**

`src/pages/yeni-kabul.js:143`:
```js
      state.items.push({ productId: p.id, code: p.code, name: p.name, unit: p.unit, lotNo: '', skt: '', quantity: 0, urunSicakligi: '', yariOmurGecti: false, uygunluk: 'beklemede', note: '' });
```
şuna çevir:
```js
      state.items.push({ productId: p.id, code: p.code, name: p.name, unit: p.unit, marka: '', lotNo: '', skt: '', quantity: 0, urunSicakligi: '', yariOmurGecti: false, uygunluk: 'beklemede', note: '' });
```

Not: `renderItemsBody()`'daki genel `input:not([type="checkbox"])` event listener'ı zaten
`data-field` attribute'una bakarak `state.items[idx][field] = ...` yazıyor (bkz. dosyanın
mevcut kodu) — yeni `data-field="marka"` input'u için EK bir kod değişikliği gerekmiyor, mevcut
genel handler otomatik kapsıyor.

- [ ] **Step 3: `receipts.js`'in `p_items` mapping'ine `marka` ekle**

`src/lib/receipts.js:26-37`:
```js
    p_items: items.map((item, index) => ({
      productId: item.productId,
      lineNo: index + 1,
      lotNo: item.lotNo || null,
      skt: item.skt || null,
      quantity: item.quantity,
      unit: item.unit,
      urunSicakligi: item.urunSicakligi ?? null,
      yariOmurGecti: item.yariOmurGecti ?? false,
      uygunluk: item.uygunluk,
      note: item.note
    })),
```
şuna çevir (`marka: item.marka || null,` eklendi):
```js
    p_items: items.map((item, index) => ({
      productId: item.productId,
      lineNo: index + 1,
      marka: item.marka || null,
      lotNo: item.lotNo || null,
      skt: item.skt || null,
      quantity: item.quantity,
      unit: item.unit,
      urunSicakligi: item.urunSicakligi ?? null,
      yariOmurGecti: item.yariOmurGecti ?? false,
      uygunluk: item.uygunluk,
      note: item.note
    })),
```

- [ ] **Step 4: Başarısız testi yaz, sonra geçtiğini doğrula**

`tests/receipts.test.js`'e (mevcut `'createReceiptWithItems her satır için uygunluk ve not
değerini RPC'ye gönderir'` testinin ALTINA) ekle:

```js
  it('createReceiptWithItems marka değerini RPC\'ye gönderir', async () => {
    await createReceiptWithItems({
      ...baseArgs,
      items: [{ productId: 1, lotNo: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg', marka: 'Dardanel' }]
    });
    const rpcCall = supabase.rpc.mock.calls.find((call) => call[0] === 'create_receipt_with_items');
    expect(rpcCall[1].p_items[0].marka).toBe('Dardanel');
  });

  it('createReceiptWithItems marka verilmezse RPC\'ye null gönderir', async () => {
    await createReceiptWithItems({ ...baseArgs, items: validItems });
    const rpcCall = supabase.rpc.mock.calls.find((call) => call[0] === 'create_receipt_with_items');
    expect(rpcCall[1].p_items[0].marka).toBeNull();
  });
```

Run: `npm run test -- tests/receipts.test.js`
Expected: önce FAIL (marka `undefined` dönerken `toBe('Dardanel')`/`toBeNull()` beklentisiyle
uyuşmaz — `undefined !== 'Dardanel'` ve `undefined` `toBeNull()`'u geçmez), Step 3 uygulandıktan
sonra PASS.

- [ ] **Step 5: Tüm test paketini çalıştır**

Run: `npm run test`
Expected: tüm testler PASS (regresyon yok — `state.items.push`'a `marka: ''` eklenmesi ve
tabloya yeni bir sütun eklenmesi mevcut `yeni-kabul.test.js` testlerini bozmaz, çünkü o testler
tam satır şablonu eşitliği değil belirli davranışları kontrol ediyor).

- [ ] **Step 6: Commit**

```bash
git add src/pages/yeni-kabul.js src/lib/receipts.js tests/receipts.test.js
git commit -m "feat: yeni mal kabul formuna marka alani ekle"
```

---

## Task 3: Veri Katmanı — `getProductDetail` + `getCompanyDetail`

**Files:**
- Modify: `src/lib/statistics.js` (yeni iki fonksiyon ekleniyor, mevcut `getStatistics`
  dokunulmuyor)
- Test: `tests/statistics.test.js`

**Interfaces:**
- Consumes: `supabase` client'ı, `STATISTICS_ROW_LIMIT` (aynı dosyada zaten var).
- Produces: `getProductDetail(productId, {startDate, endDate} = {}) → { rows: [{companyId, companyName, marka, totalKg, totalAdet, rejectedCount}], truncated }`, `getCompanyDetail(companyId, {startDate, endDate} = {}) → { rows: [{productId, productName, marka, totalKg, totalAdet, rejectedCount}], truncated }` — Task 4'teki iki yeni sayfa bunları çağıracak.

- [ ] **Step 1: Başarısız testleri yaz**

`tests/statistics.test.js`'e, dosyanın SONUNA (`describe('getStatistics', ...)` bloğunun
kapanışından SONRA, aynı dosyada, mevcut `row()` yardımcı fonksiyonunu ve `query`/`mockData`
mock altyapısını yeniden kullanarak) ekle:

```js
function detailRow({ marka, companyId, companyName, productId, productName, unit, quantity, uygunluk }) {
  return {
    marka,
    quantity,
    unit,
    uygunluk,
    product_id: productId,
    products: { name: productName },
    receipts: { receipt_date: '2026-08-20', company_id: companyId, companies: { id: companyId, name: companyName } }
  };
}

describe('getProductDetail', () => {
  beforeEach(() => {
    mockData = { data: [], error: null, count: 0 };
    query = createQueryMock();
  });

  it('aynı ürünün farklı firma+marka kombinasyonlarını ayrı satır olarak gruplar', async () => {
    mockData = {
      data: [
        detailRow({ marka: 'X', companyId: 10, companyName: 'FIRMA A', productId: 1, productName: 'DANA', unit: 'kg', quantity: 5, uygunluk: 'uygun' }),
        detailRow({ marka: 'Y', companyId: 10, companyName: 'FIRMA A', productId: 1, productName: 'DANA', unit: 'kg', quantity: 3, uygunluk: 'uygun' }),
        detailRow({ marka: 'X', companyId: 20, companyName: 'FIRMA B', productId: 1, productName: 'DANA', unit: 'kg', quantity: 2, uygunluk: 'uygun' })
      ],
      count: 3,
      error: null
    };
    const { rows } = await getProductDetail(1);
    expect(rows).toHaveLength(3);
  });

  it('aynı firma+marka kombinasyonuna ait birden fazla satırı toplar', async () => {
    mockData = {
      data: [
        detailRow({ marka: 'X', companyId: 10, companyName: 'FIRMA A', productId: 1, productName: 'DANA', unit: 'kg', quantity: 5, uygunluk: 'uygun' }),
        detailRow({ marka: 'X', companyId: 10, companyName: 'FIRMA A', productId: 1, productName: 'DANA', unit: 'kg', quantity: 3, uygunluk: 'uygun' })
      ],
      count: 2,
      error: null
    };
    const { rows } = await getProductDetail(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalKg).toBe(8);
  });

  it('marka boşsa (null) "-" olarak döner', async () => {
    mockData = {
      data: [detailRow({ marka: null, companyId: 10, companyName: 'FIRMA A', productId: 1, productName: 'DANA', unit: 'kg', quantity: 5, uygunluk: 'uygun' })],
      count: 1,
      error: null
    };
    const { rows } = await getProductDetail(1);
    expect(rows[0].marka).toBe('-');
  });

  it('product_id filtresini uygular', async () => {
    await getProductDetail(42);
    expect(query.eq).toHaveBeenCalledWith('product_id', 42);
    expect(query.eq).toHaveBeenCalledWith('receipts.status', 'onaylandi');
  });

  it('sonuçları Toplam Kg\'ye göre azalan sıralar', async () => {
    mockData = {
      data: [
        detailRow({ marka: 'AZ', companyId: 10, companyName: 'AZ FIRMA', productId: 1, productName: 'DANA', unit: 'kg', quantity: 2, uygunluk: 'uygun' }),
        detailRow({ marka: 'COK', companyId: 20, companyName: 'COK FIRMA', productId: 1, productName: 'DANA', unit: 'kg', quantity: 50, uygunluk: 'uygun' })
      ],
      count: 2,
      error: null
    };
    const { rows } = await getProductDetail(1);
    expect(rows.map((r) => r.marka)).toEqual(['COK', 'AZ']);
  });

  it('count dönen satır sayısından büyükse truncated=true döner', async () => {
    mockData = {
      data: [detailRow({ marka: 'X', companyId: 10, companyName: 'FIRMA A', productId: 1, productName: 'DANA', unit: 'kg', quantity: 5, uygunluk: 'uygun' })],
      count: 50,
      error: null
    };
    const { truncated } = await getProductDetail(1);
    expect(truncated).toBe(true);
  });
});

describe('getCompanyDetail', () => {
  beforeEach(() => {
    mockData = { data: [], error: null, count: 0 };
    query = createQueryMock();
  });

  it('aynı firmanın farklı ürün+marka kombinasyonlarını ayrı satır olarak gruplar', async () => {
    mockData = {
      data: [
        detailRow({ marka: 'X', companyId: 10, companyName: 'FIRMA A', productId: 1, productName: 'DANA', unit: 'kg', quantity: 5, uygunluk: 'uygun' }),
        detailRow({ marka: 'X', companyId: 10, companyName: 'FIRMA A', productId: 2, productName: 'TAVUK', unit: 'kg', quantity: 3, uygunluk: 'uygun' })
      ],
      count: 2,
      error: null
    };
    const { rows } = await getCompanyDetail(10);
    expect(rows).toHaveLength(2);
  });

  it('company_id filtresini uygular', async () => {
    await getCompanyDetail(7);
    expect(query.eq).toHaveBeenCalledWith('receipts.company_id', 7);
    expect(query.eq).toHaveBeenCalledWith('receipts.status', 'onaylandi');
  });

  it('red sayısını doğru hesaplar', async () => {
    mockData = {
      data: [detailRow({ marka: 'X', companyId: 10, companyName: 'FIRMA A', productId: 1, productName: 'DANA', unit: 'kg', quantity: 5, uygunluk: 'uygun_degil' })],
      count: 1,
      error: null
    };
    const { rows } = await getCompanyDetail(10);
    expect(rows[0].rejectedCount).toBe(1);
  });
});
```

Test dosyasının en üstündeki import satırını güncelle:
```js
import { getStatistics, STATISTICS_ROW_LIMIT } from '../src/lib/statistics.js';
```
şuna çevir:
```js
import { getStatistics, getProductDetail, getCompanyDetail, STATISTICS_ROW_LIMIT } from '../src/lib/statistics.js';
```

- [ ] **Step 2: Testi çalıştır, `getProductDetail is not a function` ile FAIL ettiğini doğrula**

Run: `npm run test -- tests/statistics.test.js`
Expected: FAIL — henüz export edilmedi.

- [ ] **Step 3: `getProductDetail`/`getCompanyDetail`'i uygula**

`src/lib/statistics.js`'in SONUNA ekle:

```js
function groupDetailRows(data, { groupKey, buildRow, applyKgAdet }) {
  const map = new Map();
  for (const item of data) {
    const key = groupKey(item);
    if (!map.has(key)) {
      map.set(key, buildRow(item));
    }
    applyKgAdet(map.get(key), item);
  }
  const byKgDesc = (a, b) => b.totalKg - a.totalKg;
  return [...map.values()].sort(byKgDesc);
}

function applyItemTotals(row, item) {
  if (item.unit === 'kg') row.totalKg += Number(item.quantity);
  if (item.unit === 'ad') row.totalAdet += Number(item.quantity);
  if (item.uygunluk === 'uygun_degil') row.rejectedCount += 1;
}

export async function getProductDetail(productId, { startDate, endDate } = {}) {
  let query = supabase
    .from('receipt_items')
    .select(
      'marka, quantity, unit, uygunluk, receipts!inner (receipt_date, status, company_id, companies (id, name))',
      { count: 'exact' }
    )
    .eq('product_id', productId)
    .eq('receipts.status', 'onaylandi')
    .limit(STATISTICS_ROW_LIMIT);
  if (startDate) query = query.gte('receipts.receipt_date', startDate);
  if (endDate) query = query.lte('receipts.receipt_date', endDate);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = groupDetailRows(data, {
    groupKey: (item) => `${item.receipts?.company_id}::${item.marka || ''}`,
    buildRow: (item) => ({
      companyId: item.receipts?.company_id,
      companyName: item.receipts?.companies?.name || '-',
      marka: item.marka || '-',
      totalKg: 0,
      totalAdet: 0,
      rejectedCount: 0
    }),
    applyKgAdet: applyItemTotals
  });

  return { rows, truncated: count > data.length };
}

export async function getCompanyDetail(companyId, { startDate, endDate } = {}) {
  let query = supabase
    .from('receipt_items')
    .select(
      'marka, quantity, unit, uygunluk, product_id, products (name), receipts!inner (receipt_date, status, company_id)',
      { count: 'exact' }
    )
    .eq('receipts.company_id', companyId)
    .eq('receipts.status', 'onaylandi')
    .limit(STATISTICS_ROW_LIMIT);
  if (startDate) query = query.gte('receipts.receipt_date', startDate);
  if (endDate) query = query.lte('receipts.receipt_date', endDate);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = groupDetailRows(data, {
    groupKey: (item) => `${item.product_id}::${item.marka || ''}`,
    buildRow: (item) => ({
      productId: item.product_id,
      productName: item.products?.name || '-',
      marka: item.marka || '-',
      totalKg: 0,
      totalAdet: 0,
      rejectedCount: 0
    }),
    applyKgAdet: applyItemTotals
  });

  return { rows, truncated: count > data.length };
}
```

Not: `groupDetailRows`/`applyItemTotals` küçük paylaşılan yardımcılar — `getStatistics`'in kendi
aggregasyon döngüsüne (iki ayrı Map, ürün+firma için farklı davranış) dokunulmuyor, sadece yeni
iki fonksiyon kendi aralarında bu deseni paylaşıyor (DRY, ama mevcut `getStatistics`'i
yeniden yazmaya gerek yok).

- [ ] **Step 4: Testi çalıştır, PASS ettiğini doğrula**

Run: `npm run test -- tests/statistics.test.js`
Expected: PASS (mevcut 12 test + yeni testler).

- [ ] **Step 5: Tüm test paketini çalıştır**

Run: `npm run test`
Expected: tüm testler PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/statistics.js tests/statistics.test.js
git commit -m "feat: urun ve firma detay istatistikleri icin veri katmani ekle"
```

---

## Task 4: Detay Sayfaları + Tıklanabilir Satırlar + Routing

**Files:**
- Create: `src/pages/istatistik-urun-detay.js`
- Create: `src/pages/istatistik-firma-detay.js`
- Modify: `src/pages/istatistik.js` (satırları tıklanabilir yap)
- Modify: `src/main.js` (import + 2 yeni route, nav pill YOK)

**Interfaces:**
- Consumes: `getProductDetail`, `getCompanyDetail` (Task 3).
- Produces: `renderIstatistikUrunDetay(container)`, `renderIstatistikFirmaDetay(container)` —
  `main.js` bunları sırasıyla `/istatistik-urun-detay` ve `/istatistik-firma-detay`
  route'larına bağlar.

- [ ] **Step 1: `src/pages/istatistik-urun-detay.js`'i yaz**

```js
import { getProductDetail } from '../lib/statistics.js';
import { getQueryParam, navigate } from '../router.js';
import { escapeHtml } from '../lib/html.js';

export async function renderIstatistikUrunDetay(container) {
  const id = getQueryParam('id');
  const name = getQueryParam('name') || '-';
  if (!id) {
    container.innerHTML = '<p>Ürün bulunamadı.</p>';
    return;
  }

  container.innerHTML = `
    <button class="btn-ghost" id="back-btn">← İstatistiklere Dön</button>
    <div class="card">
      <div class="card-header"><div class="card-header-title">📦 ${escapeHtml(name)} — Detay</div></div>
      <p id="detay-msg"></p>
      <div id="detay-table"></div>
    </div>
  `;
  container.querySelector('#back-btn').addEventListener('click', () => navigate('/istatistik'));

  const msg = container.querySelector('#detay-msg');
  try {
    const { rows, truncated } = await getProductDetail(id);
    const table = container.querySelector('#detay-table');
    if (rows.length === 0) {
      table.innerHTML = '<p>Kayıt bulunamadı.</p>';
    } else {
      table.innerHTML = `
        <div style="overflow-x:auto;">
          <table class="card-table">
            <thead><tr><th>Firma</th><th>Marka</th><th>Toplam Kg</th><th>Toplam Adet</th><th>Red Sayısı</th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td>${escapeHtml(r.companyName)}</td>
                  <td>${escapeHtml(r.marka)}</td>
                  <td>${r.totalKg > 0 ? Math.round(r.totalKg * 100) / 100 : '-'}</td>
                  <td>${r.totalAdet > 0 ? Math.round(r.totalAdet * 100) / 100 : '-'}</td>
                  <td>${r.rejectedCount > 0 ? r.rejectedCount : '-'}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    if (truncated) {
      msg.style.color = '#a15c00';
      msg.textContent = 'Çok fazla kayıt var, sonuçlar eksik olabilir.';
    }
  } catch (err) {
    msg.style.color = '#b00020';
    msg.textContent = 'Hata: ' + err.message;
  }
}
```

- [ ] **Step 2: `src/pages/istatistik-firma-detay.js`'i yaz (simetrik)**

```js
import { getCompanyDetail } from '../lib/statistics.js';
import { getQueryParam, navigate } from '../router.js';
import { escapeHtml } from '../lib/html.js';

export async function renderIstatistikFirmaDetay(container) {
  const id = getQueryParam('id');
  const name = getQueryParam('name') || '-';
  if (!id) {
    container.innerHTML = '<p>Firma bulunamadı.</p>';
    return;
  }

  container.innerHTML = `
    <button class="btn-ghost" id="back-btn">← İstatistiklere Dön</button>
    <div class="card">
      <div class="card-header"><div class="card-header-title">🏢 ${escapeHtml(name)} — Detay</div></div>
      <p id="detay-msg"></p>
      <div id="detay-table"></div>
    </div>
  `;
  container.querySelector('#back-btn').addEventListener('click', () => navigate('/istatistik'));

  const msg = container.querySelector('#detay-msg');
  try {
    const { rows, truncated } = await getCompanyDetail(id);
    const table = container.querySelector('#detay-table');
    if (rows.length === 0) {
      table.innerHTML = '<p>Kayıt bulunamadı.</p>';
    } else {
      table.innerHTML = `
        <div style="overflow-x:auto;">
          <table class="card-table">
            <thead><tr><th>Ürün</th><th>Marka</th><th>Toplam Kg</th><th>Toplam Adet</th><th>Red Sayısı</th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td>${escapeHtml(r.productName)}</td>
                  <td>${escapeHtml(r.marka)}</td>
                  <td>${r.totalKg > 0 ? Math.round(r.totalKg * 100) / 100 : '-'}</td>
                  <td>${r.totalAdet > 0 ? Math.round(r.totalAdet * 100) / 100 : '-'}</td>
                  <td>${r.rejectedCount > 0 ? r.rejectedCount : '-'}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    if (truncated) {
      msg.style.color = '#a15c00';
      msg.textContent = 'Çok fazla kayıt var, sonuçlar eksik olabilir.';
    }
  } catch (err) {
    msg.style.color = '#b00020';
    msg.textContent = 'Hata: ' + err.message;
  }
}
```

- [ ] **Step 3: `istatistik.js`'teki satırları tıklanabilir yap**

`src/pages/istatistik.js:1-2` (import bloğu):
```js
import { getStatistics } from '../lib/statistics.js';
import { escapeHtml } from '../lib/html.js';
```
şuna çevir:
```js
import { getStatistics } from '../lib/statistics.js';
import { escapeHtml } from '../lib/html.js';
import { navigate } from '../router.js';
```

`src/pages/istatistik.js:4-26` (`renderTable` fonksiyonu) — isim hücresini tıklanabilir bir
butona çevir:
```js
function renderTable(rows, nameLabel) {
  if (rows.length === 0) return '<p>Kayıt bulunamadı.</p>';
  return `
    <div style="overflow-x:auto;">
    <table class="card-table">
      <thead><tr><th>${nameLabel}</th><th>Toplam Kg</th><th>Toplam Adet</th><th>Red Sayısı</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td><button class="btn-ghost" data-detay="${escapeHtml(r.id)}" data-name="${escapeHtml(r.name)}">${escapeHtml(r.name)}</button></td>
            <td>${r.totalKg > 0 ? Math.round(r.totalKg * 100) / 100 : '-'}</td>
            <td>${r.totalAdet > 0 ? Math.round(r.totalAdet * 100) / 100 : '-'}</td>
            <td>${r.rejectedCount > 0 ? r.rejectedCount : '-'}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
    </div>
  `;
}
```

`src/pages/istatistik.js`'teki `load()` fonksiyonunda, tabloların innerHTML'lerini yazan
satırların HEMEN ALTINA tıklama dinleyicileri ekle:

```js
      const { products, companies, truncated } = await getStatistics({ startDate, endDate });
      container.querySelector('#istatistik-products').innerHTML = renderTable(products, 'Ürün Adı');
      container.querySelectorAll('#istatistik-products [data-detay]').forEach((btn) => {
        btn.addEventListener('click', () =>
          navigate('/istatistik-urun-detay?id=' + btn.dataset.detay + '&name=' + encodeURIComponent(btn.dataset.name))
        );
      });
      container.querySelector('#istatistik-companies').innerHTML = renderTable(companies, 'Firma Adı');
      container.querySelectorAll('#istatistik-companies [data-detay]').forEach((btn) => {
        btn.addEventListener('click', () =>
          navigate('/istatistik-firma-detay?id=' + btn.dataset.detay + '&name=' + encodeURIComponent(btn.dataset.name))
        );
      });
```

(Bu, dosyadaki mevcut `const { products, companies, truncated } = await getStatistics(...)` ve
onu takip eden iki `innerHTML` atama satırının yerini alıyor — geri kalan `load()` gövdesi
[`truncated` kontrolü, `catch` bloğu] aynen kalıyor.)

- [ ] **Step 4: `main.js`'e route'ları bağla**

`src/main.js`'teki `renderIstatistik` import satırının altına ekle:
```js
import { renderIstatistikUrunDetay } from './pages/istatistik-urun-detay.js';
import { renderIstatistikFirmaDetay } from './pages/istatistik-firma-detay.js';
```

`registerRoute('/istatistik', renderIstatistik);` satırının hemen altına (koşulsuz, nav pill
YOK — sadece `/istatistik` sayfasındaki tıklamayla erişilir):
```js
    registerRoute('/istatistik-urun-detay', renderIstatistikUrunDetay);
    registerRoute('/istatistik-firma-detay', renderIstatistikFirmaDetay);
```

- [ ] **Step 5: Build ile derleme hatasını kontrol et**

Bu iki yeni sayfa için (mevcut projedeki basit sayfa deseniyle tutarlı) dedike bir test dosyası
yazılmıyor.

Run: `npm run build`
Expected: hatasız derleme.

- [ ] **Step 6: Tüm test paketini çalıştır**

Run: `npm run test`
Expected: tüm testler PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/istatistik-urun-detay.js src/pages/istatistik-firma-detay.js src/pages/istatistik.js src/main.js
git commit -m "feat: istatistik urun/firma detay sayfalarini ekle ve satirlari tiklanabilir yap"
```

---

## Task 5: Uçtan Uca Canlı Doğrulama

**Files:** yok (sadece doğrulama, kod değişikliği yok)

**Interfaces:** yok.

- [ ] **Step 1: `npm run build` ve `npm run test` ile son durumu doğrula**

Run: `npm run build && npm run test`
Expected: ikisi de temiz/PASS.

- [ ] **Step 2: Canlıda (veya kullanıcıdan) doğrulama iste**

- Yeni Mal Kabul formunda bir ürün satırına "Marka" girilip kayıt tamamlanabiliyor.
- İstatistik sayfasında bir ürün adına tıklanınca `/istatistik-urun-detay` açılıyor, doğru ürün
  adı başlıkta görünüyor, tabloda az önce girilen marka/firma/kg doğru görünüyor.
- Aynı ürüne farklı firma/markadan ikinci bir test kaydı girilirse, detay sayfasında İKİ AYRI
  satır olarak görünüyor (aynı firma+marka'dan tekrar girilirse tek satırda toplanıyor).
- İstatistik sayfasında bir firma adına tıklanınca `/istatistik-firma-detay` açılıyor, o
  firmadan gelen ürün+marka kırılımı doğru görünüyor.
- "← İstatistiklere Dön" butonu `/istatistik`'e geri dönüyor.
- Üç rolün de (admin, depo_yonetici, kalite_ekibi) bu detay sayfalarına erişebildiği (linkten
  tıklayarak) doğrulanıyor.

- [ ] **Step 3: Bulunan sorunları düzelt, ilgili task'ın testini güncelleyip tekrar çalıştır**
