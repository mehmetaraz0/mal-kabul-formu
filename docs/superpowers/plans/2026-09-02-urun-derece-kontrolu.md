# Ürün Bazlı Derece (Sıcaklık) Kontrolü Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task'ları bu dosyadaki sırayla uygula.**

**Goal:** Her ürün için (varsa) bir referans sıcaklık aralığı tanımlayıp, Yeni Mal Kabul'de sıcaklık girildikçe Uygun/Uygunsuz'u otomatik önermek.

**Architecture:** `products` tablosuna iki nullable sütun (`derece_min`, `derece_max`) eklenip, kullanıcının paylaştığı Excel'den (sadece uygulamada zaten kayıtlı ürünlerle eşleşen 278 satır) tek seferlik toplu bir UPDATE ile dolduruluyor. Frontend'de `listProducts()` bu iki alanı da döndürür; Yeni Mal Kabul'de bir ürün seçildiğinde kartın state'ine kopyalanır; Sıcaklık alanına her girişte (varsa) bu aralıkla karşılaştırılıp Uygunluk butonları otomatik güncellenir — kullanıcı yine de elle değiştirebilir.

**Tech Stack:** Vite + vanilla JS (mevcut proje), Supabase (Postgres, RLS değişmiyor — `products_select_all` zaten `using(true)`), Vitest.

## Global Constraints

- Tasarım belgesi: `docs/superpowers/specs/2026-09-02-urun-derece-kontrolu-design.md` — bu planın tüm kararları oradan gelir.
- Kabul aralıkları (dahil): `-18°C` referans → **[-22, -16]**; `+4°C`/`+4°C (et)` referans → **[2, 7]**.
- Migration `supabase/migrations/` altında sıradaki numarayla eklenir (bu plan `0017` kullanır) ve **Supabase SQL Editor'da kullanıcı tarafından elle çalıştırılır** — otomatik uygulanmaz.
- Excel'de olup `products` tablosunda karşılığı olmayan ürünler İÇE AKTARILMAZ (yeni ürün oluşturulmaz) — sadece eşleşenler güncellenir.
- Otomatik Uygunluk ataması bir ÖNERİDİR, kilit değildir — kullanıcı her zaman elle Uygun/Uygunsuz butonlarına tıklayıp değiştirebilir.
- `derece_min`/`derece_max` tanımsız (`null`) bir ürün için otomatik davranış hiç tetiklenmez.

---

## Task 1: Migration 0017 — `derece_min`/`derece_max` Sütunları + Veri İçe Aktarımı

**Files:**
- Create: `supabase/migrations/0017_urun_derece_kontrolu.sql`

**Interfaces:**
- Consumes: mevcut `products` tablosu (0001), `code` sütunu (unique, LN Kodu ile eşleşiyor).
- Produces: `products.derece_min numeric`, `products.derece_max numeric` (nullable). Task 2 (`listProducts()`) bu sütunları okuyacak.

- [ ] **Step 1: Migration dosyasını yaz**

`supabase/migrations/0017_urun_derece_kontrolu.sql`:

