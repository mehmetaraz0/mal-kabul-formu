# Kalite Onayını Kaldırma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ayrı bir "kalite onayı" rolü/ekranı/durum basamağını kaldırıp, mal kabulünü yapan kişinin her ürün satırının uygunluğunu (uygun/uygun değil + not) **aynı formda, tek adımda** işaretleyip kaydettiği, mobil kullanım için basit bir kayıt uygulamasına dönüştürmek.

**Architecture:** `create_receipt_with_items` RPC'si (Plan 3/4/5'te oluşturulup sertleştirilmişti) satırları artık sabit `beklemede` yerine istemcinin gönderdiği `uygunluk`/`note` değerleriyle ekler; "Kaydet" dendiğinde aynı atomik çağrı içinde durumu doğrudan `onaylandi`'ye taşır (ara `kalite_bekliyor` basamağı kalkar). Var olan "tüm satırlar işaretlenmeden onaylanamaz" veritabanı tetikleyicisi (`check_receipt_approval`, 0007) hiç değişmeden kalır — bu, tam olarak istenen "kayıt kontrolü" güvencesini zaten sağlıyordu, sadece işaretleyen kişi artık ayrı bir "kalite ekibi" değil, kaydı oluşturan kişinin kendisi. RLS politikaları tek-rol modeline göre sadeleştirilir (rol kontrolü kalkar, sadece `received_by = auth.uid()` sahiplik kontrolü kalır). `kalite-onay.js` sayfası, `/kalite-onay` rotası ve nav linki tamamen kaldırılır.

**Tech Stack:** Plan 1-5'in üzerine inşa edilir. Yeni bağımlılık yok.

## Global Constraints

- **Bu bir GERİYE DÖNÜK UYUMSUZ RLS/şema davranışı değişikliğidir** — `profiles.role` sütunu ve CHECK kısıtı (backward-compat, mevcut satırlar bozulmasın diye) DOKUNULMADAN bırakılır, ama hiçbir politika artık `role = 'depo_yonetici'` veya `role = 'kalite_ekibi'` kontrolü YAPMAZ. Herhangi bir authenticated kullanıcı kendi oluşturduğu (`received_by = auth.uid()`) kaydı baştan sona tek başına yönetebilir.
- Var olan geçmiş kayıtlar (`status in ('kalite_bekliyor', 'reddedildi')`) veritabanında OLDUĞU GİBİ kalır — bu plan mevcut veriyi migrate ETMEZ, sadece YENİ kayıtların artık bu durumlara giremeyeceğini sağlar. Kayıt Ara sayfası bu eski durumları göstermeye devam eder (kod değişikliği gerekmez, zaten tüm durum değerlerini gösterecek şekilde yazılmıştı).
- Yazdırılabilir/PDF/Excel çıktısı (`mal-kabul-ciktisi.js`, `mal-kabul-excel.js`) **değiştirilmez** — gerçek kağıt forma (F.22) birebir uyan şablon Plan 4'te doğrulanmıştı; "Kalite Kontrol"/"Kalite Notu" alanları artık hep boş ("-") görünecek, bu kabul edilebilir (form yapısını bozmak yerine boş bırakmak tercih edildi).
- `receipt_items.uygunluk` üç değerden birini almaya devam eder: `uygun`, `uygun_degil`, `beklemede` (varsayılan, "Taslak Kaydet" ile henüz işaretlenmemiş satırlar için). "Kaydet" (final) yalnızca HİÇBİR satır `beklemede` kalmamışsa `onaylandi` durumuna geçebilir — bu kural hem istemci tarafında (hızlı/anlaşılır hata mesajı için) hem veritabanı tetikleyicisinde (gerçek güvence) iki katmanlı uygulanır.
- `create_receipt_with_items` RPC'sinin imzası (parametre listesi) DEĞİŞMEZ — sadece gövdesi güncellenir (`create or replace function`, `drop function` gerekmez).

---

## Dosya Yapısı

```
supabase/
  migrations/
    0012_kalite_onayi_kaldir.sql   # RLS sadeleştirme + RPC uygunluk/note passthrough + trigger temizliği
src/
  lib/
    receipts.js                      # (mevcut dosyaya değişiklik) createReceiptWithItems uygunluk/note gönderir;
                                      # submitForQuality/listPendingQuality/updateItemUygunluk/finalizeQuality silinir
  pages/
    yeni-kabul.js                    # (mevcut dosyaya değişiklik) satır başına Uygunluk+Not, rol kapısı kalkar
    kalite-onay.js                   # SİLİNİR
  main.js                            # (mevcut dosyaya değişiklik) /kalite-onay rotası/importu/nav linki kalkar,
                                      # Yeni Mal Kabul herkese açık olur
tests/
  receipts.test.js                   # (mevcut dosyaya değişiklik) silinen fonksiyonların testleri kalkar,
                                      # createReceiptWithItems'ın uygunluk/note gönderdiği test edilir
  yeni-kabul.test.js                 # (mevcut dosyaya değişiklik) yeni alanlar + validasyon test edilir
```

---