```sql
-- 0017_urun_derece_kontrolu.sql
--
-- Kullanıcının paylaştığı Urun_Derece_Esleme.xlsx dosyasındaki referans sıcaklıkları products
-- tablosuna işliyor. Sadece uygulamada ZATEN kayıtlı ürünler eşleştiriliyor (kullanıcı kararı:
-- "ürün listemiz sabit, uygulamada kayıtlı olan ürünlere dereceler alınıyor") — WHERE p.code =
-- v.code eşleşmesi olmayan Excel satırları hiçbir etki yaratmadan atlanıyor, yeni ürün
-- eklenmiyor.
--
-- Tolerans kuralları (kullanıcı onayı, bkz.
-- docs/superpowers/specs/2026-09-02-urun-derece-kontrolu-design.md):
--   -18°C referanslı (donuk)  -> kabul aralığı [-22, -16]
--   +4°C referanslı (soğuk)   -> kabul aralığı [2, 7]
--   "Ölçüm gerekmez" / boş    -> derece_min/derece_max NULL kalır, otomatik kontrol hiç çalışmaz

alter table products add column if not exists derece_min numeric;
alter table products add column if not exists derece_max numeric;

update products p set derece_min = v.derece_min, derece_max = v.derece_max
from (values
  ('YIY01000001', -22, -16),
  ('YIY01000002', -22, -16),
  ('YIY01000003', -22, -16),
  ('YIY01000004', -22, -16),
  ('YIY01000005', -22, -16),
  ('YIY01000006', -22, -16),
  ('YIY01000007', -22, -16),
  ('YIY01000008', -22, -16),
  ('YIY01000009', -22, -16),
  ('YIY01000012', -22, -16),
  ('YIY01000013', -22, -16),
  ('YIY01000014', -22, -16),
  ('YIY01000015', -22, -16),
  ('YIY01000016', -22, -16),
  ('YIY01000017', -22, -16),
  ('YIY01000018', -22, -16),
  ('YIY01000019', -22, -16),
  ('YIY01000020', -22, -16),
  ('YIY01000021', -22, -16),
  ('YIY01000022', -22, -16),
  ('YIY01000023', -22, -16),
  ('YIY01000024', -22, -16),
  ('YIY01000025', -22, -16),
  ('YIY01000026', -22, -16),
  ('YIY01000027', -22, -16),
  ('YIY01000028', -22, -16),
  ('YIY01000031', -22, -16),
  ('YIY01000032', -22, -16),
  ('YIY01000033', -22, -16),
  ('YIY01000035', -22, -16),
  ('YIY01000036', -22, -16),
  ('YIY01000037', -22, -16),
  ('YIY01000038', -22, -16),
  ('YIY01000039', -22, -16),
  ('YIY01000040', 2, 7),
  ('YIY01000041', 2, 7),
  ('YIY01000042', 2, 7),
  ('YIY01000043', 2, 7),
  ('YIY01000044', 2, 7),
  ('YIY01000045', 2, 7),
  ('YIY01000046', 2, 7),
  ('YIY01000047', 2, 7),
  ('YIY01000048', 2, 7),
  ('YIY01000049', 2, 7),
  ('YIY01000050', 2, 7),
  ('YIY01000051', 2, 7),
  ('YIY01000052', 2, 7),
  ('YIY01000054', 2, 7),
  ('YIY01000055', 2, 7),
  ('YIY01000056', 2, 7),
  ('YIY01000057', 2, 7),
  ('YIY01000058', -22, -16),
  ('YIY01000059', -22, -16),
  ('YIY01000060', -22, -16),
  ('YIY01000061', -22, -16),
  ('YIY01000078', 2, 7),
  ('YIY01000063', -22, -16),
  ('YIY01000064', -22, -16),
  ('YIY01000065', -22, -16),
  ('YIY01000068', -22, -16),
  ('YIY01000069', -22, -16),
  ('YIY01000070', -22, -16),
  ('YIY01000084', 2, 7),
  ('YIY01000083', -22, -16),
  ('YIY01000145', 2, 7),
  ('YIY01000086', -22, -16),
  ('YIY01000087', -22, -16),
  ('YIY01000088', -22, -16),
  ('YIY01000157', 2, 7),
  ('YIY01000093', -22, -16),
  ('YIY01000205', 2, 7),
  ('YIY01000118', -22, -16),
  ('YIY01000167', -22, -16),
  ('YIY01000181', -22, -16),
  ('YIY01000215', -22, -16),
  ('YIY02000001', -22, -16),
  ('YIY02000002', -22, -16),
  ('YIY02000004', -22, -16),
  ('YIY02000005', -22, -16),
  ('YIY02000006', -22, -16),
  ('YIY02000007', -22, -16),
  ('YIY02000008', -22, -16),
  ('YIY02000009', -22, -16),
  ('YIY02000011', -22, -16),
  ('YIY02000013', -22, -16),
  ('YIY02000014', -22, -16),
  ('YIY02000015', -22, -16),
  ('YIY02000016', -22, -16),
  ('YIY02000017', -22, -16),
  ('YIY02000018', -22, -16),
  ('YIY02000019', -22, -16),
  ('YIY02000021', -22, -16),
  ('YIY02000025', -22, -16),
  ('YIY02000026', -22, -16),
  ('YIY02000027', -22, -16),
  ('YIY02000028', -22, -16),
  ('YIY02000032', -22, -16),
  ('YIY02000034', -22, -16),
  ('YIY02000035', -22, -16),
  ('YIY02000040', -22, -16),
  ('YIY02000055', -22, -16),
  ('YIY02000058', -22, -16),
  ('YIY02000060', -22, -16),
  ('YIY02000061', -22, -16),
  ('YIY02000062', -22, -16),
  ('YIY02000063', -22, -16),
  ('YIY02000066', -22, -16),
  ('YIY02000071', -22, -16),
  ('YIY02000072', -22, -16),
  ('YIY02000073', -22, -16),
  ('YIY02000075', -22, -16),
  ('YIY02000076', -22, -16),
  ('YIY02000077', -22, -16),
  ('YIY02000081', -22, -16),
  ('YIY02000090', -22, -16),
  ('YIY02000099', -22, -16),
  ('YIY02000101', -22, -16),
  ('YIY02000139', -22, -16),
  ('YIY04000001', -22, -16),
  ('YIY04000002', -22, -16),
  ('YIY04000003', -22, -16),
  ('YIY04000004', -22, -16),
  ('YIY04000005', -22, -16),
  ('YIY04000006', -22, -16),
  ('YIY04000007', -22, -16),
  ('YIY04000009', -22, -16),
  ('YIY04000012', -22, -16),
  ('YIY04000013', -22, -16),
  ('YIY04000014', -22, -16),
  ('YIY04000015', -22, -16),
  ('YIY04000016', -22, -16),
  ('YIY04000019', -22, -16),
  ('YIY04000020', -22, -16),
  ('YIY04000021', -22, -16),
  ('YIY04000022', -22, -16),
  ('YIY04000023', -22, -16),
  ('YIY04000024', -22, -16),
  ('YIY04000025', -22, -16),
  ('YIY04000026', -22, -16),
  ('YIY04000032', -22, -16),
  ('YIY04000037', -22, -16),
  ('YIY04000038', -22, -16),
  ('YIY04000039', -22, -16),
  ('YIY04000041', -22, -16),
  ('YIY04000042', -22, -16),
  ('YIY04000043', -22, -16),
  ('YIY04000045', -22, -16),
  ('YIY04000047', -22, -16),
  ('YIY04000053', -22, -16),
  ('YIY04000057', -22, -16),
  ('YIY04000060', -22, -16),
  ('YIY04000061', -22, -16),
  ('YIY04000063', -22, -16),
  ('YIY04000065', -22, -16),
  ('YIY04000066', -22, -16),
  ('YIY04000067', -22, -16),
  ('YIY04000084', -22, -16),
  ('YIY04000086', -22, -16),
  ('YIY04000088', -22, -16),
  ('YIY04000090', -22, -16),
  ('YIY04000091', -22, -16),
  ('YIY04000092', -22, -16),
  ('YIY04000097', -22, -16),
  ('YIY04000098', -22, -16),
  ('YIY04000104', -22, -16),
  ('YIY04000105', -22, -16),
  ('YIY04000106', -22, -16),
  ('YIY04000107', -22, -16),
  ('YIY04000109', -22, -16),
  ('YIY04000111', -22, -16),
  ('YIY04000112', -22, -16),
  ('YIY04000161', -22, -16),
  ('YIY04000162', -22, -16),
  ('YIY04000164', -22, -16),
  ('YIY04000165', -22, -16),
  ('YIY04000166', -22, -16),
  ('YIY04000168', -22, -16),
  ('YIY04000169', -22, -16),
  ('YIY04000170', -22, -16),
  ('YIY04000173', -22, -16),
  ('YIY04000174', -22, -16),
  ('YIY04000175', -22, -16),
  ('YIY04000179', -22, -16),
  ('YIY04000181', -22, -16),
  ('YIY04000186', -22, -16),
  ('YIY04000189', -22, -16),
  ('YIY04000190', -22, -16),
  ('YIY04000191', -22, -16),
  ('YIY04000192', -22, -16),
  ('YIY04000193', -22, -16),
  ('YIY04000194', -22, -16),
  ('YIY04000195', -22, -16),
  ('YIY04000196', -22, -16),
  ('YIY04000197', -22, -16),
  ('YIY04000199', -22, -16),
  ('YIY04000200', -22, -16),
  ('YIY04000201', -22, -16),
  ('YIY04000202', -22, -16),
  ('YIY04000203', -22, -16),
  ('YIY04000208', -22, -16),
  ('YIY04000212', -22, -16),
  ('YIY04000213', -22, -16),
  ('YIY04000214', -22, -16),
  ('YIY04000215', -22, -16),
  ('YIY04000216', -22, -16),
  ('YIY06000001', -22, -16),
  ('YIY06000002', -22, -16),
  ('YIY06000003', -22, -16),
  ('YIY06000004', -22, -16),
  ('YIY06000005', -22, -16),
  ('YIY06000006', -22, -16),
  ('YIY06000007', -22, -16),
  ('YIY06000008', -22, -16),
  ('YIY06000009', -22, -16),
  ('YIY06000010', -22, -16),
  ('YIY06000011', -22, -16),
  ('YIY06000012', -22, -16),
  ('YIY06000013', -22, -16),
  ('YIY06000014', -22, -16),
  ('YIY06000015', -22, -16),
  ('YIY06000016', -22, -16),
  ('YIY06000017', -22, -16),
  ('YIY06000018', -22, -16),
  ('YIY06000019', -22, -16),
  ('YIY06000022', -22, -16),
  ('YIY06000157', -22, -16),
  ('YIY06000186', -22, -16),
  ('YIY06000215', -22, -16),
  ('YIY06000233', -22, -16),
  ('YIY06000259', -22, -16),
  ('YIY06000260', -22, -16),
  ('YIY07000040', -22, -16),
  ('YIY07000041', -22, -16),
  ('YIY07000042', -22, -16),
  ('YIY07000043', -22, -16),
  ('YIY07000044', -22, -16),
  ('YIY07000046', -22, -16),
  ('YIY07000047', -22, -16),
  ('YIY07000048', -22, -16),
  ('YIY07000049', -22, -16),
  ('YIY07000052', -22, -16),
  ('YIY07000061', -22, -16),
  ('YIY07000095', -22, -16),
  ('YIY07000096', -22, -16),
  ('YIY07000108', -22, -16),
  ('YIY07000110', -22, -16),
  ('YIY07000115', -22, -16),
  ('YIY07000148', -22, -16),
  ('YIY07000168', -22, -16),
  ('YIY07000170', -22, -16),
  ('YIY07000186', -22, -16),
  ('YIY07000252', -22, -16),
  ('YIY07000257', -22, -16),
  ('YIY08000081', -22, -16),
  ('YIY01000062', 2, 7),
  ('YIY01000089', 2, 7),
  ('YIY01000099', 2, 7),
  ('YIY01000100', 2, 7),
  ('YIY01000101', 2, 7),
  ('YIY01000127', 2, 7),
  ('YIY01000143', 2, 7),
  ('YIY01000196', 2, 7),
  ('YIY01000211', 2, 7),
  ('YIY01000112', -22, -16),
  ('YIY01000119', -22, -16),
  ('YIY01000122', -22, -16),
  ('YIY01000134', -22, -16),
  ('YIY01000135', -22, -16),
  ('YIY01000179', -22, -16),
  ('YIY01000180', -22, -16),
  ('YIY01000187', -22, -16),
  ('YIY01000188', -22, -16),
  ('YIY01000197', -22, -16),
  ('YIY01000201', -22, -16),
  ('YIY01000209', -22, -16),
  ('YIY01000213', -22, -16),
  ('YIY01000214', -22, -16),
  ('YIY01000216', -22, -16)
) as v(code, derece_min, derece_max)
where p.code = v.code;
```

- [ ] **Step 2: Kullanıcıdan migration'ı Supabase SQL Editor'da çalıştırmasını iste**

Kullanıcıya şu mesajı ilet: "0017_urun_derece_kontrolu.sql dosyasının tamamını Supabase SQL
Editor'da çalıştırıp onaylar mısın?" — onay gelmeden Task 4'e (canlı doğrulama) geçme.

- [ ] **Step 3: Doğrula — kaç satır güncellendi**

Kullanıcıdan şu sorguyu SQL Editor'da çalıştırıp sonucu paylaşmasını iste:
```sql
select count(*) from products where derece_min is not null;
```
Beklenen: 278'den KÜÇÜK VEYA EŞİT bir sayı (Excel'de olup `products`'ta karşılığı olmayan
kodlar için hiçbir satır güncellenmediğinden 278'den az çıkması normal ve beklenen bir durum,
278'den FAZLA çıkması ise bir hata işaretidir).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0017_urun_derece_kontrolu.sql
git commit -m "feat: urunlere referans derece araligi ekle (derece_min/derece_max)"
```

---

## Task 2: `listProducts()` Yeni Sütunları Döndürsün

**Files:**
- Modify: `src/lib/products.js:16`
- Test: `tests/products.test.js`

**Interfaces:**
- Consumes: Task 1'deki `products.derece_min`/`products.derece_max` sütunları.
- Produces: `listProducts()`'ın döndürdüğü her ürün nesnesi artık `derece_min`/`derece_max`
  alanlarını da taşıyor (varsa sayı, yoksa `null`). Task 3 bunu tüketecek.

- [ ] **Step 1: Başarısız testi yaz**

`tests/products.test.js`'in en üstündeki mock'u güncelle — mevcut hali:
```js
vi.mock('../src/lib/supabase.js', () => {
  const order = vi.fn(() => Promise.resolve({ data: [{ id: 1, code: 'YIY01000001', name: 'TEST ÜRÜN', unit: 'kg', category: 'ET' }], error: null }));
  const select = vi.fn(() => ({ order }));
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn(() => ({ select, insert }));
  return { supabase: { from } };
});
```
şuna çevir (mock veriye `derece_min`/`derece_max` eklendi):
```js
vi.mock('../src/lib/supabase.js', () => {
  const order = vi.fn(() => Promise.resolve({
    data: [{ id: 1, code: 'YIY01000001', name: 'TEST ÜRÜN', unit: 'kg', category: 'ET', derece_min: -22, derece_max: -16 }],
    error: null
  }));
  const select = vi.fn(() => ({ order }));
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn(() => ({ select, insert }));
  return { supabase: { from } };
});
```

Mevcut `describe('products', ...)` bloğundaki `'listProducts kategoriye göre gruplanabilir veri
döner'` testinin ALTINA ekle:
```js
  it('listProducts derece_min/derece_max alanlarını döner ve select sorgusuna dahil eder', async () => {
    const result = await listProducts();
    expect(result[0].derece_min).toBe(-22);
    expect(result[0].derece_max).toBe(-16);
    expect(supabase.from).toHaveBeenCalledWith('products');
  });
```