### Task 1: Migration 0012 + `receipts.js` Güncellemesi

**Files:**
- Create: `supabase/migrations/0012_kalite_onayi_kaldir.sql`
- Modify: `src/lib/receipts.js`
- Modify: `tests/receipts.test.js`

**Interfaces:**
- Consumes: `supabase` (Plan 1), mevcut `create_receipt_with_items` RPC imzası (Plan 3/4/5).
- Produces: `createReceiptWithItems({ companyId, receiptDate, irsaliyeNo, siparisNo, receivedBy, items, clientUuid, submitToQuality, faturaNo, aracHijyenUygun, aracSicaklik })` — `items` dizisindeki her öğe artık `{ productId, lotNo, skt, quantity, unit, urunSicakligi, yariOmurGecti, uygunluk, note }` şeklinde (yeni: `uygunluk`, `note`). Task 2 (`yeni-kabul.js`) bu güncellenmiş arayüzü kullanır. `submitForQuality`, `listPendingQuality`, `updateItemUygunluk`, `finalizeQuality` ARTIK YOK — hiçbir görev bunları çağırmamalı.

- [ ] **Step 1: `supabase/migrations/0012_kalite_onayi_kaldir.sql` yaz**

```sql
-- 0012_kalite_onayi_kaldir.sql
--
-- Ürün kararı: Kalite Onayı ayrı bir adım/rol olarak kaldırıldı — kaydı yapan kişi
-- ürünleri eklerken uygunluk (uygun/uygun_degil) ve notu AYNI FORMDA, aynı anda girer.
-- "Kaydet" artık doğrudan 'onaylandi' durumuna geçer (ara 'kalite_bekliyor' basamağı
-- kalkar). Var olan "tüm satırlar işaretlenmeden onaylanamaz" veritabanı kontrolü
-- (0007'deki check_receipt_approval trigger'ı) AYNEN KORUNUYOR — bu kontrol zaten tam
-- olarak istenen "kayıt kontrolü" güvencesini sağlıyor, sadece kim işaretlediği değişti.
--
-- profiles.role sütunu ve CHECK kısıtı DOKUNULMADAN bırakılıyor (geriye dönük uyumluluk,
-- mevcut satırlar bozulmasın diye) — ama aşağıdaki politikalar artık role='depo_yonetici'
-- / role='kalite_ekibi' kontrolü YAPMIYOR, sadece received_by = auth.uid() (sahiplik).

-- ÖNEMLİ (Task 1 review'da bulundu): status'a 'onaylandi' da izin vermek "ileride biri
-- doğrudan onaylandi insert eder" diye eklenmişti ama BU GERÇEK BİR AÇIK: RPC dışında
-- (ör. doğrudan PostgREST çağrısı) status='onaylandi' ile SIFIR ürünlü bir insert yapılabilir,
-- çünkü check_receipt_approval (0007) tetikleyicisi sadece `before update`'te çalışır, INSERT'te
-- HİÇ tetiklenmez. RPC zaten HER ZAMAN önce 'taslak' insert edip ardından aynı transaction
-- içinde UPDATE ile 'onaylandi'ya taşıyor (bu UPDATE, tetikleyiciyi doğru şekilde çalıştırır) —
-- yani insert politikasının 'onaylandi'ya hiç izin vermesi gerekmiyordu. Sadece 'taslak'.
drop policy if exists "receipts_insert_manager" on receipts;
create policy "receipts_insert_manager" on receipts for insert to authenticated
  with check (
    received_by = auth.uid()
    and status = 'taslak'
    and quality_by is null
    and quality_note is null
  );

drop policy if exists "receipts_update_manager_draft" on receipts;
create policy "receipts_update_manager_draft" on receipts for update to authenticated
  using (received_by = auth.uid())
  with check (
    received_by = auth.uid()
    and status in ('taslak', 'onaylandi')
    and quality_by is null
    and quality_note is null
  );

-- receipt_items_insert_manager: sabit 'uygunluk = beklemede' şartı kaldırıldı — istemci
-- artık uygunluk'u formda doğrudan seçip gönderebiliyor (uygun/uygun_degil/beklemede
-- hepsi geçerli, receipt_items.uygunluk sütunundaki CHECK kısıtı zaten bunu sınırlıyor).
drop policy if exists "receipt_items_insert_manager" on receipt_items;
create policy "receipt_items_insert_manager" on receipt_items for insert to authenticated
  with check (
    exists (
      select 1 from receipts r
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
    )
  );

-- receipt_items_update_flow: kalite_ekibi dalı kaldırıldı; sahibi kendi TASLAK
-- kaydındaki satırları (uygunluk dahil) düzenleyebilir. Kayıt 'onaylandi' olduktan
-- sonra (bu politika status='taslak' şartı yüzünden) hiçbir satır güncellenemez.
drop policy if exists "receipt_items_update_flow" on receipt_items;
create policy "receipt_items_update_flow" on receipt_items for update to authenticated
  using (
    exists (
      select 1 from receipts r
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from receipts r
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
    )
  );

-- lock_receipt_core_fields: kalite_ekibi'ye özel fatura/araç kilidi artık anlamsız
-- (o rol artık bu alanları hiç güncellemiyor) — kaldırıldı, sadece temel-alan kilidi kalıyor.
create or replace function public.lock_receipt_core_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id is distinct from old.company_id
    or new.received_by is distinct from old.received_by
    or new.receipt_date is distinct from old.receipt_date
    or new.irsaliye_no is distinct from old.irsaliye_no
    or new.siparis_no is distinct from old.siparis_no
    or new.client_uuid is distinct from old.client_uuid
  then
    raise exception 'Bu alanlar oluşturulduktan sonra değiştirilemez: company_id, received_by, receipt_date, irsaliye_no, siparis_no, client_uuid';
  end if;
  return new;
end;
$$;

-- lock_receipt_item_fields_for_quality: sadece kalite_ekibi'ni kısıtlıyordu, o rol
-- artık bu satırları hiç güncellemiyor (receipt_items_update_flow zaten sadece
-- status='taslak' + sahip için güncellemeye izin veriyor) — trigger'ı ve fonksiyonu
-- kaldırıyoruz, "quality" adlı bir trigger'ın ne işe yaradığını gelecekte biri
-- arayıp bulamayınca şaşırmasın diye bırakmak yerine temizliyoruz.
drop trigger if exists lock_receipt_item_fields_for_quality_trigger on receipt_items;
drop function if exists public.lock_receipt_item_fields_for_quality();

-- RPC: p_submit_to_quality artık 'kalite_bekliyor' değil DOĞRUDAN 'onaylandi'ya taşıyor;
-- satırlar sabit 'beklemede' yerine istemcinin gönderdiği uygunluk/not değerleriyle
-- ekleniyor. İmza (parametre listesi) DEĞİŞMEDİ — create or replace yeterli.
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

  -- UYARI: bu insert'e asla bir `on conflict (client_uuid) do update ...` SET listesi
  -- eklenmesin — RLS UPDATE-politikası sorununu geri getirir (bkz. 0011). `do nothing`
  -- + aşağıdaki erken-dönüş bilerek tercih edildi.
  insert into receipts (
    client_uuid, company_id, receipt_date, irsaliye_no, siparis_no, received_by, status,
    fatura_no, arac_hijyen_uygun, arac_sicaklik
  )
  values (
    p_client_uuid, p_company_id, p_receipt_date, p_irsaliye_no, p_siparis_no, p_received_by, 'taslak',
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
    coalesce(item->>'uygunluk', 'beklemede'),
    nullif(item->>'note', ''),
    nullif(item->>'urunSicakligi', '')::numeric,
    coalesce((item->>'yariOmurGecti')::boolean, false)
  from jsonb_array_elements(p_items) as item;

  if p_submit_to_quality then
    update receipts set status = 'onaylandi' where id = v_receipt_id and status = 'taslak';
  end if;

  return v_receipt_id;
end;
$$;
```