- [ ] **Step 2: Testi çalıştır, FAIL ettiğini doğrula**

Run: `npm run test -- tests/products.test.js`
Expected: FAIL — `result[0].derece_min`/`derece_max` mevcut kodda `undefined` (select sorgusu
bu sütunları istemiyor, mock veriye eklenmiş olsalar bile `listProducts` onları kırpmıyor ama bu
testin asıl amacı select sorgusunun GERÇEK backend'de bu sütunları istediğini garanti etmek —
Step 3'ten sonra bu netleşecek; şu anki select string'i `'id, code, name, unit, category'` olduğu
için gerçek bir Supabase sorgusunda bu alanlar hiç dönmeyecekti).

- [ ] **Step 3: `listProducts()`'ı güncelle**

`src/lib/products.js:16`:
```js
    const { data, error } = await supabase.from('products').select('id, code, name, unit, category').order('category');
```
şuna çevir:
```js
    const { data, error } = await supabase.from('products').select('id, code, name, unit, category, derece_min, derece_max').order('category');
```

- [ ] **Step 4: Testi çalıştır, PASS ettiğini doğrula**

Run: `npm run test -- tests/products.test.js`
Expected: PASS (tüm testler, yenisi dahil).

- [ ] **Step 5: Commit**

```bash
git add src/lib/products.js tests/products.test.js
git commit -m "feat: listProducts derece_min/derece_max alanlarini dondursun"
```