- [ ] **Step 2: Testi çalıştır (mevcut testlerin bu migration'dan etkilenmediğini doğrula — bu saf SQL, yerel test suite'i çağırmaz)**

Run: `npm run test`
Expected: PASS (migration henüz canlıya uygulanmadı, mevcut mock tabanlı testler değişmedi).

- [ ] **Step 3: `tests/receipts.test.js`'i güncelle — silinen fonksiyonların testlerini kaldır, `createReceiptWithItems`'ın `uygunluk`/`note` gönderdiğini doğrulayan yeni test ekle**

`tests/receipts.test.js` dosyasının en üstündeki import bloğunu bul ve `submitForQuality`, `listPendingQuality`, `updateItemUygunluk`, `finalizeQuality` isimlerini import listesinden çıkar (sadece `createReceiptWithItems`, `getReceiptDetail`, `listReceipts` kalır — `getReceiptDetail`/`listReceipts` bu görevde değişmiyor, dosyada zaten var).

Şu testleri SİL (artık var olmayan fonksiyonları çağırıyorlar):
- `'listPendingQuality kalite_bekliyor kayıtlarını döner'`
- `'finalizeQuality tüm satırlar işaretlenmeden onaylandi kabul etmez'`
- `'submitForQuality 0 satır güncellenirse hata fırlatır'`
- `'updateItemUygunluk 0 satır güncellenirse hata fırlatır'`
- `'finalizeQuality 0 satır güncellenirse hata fırlatır'`
- `'submitForQuality satır güncellenirse hata fırlatmaz'`

`describe('receipts', ...)` bloğunun içine, `createReceiptWithItems` ile ilgili mevcut testlerin yanına şu yeni testi ekle:

```javascript
  it('createReceiptWithItems her satır için uygunluk ve not değerini RPC\'ye gönderir', async () => {
    await createReceiptWithItems({
      companyId: 1, receiptDate: '2026-08-29', irsaliyeNo: '', siparisNo: '', receivedBy: 'u1',
      items: [{ productId: 1, lotNo: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg', uygunluk: 'uygun', note: 'Kutu ezik' }]
    });
    const rpcCall = supabase.rpc.mock.calls.find((call) => call[0] === 'create_receipt_with_items');
    expect(rpcCall[1].p_items[0].uygunluk).toBe('uygun');
    expect(rpcCall[1].p_items[0].note).toBe('Kutu ezik');
  });

  it('createReceiptWithItems uygunluk/not verilmezse RPC\'ye null/undefined göndermez, RPC kendi varsayılanını kullanır', async () => {
    await createReceiptWithItems({
      companyId: 1, receiptDate: '2026-08-29', irsaliyeNo: '', siparisNo: '', receivedBy: 'u1',
      items: [{ productId: 1, lotNo: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg' }]
    });
    const rpcCall = supabase.rpc.mock.calls.find((call) => call[0] === 'create_receipt_with_items');
    expect(rpcCall[1].p_items[0].uygunluk).toBeUndefined();
    expect(rpcCall[1].p_items[0].note).toBeUndefined();
  });
```