---

## Task 3: Yeni Mal Kabul — Otomatik Uygunluk Önerisi

**Files:**
- Modify: `src/pages/yeni-kabul.js`
- Test: `tests/yeni-kabul.test.js`

**Interfaces:**
- Consumes: `listProducts()`'ın döndürdüğü `derece_min`/`derece_max` (Task 2).
- Produces: yok (uçtaki davranış, başka task buna bağlı değil).

- [ ] **Step 1: Başarısız testleri yaz**

`tests/yeni-kabul.test.js`'te, `describe('yeni-kabul ürün kartları', ...)` bloğunun
`beforeEach`'indeki `listProducts.mockResolvedValue([...])` çağrısını bul ve mock ürün
listesine `derece_min`/`derece_max` ekle. Mevcut hali (yaklaşık):
```js
    listProducts.mockResolvedValue([
      { id: 1, code: 'P1', name: 'DANA KUŞBAŞI', unit: 'kg', category: 'ET' },
      { id: 2, code: 'P2', name: 'TAVUK BUT', unit: 'kg', category: 'ET' }
    ]);
```
şuna çevir:
```js
    listProducts.mockResolvedValue([
      { id: 1, code: 'P1', name: 'DANA KUŞBAŞI', unit: 'kg', category: 'ET', derece_min: -22, derece_max: -16 },
      { id: 2, code: 'P2', name: 'TAVUK BUT', unit: 'kg', category: 'ET', derece_min: null, derece_max: null }
    ]);
```
(İlk ürün donuk referanslı — otomatik kontrol testleri bunu kullanacak; ikinci ürünün
`derece_min`/`derece_max`'ı `null` — "referans yoksa otomatik davranış hiç tetiklenmez" testi
bunu kullanacak.)

Aynı `describe` bloğunun SONUNA (mevcut son testin altına) ekle:
```js
  it('referans aralığı olan bir üründe, aralık İÇİNDE bir sıcaklık girilince Uygunluk otomatik "uygun" olur', () => {
    const input = container.querySelector('.urun-arama[data-index="0"] .search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('.urun-arama[data-index="0"] .search-results li').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const sicaklikInput = container.querySelector('input[data-field="urunSicakligi"][data-index="0"]');
    sicaklikInput.value = '-18';
    sicaklikInput.dispatchEvent(new Event('input', { bubbles: true }));

    const uygunBtn = container.querySelector('[data-uygunluk="uygun"][data-index="0"]');
    expect(uygunBtn.className).toContain('btn-success');
  });

  it('referans aralığı olan bir üründe, aralık DIŞINDA bir sıcaklık girilince Uygunluk otomatik "uygun_degil" olur', () => {
    const input = container.querySelector('.urun-arama[data-index="0"] .search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('.urun-arama[data-index="0"] .search-results li').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const sicaklikInput = container.querySelector('input[data-field="urunSicakligi"][data-index="0"]');
    sicaklikInput.value = '-10';
    sicaklikInput.dispatchEvent(new Event('input', { bubbles: true }));

    const uygunsuzBtn = container.querySelector('[data-uygunluk="uygun_degil"][data-index="0"]');
    expect(uygunsuzBtn.className).toContain('btn-danger');
  });

  it('otomatik seçim sonrası kullanıcı elle farklı bir Uygunluk seçebilir', () => {
    const input = container.querySelector('.urun-arama[data-index="0"] .search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('.urun-arama[data-index="0"] .search-results li').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const sicaklikInput = container.querySelector('input[data-field="urunSicakligi"][data-index="0"]');
    sicaklikInput.value = '-10'; // aralık dışı -> otomatik uygun_degil olur
    sicaklikInput.dispatchEvent(new Event('input', { bubbles: true }));

    const uygunBtn = container.querySelector('[data-uygunluk="uygun"][data-index="0"]');
    uygunBtn.click(); // kullanıcı elle Uygun'a basıyor

    expect(uygunBtn.className).toContain('btn-success');
    const uygunsuzBtn = container.querySelector('[data-uygunluk="uygun_degil"][data-index="0"]');
    expect(uygunsuzBtn.className).not.toContain('btn-danger');
  });

  it('referans aralığı olmayan (derece_min/max null) bir üründe sıcaklık girilince Uygunluk değişmez', () => {
    // İki ürünlü listede TAVUK BUT (id:2) derece_min/max=null taşıyor.
    container.querySelector('#urun-ekle-btn').click(); // 2. kart
    const input = container.querySelector('.urun-arama[data-index="1"] .search-input');
    input.value = 'tavuk';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('.urun-arama[data-index="1"] .search-results li').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const sicaklikInput = container.querySelector('input[data-field="urunSicakligi"][data-index="1"]');
    sicaklikInput.value = '-10';
    sicaklikInput.dispatchEvent(new Event('input', { bubbles: true }));

    const uygunBtn = container.querySelector('[data-uygunluk="uygun"][data-index="1"]');
    const uygunsuzBtn = container.querySelector('[data-uygunluk="uygun_degil"][data-index="1"]');
    expect(uygunBtn.className).not.toContain('btn-success');
    expect(uygunsuzBtn.className).not.toContain('btn-danger');
  });
```