(Not: `supabase.rpc.mock.calls` erişimi için dosyanın üstündeki `vi.mock('../src/lib/supabase.js', ...)` bloğunda `rpc: vi.fn(...)` olarak tanımlı olması gerekir — dosyada zaten bu şekilde tanımlı, `import { supabase } from '../src/lib/supabase.js'` satırı da zaten mevcut. Eğer mock'ta `rpc` bir `vi.fn` değilse, bu iki testi yazmadan önce mock tanımını kontrol et ve gerekirse `rpc: vi.fn(() => Promise.resolve({ data: 'r1', error: null }))` şeklinde güncelle.)

- [ ] **Step 4: `src/lib/receipts.js`'i güncelle — `createReceiptWithItems`'a `uygunluk`/`note` ekle, kullanılmayan 4 fonksiyonu sil**

`createReceiptWithItems` içindeki `p_items: items.map(...)` bloğunu şu şekilde güncelle (sadece iki alan ekleniyor, geri kalanı aynı):

```javascript
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
      note: item.note || null
    })),
```

`submitForQuality`, `listPendingQuality`, `updateItemUygunluk`, `finalizeQuality` fonksiyonlarının TAMAMINI (Step 3'te bahsedilen 4 fonksiyon — `export async function submitForQuality(...)` ile başlayıp `export async function finalizeQuality(...)`'nin kapanış `}`'ine kadar olan bloklar) dosyadan sil. `assertUpdated` yardımcı fonksiyonu SİLİNMEZ (dosyada başka yerde kullanılmıyor olsa bile bu görev onu silmeyi istemiyor — sadece 4 fonksiyonu kaldır; eğer silme sonrası `assertUpdated` hiçbir yerde çağrılmıyorsa, bunu da sil, çünkü ölü kod bırakmamak gerekir).

- [ ] **Step 5: Testi tekrar çalıştır**

Run: `npm run test`
Expected: PASS (receipts.test.js'teki tüm testler, silinenler hariç, yeşil).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0012_kalite_onayi_kaldir.sql src/lib/receipts.js tests/receipts.test.js
git commit -m "feat: kalite onayini kaldir - RLS sadelestirme, RPC uygunluk/not passthrough"
```

---

### Task 2: `yeni-kabul.js` — Satır Başına Uygunluk/Not, Rol Kapısının Kaldırılması

**Files:**
- Modify: `src/pages/yeni-kabul.js`
- Modify: `tests/yeni-kabul.test.js`

**Interfaces:**
- Consumes: `createReceiptWithItems` (Task 1, artık `uygunluk`/`note` alanlarını okuyor).
- Produces: Sayfa artık herhangi bir authenticated kullanıcıya açık (rol kontrolü yok).

- [ ] **Step 1: `src/pages/yeni-kabul.js`'in başındaki rol kontrolünü kaldır**

```javascript
import { listCompanies } from '../lib/companies.js';
import { listProducts } from '../lib/products.js';
import { renderSearchList } from '../components/search-list.js';
import { createReceiptWithItems } from '../lib/receipts.js';
import { getCurrentProfile } from '../lib/auth.js';
import { escapeHtml } from '../lib/html.js';
import { isNetworkError } from '../lib/offline-cache.js';
import { enqueueReceipt } from '../lib/offline-queue.js';
import { refreshOfflineBanner } from '../components/offline-banner.js';

export async function renderYeniKabul(container) {
  const profile = await getCurrentProfile();

  const [companies, products] = await Promise.all([listCompanies(), listProducts()]);
```

(Yani `hasRole` importu ve `if (!hasRole(profile, 'depo_yonetici')) { ...; return; }` bloğu tamamen kaldırılıyor — sayfa artık rol kontrolü yapmadan doğrudan devam ediyor.)

- [ ] **Step 2: Ürün tablosu başlığına Uygunluk ve Not sütunlarını ekle**

Mevcut `<table id="items-table">` içindeki `<thead>` satırını şu şekilde güncelle:

```html
        <tr style="text-align:left;border-bottom:2px solid #333;">
          <th>Ürün</th><th>Lot No</th><th>SKT</th><th>Miktar</th><th>Birim</th><th>Ürün Sıcaklığı</th><th>Yarı Ömür Geçti mi</th><th>Uygunluk</th><th>Not</th><th></th>
        </tr>
```

- [ ] **Step 3: `renderItemsBody` fonksiyonunu güncelle — satıra Uygunluk (select) ve Not (input) ekle**

```javascript
  function renderItemsBody() {
    const tbody = container.querySelector('#items-body');
    tbody.innerHTML = state.items
      .map(
        (item, i) => `
      <tr>
        <td>${escapeHtml(item.code)} — ${escapeHtml(item.name)}</td>
        <td><input type="text" data-field="lotNo" data-index="${i}" value="${escapeHtml(item.lotNo)}" /></td>
        <td><input type="date" data-field="skt" data-index="${i}" value="${escapeHtml(item.skt)}" /></td>
        <td><input type="number" min="0" step="0.01" data-field="quantity" data-index="${i}" value="${escapeHtml(item.quantity)}" style="width:80px;" /></td>
        <td>${escapeHtml(item.unit)}</td>
        <td><input type="number" step="0.1" data-field="urunSicakligi" data-index="${i}" value="${escapeHtml(item.urunSicakligi)}" style="width:90px;" /></td>
        <td><input type="checkbox" data-field="yariOmurGecti" data-index="${i}" ${item.yariOmurGecti ? 'checked' : ''} /></td>
        <td>
          <select data-field="uygunluk" data-index="${i}">
            <option value="beklemede" ${item.uygunluk === 'beklemede' ? 'selected' : ''}>Beklemede</option>
            <option value="uygun" ${item.uygunluk === 'uygun' ? 'selected' : ''}>Uygun</option>
            <option value="uygun_degil" ${item.uygunluk === 'uygun_degil' ? 'selected' : ''}>Uygun Değil</option>
          </select>
        </td>
        <td><input type="text" data-field="note" data-index="${i}" value="${escapeHtml(item.note)}" style="width:120px;" placeholder="Not" /></td>
        <td><button data-remove="${i}">Sil</button></td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.index);
        const field = input.dataset.field;
        state.items[idx][field] = input.checked;
      });
    });
    tbody.querySelectorAll('select[data-field="uygunluk"]').forEach((select) => {
      select.addEventListener('change', () => {
        const idx = Number(select.dataset.index);
        state.items[idx].uygunluk = select.value;
      });
    });
    tbody.querySelectorAll('input:not([type="checkbox"])').forEach((input) => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.index);
        const field = input.dataset.field;
        state.items[idx][field] = field === 'quantity' ? Number(input.value) : input.value;
      });
    });
    tbody.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.items.splice(Number(btn.dataset.remove), 1);
        renderItemsBody();
      });
    });
  }
```

- [ ] **Step 4: Yeni satır eklenirken varsayılan `uygunluk`/`note` değerlerini ekle**

`renderSearchList(container.querySelector('#urun-picker'), { ... onSelect: (p) => { state.items.push({...}) ...` içindeki `push` çağrısını güncelle:

```javascript
    onSelect: (p) => {
      state.items.push({ productId: p.id, code: p.code, name: p.name, unit: p.unit, lotNo: '', skt: '', quantity: 0, urunSicakligi: '', yariOmurGecti: false, uygunluk: 'beklemede', note: '' });
      renderItemsBody();
    }
```

- [ ] **Step 5: "Kaydet ve Kalite Onayına Gönder" butonunu "Kaydet"e çevir, final kaydet öncesi "hepsi işaretlenmiş mi" kontrolü ekle**

Mevcut buton bloğunu güncelle:

```html
    <div style="margin-top:1rem;display:flex;gap:0.5rem;">
      <button id="save-draft-btn">Taslak Kaydet</button>
      <button id="submit-quality-btn">Kaydet</button>
    </div>
```

`save(sendToQuality)` fonksiyonu içindeki, tarih kontrolünden hemen sonra (RPC çağrısından önce) şu kontrolü ekle — bu, `sendToQuality` (yani nihai "Kaydet") true ise HİÇBİR satırın `beklemede` kalmadığını doğrular (aynı kural veritabanı tetikleyicisinde de var, burada erken ve anlaşılır bir hata mesajı için tekrarlanıyor):

```javascript
    if (sendToQuality && state.items.some((item) => item.uygunluk === 'beklemede')) {
      msg.style.color = '#b00020';
      msg.textContent = "Hata: Tüm satırların uygunluğu (Uygun / Uygun Değil) işaretlenmeden kaydedilemez";
      return;
    }
```

(Bu kontrol, mevcut `state.items.length === 0` ve tarih kontrollerinin HEMEN ALTINA, `buttons.forEach((btn) => { btn.disabled = true; });` satırından ÖNCE eklenir — aynı "yerel doğrulama try/catch dışında olmalı" ilkesiyle.)

`createReceiptWithItems` çağrısındaki `items: state.items` zaten `uygunluk`/`note` alanlarını içeren güncel `state.items` dizisini gönderiyor (Adım 4'te eklendiği için) — bu satırda başka bir değişiklik gerekmez.

Başarı mesajını güncelle:

```javascript
      msg.style.color = 'green';
      msg.textContent = sendToQuality ? 'Kayıt tamamlandı.' : 'Taslak olarak kaydedildi.';
```

- [ ] **Step 6: `tests/yeni-kabul.test.js`'i güncelle**

Dosyadaki mevcut testler `renderYeniKabul`'ı `depo_yonetici` rolüyle çağırıyor ve doğrudan `save()` akışını test ediyor olabilir — rol kontrolü kaldırıldığı için, eğer testlerden biri "rol depo_yonetici değilse hata gösterir" gibi bir şey test ediyorsa o testi SİL. Ardından, `describe` bloğunun içine şu yeni testi ekle:

```javascript
  it('herhangi bir satır beklemede iken "Kaydet" (final) tıklanırsa hata gösterir ve enqueueReceipt/createReceiptWithItems çağrılmaz', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderYeniKabul(container);

    const firmaInput = container.querySelector('#firma-picker .search-input');
    firmaInput.value = 'firma';
    firmaInput.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('#firma-picker .search-results li').click();

    const urunInput = container.querySelector('#urun-picker .search-input');
    urunInput.value = 'urun';
    urunInput.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('#urun-picker .search-results li').click();

    container.querySelector('[data-field="quantity"]').value = '5';
    container.querySelector('[data-field="quantity"]').dispatchEvent(new Event('input', { bubbles: true }));

    // uygunluk hiç değiştirilmedi, varsayılan 'beklemede' kaldı.
    container.querySelector('#submit-quality-btn').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector('#kabul-msg').textContent).toContain('Uygun / Uygun Değil');
    expect(createReceiptWithItems).not.toHaveBeenCalled();
    expect(enqueueReceipt).not.toHaveBeenCalled();

    document.body.removeChild(container);
  });
```

(Bu testin çalışması için dosyanın üstündeki mock/import bloklarında `createReceiptWithItems` ve `enqueueReceipt`'in zaten `vi.fn()` olarak mocklandığını ve `listCompanies`/`listProducts` mock'larının en az bir arama sonucu döndürdüğünü doğrula — dosyada mevcut testler zaten bu deseni kullanıyor, aynı mock verilerini/yardımcı fonksiyonları kullan. Eğer mevcut mock firma/ürün listesi farklı bir arama terimi gerektiriyorsa, yukarıdaki `'firma'`/`'urun'` yerine dosyadaki mevcut testlerin kullandığı gerçek arama terimlerini kullan.)

- [ ] **Step 7: Testi çalıştır**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/pages/yeni-kabul.js tests/yeni-kabul.test.js
git commit -m "feat: yeni mal kabul formuna satir bazli uygunluk/not ekle, rol kapisini kaldir"
```

---

### Task 3: `main.js` — Kalite Onayı Rotasını/Sayfasını Kaldır

**Files:**
- Modify: `src/main.js`
- Delete: `src/pages/kalite-onay.js`

**Interfaces:**
- Consumes: Task 2'nin rol-kapısız `renderYeniKabul`'ı.
- Produces: Yok (bu son görev, başka bir görev bu değişikliğe bağlı değil).

- [ ] **Step 1: `src/pages/kalite-onay.js`'i sil**

```bash
git rm src/pages/kalite-onay.js
```

- [ ] **Step 2: `src/main.js`'ten `renderKaliteOnay` import'unu kaldır**

```javascript
import { renderFirmalar } from './pages/firmalar.js';
import { renderUrunler } from './pages/urunler.js';
import { renderYeniKabul } from './pages/yeni-kabul.js';
import { renderArama } from './pages/arama.js';
import { renderMalKabulCiktisi } from './pages/mal-kabul-ciktisi.js';
```

(`import { renderKaliteOnay } from './pages/kalite-onay.js';` satırı tamamen kaldırılıyor.)

- [ ] **Step 3: Nav bloğundaki rol bazlı linkleri kaldır — "Yeni Mal Kabul" herkese açık, "Kalite Onayı" linki tamamen kalkar**

Mevcut nav bloğunu bul ve şu şekilde güncelle:

```html
      <nav style="display:flex;gap:0.5rem;padding:0.5rem 1rem;background:#e9ecef;flex-wrap:wrap;">
        <button class="pill-tab" data-nav="/">Ana Sayfa</button>
        <button class="pill-tab" data-nav="/firmalar">Firmalar</button>
        <button class="pill-tab" data-nav="/urunler">Ürünler</button>
        <button class="pill-tab" data-nav="/yeni-kabul">Yeni Mal Kabul</button>
        <button class="pill-tab" data-nav="/arama">Kayıt Ara</button>
      </nav>
```

(Gerçek dosyadaki `class`/stil özniteliklerini AYNEN KORU — sadece `${profile.role === 'depo_yonetici' ? '...' : ''}` ve `${profile.role === 'kalite_ekibi' ? '...' : ''}` koşullu bloklarını kaldırıp içindeki butonları koşulsuz, sabit metin olarak bırak. Yukarıdaki örnek stil/class isimlerini DEĞİL, dosyada o an gerçekten yazılı olan class/style değerlerini kullan.)

- [ ] **Step 4: Ana sayfa (`/`) rotasındaki rol kontrolünü kaldır**

```javascript
    registerRoute('/', (c) => {
      c.innerHTML = '<p><button data-nav="/yeni-kabul">+ Yeni Mal Kabul</button></p>';
      c.querySelector('[data-nav]').addEventListener('click', () => navigate('/yeni-kabul'));
    });
```

(`if (profile.role !== 'depo_yonetici') { c.innerHTML = ''; return; }` bloğu tamamen kaldırılıyor — herkes bu kısayolu görür.)

- [ ] **Step 5: `/kalite-onay` rota kaydını kaldır**

```javascript
    registerRoute('/firmalar', renderFirmalar);
    registerRoute('/urunler', renderUrunler);
    registerRoute('/yeni-kabul', renderYeniKabul);
    registerRoute('/arama', renderArama);
    registerRoute('/mal-kabul-ciktisi', renderMalKabulCiktisi);
```

(`registerRoute('/kalite-onay', renderKaliteOnay);` satırı tamamen kaldırılıyor.)

- [ ] **Step 6: Testi çalıştır ve build al**

Run: `npm run test`
Expected: PASS (tüm suite, kalite-onay.js'e referans veren bir test yok zaten).

Run: `npm run build`
Expected: Hatasız biter, `kalite-onay.js` bundle'a dahil edilmez (silindiği için).

- [ ] **Step 7: Tarayıcıda uçtan uca doğrula**

1. `npm run dev`, herhangi bir kullanıcıyla (rolü ne olursa olsun) giriş yap.
2. Nav'da "Kalite Onayı" linkinin ARTIK OLMADIĞINI doğrula. "Yeni Mal Kabul" linkinin göründüğünü doğrula.
3. "Yeni Mal Kabul"a git, bir firma + bir ürün ekle, satırda "Uygunluk" ve "Not" sütunlarını gör. Uygunluğu "Uygun" seç, miktar gir, "Kaydet"e bas.

Expected: "Kayıt tamamlandı." mesajı görünür. Supabase Table Editor'de `receipts.status = 'onaylandi'`, `receipt_items.uygunluk = 'uygun'` olduğunu doğrula — ara `kalite_bekliyor` durumundan hiç geçmemiş olmalı.

4. Uygunluğu hiç değiştirmeden (beklemede kalan) bir satırla "Kaydet"e basmayı dene.

Expected: Kırmızı "Tüm satırların uygunluğu (Uygun / Uygun Değil) işaretlenmeden kaydedilemez" hatası, kayıt oluşturulmaz.

- [ ] **Step 8: Commit**

```bash
git add src/main.js
git commit -m "feat: kalite onayi sayfasini/rotasini kaldir, yeni mal kabulu herkese ac"
```

---

---

### Task 4: Final Review Düzeltmeleri

**Bulgu 1 (Important — regresyon):** `receipts_update_manager_draft`'ın `USING` ifadesi 0012'de sadece `received_by = auth.uid()`'e indirgenmişti — bu, plan öncesindeki halinin (0004'te `status = 'taslak'` şartı da vardı) aksine, sahibinin kendi `onaylandi` kaydını `status='taslak'`'a geri çekip (bu geçiş `check_receipt_approval`'ı tetiklemez çünkü `new.status <> 'onaylandi'`) satırlarını yeniden düzenleyip tekrar `onaylandi`'ye taşıyabilmesine yol açıyordu — onaylanmış bir kaydın artık DEĞİŞMEZ olmadığı anlamına gelir. Migration'daki kendi yorumu bile bunun tersini iddia ediyor ("Kayıt 'onaylandi' olduktan sonra ... hiçbir satır güncellenemez") — bu artık YANLIŞ.

**Bulgu 2 (Important — eksik temizlik):** `companies_update_manager`, `companies_delete_manager`, `products_update_manager`, `products_delete_manager`, `receipt_items_delete_draft` politikaları (hepsi 0002'den, bu plan hiçbirine dokunmadı) hâlâ `p.role = 'depo_yonetici'` kontrolü yapıyor — artık anlamsız bir rol ayrımı (tek-rol modeline geçildi ama bu 5 politika unutuldu). `src/pages/firmalar.js` ve `src/pages/urunler.js`'teki `hasRole(profile, 'depo_yonetici')` kontrolü ve ona bağlı "Not: ... yetkisi sadece depo yöneticisindedir" uyarı metni de aynı nedenle artık yanlış (o iki sayfada zaten düzenleme/silme arayüzü hiç yok, sadece arama+ekleme var — bu not sadece kafa karıştırıyor).

**Files:**
- Modify: `supabase/migrations/0012_kalite_onayi_kaldir.sql`
- Modify: `src/pages/firmalar.js`
- Modify: `src/pages/urunler.js`

- [ ] **Step 1: `supabase/migrations/0012_kalite_onayi_kaldir.sql`'deki `receipts_update_manager_draft` politikasını düzelt**

Dosyadaki mevcut `receipts_update_manager_draft` bloğunu bul ve `using` ifadesine `and status = 'taslak'` ekle (yorum da güncellensin):

```sql
-- receipts_update_manager_draft: sahibi SADECE kendi TASLAK kaydını 'onaylandi'ya
-- taşıyabilir. USING'e `status = 'taslak'` şartı EKLENDİ (final review bulgusu) —
-- bu olmadan sahibi kendi ONAYLANMIŞ kaydını status='taslak'a geri çekip (bu geçiş
-- check_receipt_approval'ı tetiklemez, çünkü new.status <> 'onaylandi') satırlarını
-- yeniden düzenleyip tekrar onaylayabiliyordu — onaylanmış bir kayıt artık DEĞİŞMEZ
-- olmalı.
drop policy if exists "receipts_update_manager_draft" on receipts;
create policy "receipts_update_manager_draft" on receipts for update to authenticated
  using (received_by = auth.uid() and status = 'taslak')
  with check (
    received_by = auth.uid()
    and status in ('taslak', 'onaylandi')
    and quality_by is null
    and quality_note is null
  );
```

- [ ] **Step 2: Aynı dosyanın SONUNA, `companies`/`products`/`receipt_items_delete_draft` üzerindeki artık anlamsız rol kontrollerini kaldıran bloğu ekle**

```sql
-- Final review bulgusu 2: 0002'den kalan bu 5 politika hâlâ role='depo_yonetici'
-- kontrolü yapıyordu — tek-rol modeline geçişte unutulmuşlardı. Artık herhangi bir
-- authenticated kullanıcı firma/ürün düzenleyebilir/silebilir ve kendi taslak
-- kaydındaki satırları silebilir (receipts/receipt_items ile aynı tutarlı model).
drop policy if exists "companies_update_manager" on companies;
create policy "companies_update_manager" on companies for update to authenticated using (true);
drop policy if exists "companies_delete_manager" on companies;
create policy "companies_delete_manager" on companies for delete to authenticated using (true);

drop policy if exists "products_update_manager" on products;
create policy "products_update_manager" on products for update to authenticated using (true);
drop policy if exists "products_delete_manager" on products;
create policy "products_delete_manager" on products for delete to authenticated using (true);

drop policy if exists "receipt_items_delete_draft" on receipt_items;
create policy "receipt_items_delete_draft" on receipt_items for delete to authenticated
  using (
    exists (
      select 1 from receipts r
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
    )
  );
```

- [ ] **Step 3: `src/pages/firmalar.js`'ten `hasRole` kontrolünü ve ona bağlı uyarı notunu kaldır**

`import { getCurrentProfile, hasRole } from '../lib/auth.js';` satırını `import { getCurrentProfile } from '../lib/auth.js';` yap (artık sadece `getCurrentProfile` kullanılıyor — dosyada `profile` değişkeni başka bir yerde kullanılmıyorsa `getCurrentProfile()` çağrısını ve `profile` değişkenini de tamamen kaldır; kullanılıyorsa sadece `hasRole` importunu ve `isManager` değişkenini/if bloğunu kaldır). `if (!isManager) { ...insertAdjacentHTML... }` bloğunun tamamını sil.

- [ ] **Step 4: `src/pages/urunler.js`'te aynı değişikliği yap**

Aynı desen: `hasRole` importu, `isManager` değişkeni ve ona bağlı `if (!isManager) { ...insertAdjacentHTML... }` bloğu kaldırılır.

- [ ] **Step 5: Testi çalıştır ve build al**

Run: `npm run test`
Expected: PASS (bu değişiklikler mevcut testlerin beklediği DOM yapısını bozmuyor — `firmalar.js`/`urunler.js` testleri varsa, `isManager` notunun DOM'da olup olmadığını kontrol eden bir test yoksa etkilenmez; varsa o testi kaldır).

Run: `npm run build`
Expected: Hatasız biter.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0012_kalite_onayi_kaldir.sql src/pages/firmalar.js src/pages/urunler.js
git commit -m "fix: onaylanan kaydin degismezligini geri getir, firma/urun/receipt_items uzerindeki unutulmus rol kontrollerini kaldir"
```

---

## Bu Plan Tamamlandığında Doğrulanacaklar

- `npm run test` ve `npm run build` yeşil.
- Migration `0012_kalite_onayi_kaldir.sql` canlı Supabase'e uygulanmış (kullanıcı tarafından, SQL Editor üzerinden).
- Herhangi bir kullanıcı "Yeni Mal Kabul"da bir kayıt oluşturup ürünlerin uygunluğunu aynı formda işaretleyip doğrudan "onaylandi" durumunda kaydedebiliyor.
- "Kalite Onayı" sayfası/rotası/nav linki hiçbir yerde görünmüyor.
- Eski (`kalite_bekliyor`/`reddedildi` durumundaki) geçmiş kayıtlar Kayıt Ara'da olduğu gibi görünmeye devam ediyor.
- Bir satır `beklemede` bırakılıp "Kaydet"e basılırsa hem istemci hem veritabanı seviyesinde reddediliyor.