- [ ] **Step 2: Testi çalıştır, FAIL ettiğini doğrula**

Run: `npm run test -- tests/yeni-kabul.test.js`
Expected: FAIL — sıcaklık girilince Uygunluk butonları hiç değişmiyor (otomatik davranış henüz
yok).

- [ ] **Step 3: `src/pages/yeni-kabul.js`'i güncelle**

`src/pages/yeni-kabul.js:16-21`'deki (`emptyItem()`) fonksiyonu:
```js
  function emptyItem() {
    return {
      productId: null, code: '', name: '', unit: '', marka: '', lotNo: '', skt: '',
      quantity: 0, urunSicakligi: '', yariOmurGecti: false, uygunluk: 'beklemede', note: ''
    };
  }
```
şuna çevir (`dereceMin`/`dereceMax` eklendi):
```js
  function emptyItem() {
    return {
      productId: null, code: '', name: '', unit: '', marka: '', lotNo: '', skt: '',
      quantity: 0, urunSicakligi: '', yariOmurGecti: false, uygunluk: 'beklemede', note: '',
      dereceMin: null, dereceMax: null
    };
  }
```

`src/pages/yeni-kabul.js:81`'in (`function renderUrunKartlari() {`) HEMEN ÜSTÜNE yeni bir
yardımcı fonksiyon ekle (Uygun/Uygunsuz butonlarının görünümünü güncelleyen kod, hem tıklama hem
otomatik öneri tarafından paylaşılacak):
```js
  function updateUygunlukButtons(wrap, idx) {
    wrap.querySelectorAll(`[data-uygunluk][data-index="${idx}"]`).forEach((b) => {
      const isActive = b.dataset.uygunluk === state.items[idx].uygunluk;
      b.className = isActive ? (b.dataset.uygunluk === 'uygun' ? 'btn-success' : 'btn-danger') : 'btn-ghost';
    });
  }

  function renderUrunKartlari() {
```

`src/pages/yeni-kabul.js:126-129`'daki (ürün seçimi `onSelect`) kodu:
```js
        onSelect: (p) => {
          state.items[i] = { ...state.items[i], productId: p.id, code: p.code, name: p.name, unit: p.unit };
          renderUrunKartlari();
        }
```
şuna çevir (seçilen ürünün derece aralığı da karta kopyalanıyor):
```js
        onSelect: (p) => {
          state.items[i] = {
            ...state.items[i], productId: p.id, code: p.code, name: p.name, unit: p.unit,
            dereceMin: p.derece_min ?? null, dereceMax: p.derece_max ?? null
          };
          renderUrunKartlari();
        }
```

`src/pages/yeni-kabul.js:140-147`'deki (metin/sayı input handler'ı) kodu:
```js
    wrap.querySelectorAll('input:not([type="checkbox"])').forEach((input) => {
      if (!input.dataset.field) return; // Birim alanı: disabled, salt-okunur, state'e yazılmıyor
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.index);
        const field = input.dataset.field;
        state.items[idx][field] = field === 'quantity' ? Number(input.value) : input.value;
      });
    });
```
şuna çevir (`urunSicakligi` için otomatik Uygunluk önerisi eklendi):
```js
    wrap.querySelectorAll('input:not([type="checkbox"])').forEach((input) => {
      if (!input.dataset.field) return; // Birim alanı: disabled, salt-okunur, state'e yazılmıyor
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.index);
        const field = input.dataset.field;
        state.items[idx][field] = field === 'quantity' ? Number(input.value) : input.value;

        // Sıcaklık girildiğinde, üründe bir referans aralık tanımlıysa Uygunluk'u otomatik
        // öner — bu bir varsayılan, kullanıcı Uygun/Uygunsuz butonlarına elle tıklayarak
        // her zaman değiştirebilir (kilit değil).
        if (field === 'urunSicakligi') {
          const item = state.items[idx];
          if (item.dereceMin != null && item.dereceMax != null && input.value !== '') {
            const sicaklik = Number(input.value);
            if (!Number.isNaN(sicaklik)) {
              item.uygunluk = sicaklik >= item.dereceMin && sicaklik <= item.dereceMax ? 'uygun' : 'uygun_degil';
              updateUygunlukButtons(wrap, idx);
            }
          }
        }
      });
    });
```

`src/pages/yeni-kabul.js:148-157`'deki (Uygunluk buton tıklama) kodu:
```js
    wrap.querySelectorAll('[data-uygunluk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        state.items[idx].uygunluk = btn.dataset.uygunluk;
        wrap.querySelectorAll(`[data-uygunluk][data-index="${idx}"]`).forEach((b) => {
          const isActive = b.dataset.uygunluk === state.items[idx].uygunluk;
          b.className = isActive ? (b.dataset.uygunluk === 'uygun' ? 'btn-success' : 'btn-danger') : 'btn-ghost';
        });
      });
    });
```
şuna çevir (görünüm güncellemesi artık paylaşılan `updateUygunlukButtons`'a taşındı):
```js
    wrap.querySelectorAll('[data-uygunluk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        state.items[idx].uygunluk = btn.dataset.uygunluk;
        updateUygunlukButtons(wrap, idx);
      });
    });
```

- [ ] **Step 4: Testi çalıştır, PASS ettiğini doğrula**

Run: `npm run test -- tests/yeni-kabul.test.js`
Expected: PASS (tüm testler, dördü de yeni dahil).

- [ ] **Step 5: Tüm test paketini çalıştır**

Run: `npm run test`
Expected: tüm testler PASS (regresyon yok).

- [ ] **Step 6: Build ile derleme hatasını kontrol et**

Run: `npm run build`
Expected: hatasız derleme.

- [ ] **Step 7: Commit**

```bash
git add src/pages/yeni-kabul.js tests/yeni-kabul.test.js
git commit -m "feat: siracklik girildikce uygunluk otomatik onerilsin"
```

---

## Task 4: Uçtan Uca Canlı Doğrulama

**Files:** yok (sadece doğrulama, kod değişikliği yok)

**Interfaces:** yok.

- [ ] **Step 1: `npm run build` ve `npm run test` ile son durumu doğrula**

Run: `npm run build && npm run test`
Expected: ikisi de temiz/PASS.

- [ ] **Step 2: Kullanıcıdan canlı doğrulama iste**

Şunları kontrol et:
1. Migration çalıştıktan sonra, bilinen donuk bir ürünü (ör. Excel'deki `YIY01000006` DANA
   ANTRIKOT) Yeni Mal Kabul'de seçip Sıcaklık alanına `-18` girince Uygunluk otomatik "Uygun"
   (yeşil) oluyor.
2. Aynı ürüne `-10` girilince Uygunluk otomatik "Uygunsuz" (kırmızı) oluyor.
3. Otomatik seçim sonrası kullanıcı elle karşıt butona basınca değişiyor (kilitli değil).
4. Referans aralığı olmayan bir ürün seçilip herhangi bir sıcaklık girilince Uygunluk hiç
   otomatik değişmiyor (elle seçim gerekiyor, eskisi gibi).

- [ ] **Step 3: Bulunan sorunları düzelt, ilgili task'ın testini güncelleyip tekrar çalıştır**
