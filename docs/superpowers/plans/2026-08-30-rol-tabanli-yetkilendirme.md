# Rol Tabanlı Yetkilendirme + Admin Kullanıcı Yönetimi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task'ları bu dosyadaki sırayla uygula — sıralama bağımlılıklara göre kasıtlı olarak düzenlendi (bkz. her task'ın Interfaces/Consumes bölümü).**

**Goal:** Uygulamaya üç rollü (admin / depo_yonetici / kalite_ekibi) bir yetki matrisi kazandırmak, admin'in uygulama içinden yeni kullanıcı oluşturup rol atayabilmesini sağlamak, ve kayıt sahipliğini (kim oluşturdu) hem "Kayıt Ara" listesinde hem çıktılardaki İmzalar hücresinde görünür kılmak.

**Architecture:** DB seviyesinde RLS politikaları gerçek yetkilendirmeyi yapar (arayüz sadece bunu yansıtır — bkz. mevcut `auth.js` yorum ilkesi). Yeni kullanıcı oluşturma, anon anahtarla yapılamayan bir `service_role` işlemi olduğu için bir Supabase Edge Function'a taşınır; fonksiyon kendi içinde çağıranın admin olduğunu doğrular.

**Tech Stack:** Vite + vanilla JS (mevcut proje), Supabase (Postgres RLS + Edge Functions, Deno runtime), Vitest.

## Global Constraints

- Tasarım belgesi: `docs/superpowers/specs/2026-08-30-rol-tabanli-yetkilendirme-design.md` — bu planın tüm kararları oradan gelir, çelişki olursa spec önceliklidir.
- Migration'lar `supabase/migrations/` altında sıradaki numarayla eklenir (bu plan `0014` kullanır) ve **Supabase SQL Editor'da kullanıcı tarafından elle çalıştırılır** — otomatik uygulanmaz.
- Edge Function Supabase Dashboard → Edge Functions bölümünden elle deploy edilir — CLI gerekmez.
- Rol bilgisi yalnızca ARAYÜZÜ şekillendirir; gerçek yetkilendirme RLS politikalarındadır (mevcut `src/lib/auth.js` yorumundaki ilkeyle tutarlı).
- İlk admin hesabı: kullanıcı adı `test` (email: `test@malkabul.local`).
- Tüm yeni Türkçe metin/yorum, projenin geri kalanıyla aynı üslupta (bkz. mevcut dosyalardaki yorumlar) — sadece NEDEN'i açıklayan yorumlar, NE'yi değil.

---

## Task 1: Migration 0014 — Rol Genişletme ve RLS Politikaları

**Files:**
- Create: `supabase/migrations/0014_rol_tabanli_yetkilendirme.sql`

**Interfaces:**
- Consumes: mevcut `profiles.role` sütunu (0001), mevcut RLS politikaları (0002, 0012).
- Produces: `profiles.role` artık `'admin'` değerini de kabul ediyor; `companies`/`products`/`receipts`/`receipt_items` insert/update/delete politikaları `role in ('admin','depo_yonetici')` şartı taşıyor; `profiles.role` sütunu admin tarafından başka kullanıcılar için güncellenebiliyor; `handle_new_user` tetikleyicisi rolü `user_metadata`'dan okuyor. Sonraki task'lar (Edge Function, kullanicilar.js) bu politikalara güvenir.

- [ ] **Step 1: Migration dosyasını yaz**

`supabase/migrations/0014_rol_tabanli_yetkilendirme.sql`:

```sql
-- 0014_rol_tabanli_yetkilendirme.sql
--
-- Ürün kararı: tek-rol modelinden üç-rollü bir modele geçiliyor (admin / depo_yonetici /
-- kalite_ekibi). profiles.role sütunu ve CHECK kısıtı zaten vardı (0001), kalite-onayı
-- kaldırma sürecinde (0012) RLS politikalarından rol kontrolü bilerek çıkarılmıştı —
-- bu migration o kontrolü YENİDEN devreye alıyor, ama artık iki değil üç rolle.
--
-- Yetki matrisi (bkz. docs/superpowers/specs/2026-08-30-rol-tabanli-yetkilendirme-design.md):
--   admin          -> kullanıcı yönetimi, firma/ürün yönetimi, sadece GÖRÜNTÜLEME (kayıt oluşturamaz)
--   depo_yonetici  -> firma/ürün yönetimi, kayıt oluşturma, görüntüleme
--   kalite_ekibi   -> sadece görüntüleme

-- 1) CHECK kısıtına 'admin' eklendi. Kısıt adı Postgres'in <tablo>_<sütun>_check varsayılan
--    adlandırmasıyla eşleşiyor (0001'de isimsiz inline CHECK olarak tanımlanmıştı).
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'depo_yonetici', 'kalite_ekibi'));

-- 2) companies/products: ekleme-düzenleme-silme artık admin+depo_yonetici ile sınırlı
--    (0012'de "herhangi bir authenticated kullanıcı" diye gevşetilmişti — geri sıkılaştırılıyor).
--    SELECT politikaları (companies_select_all, products_select_all) DOKUNULMUYOR.
drop policy if exists "companies_insert_all" on companies;
create policy "companies_insert_all" on companies for insert to authenticated
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

drop policy if exists "companies_update_manager" on companies;
create policy "companies_update_manager" on companies for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

drop policy if exists "companies_delete_manager" on companies;
create policy "companies_delete_manager" on companies for delete to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

drop policy if exists "products_insert_all" on products;
create policy "products_insert_all" on products for insert to authenticated
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

drop policy if exists "products_update_manager" on products;
create policy "products_update_manager" on products for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

drop policy if exists "products_delete_manager" on products;
create policy "products_delete_manager" on products for delete to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

-- 3) receipts: insert/update artık admin+depo_yonetici ile sınırlı. SELECT (receipts_select_all)
--    DOKUNULMUYOR — kalite_ekibi zaten okuyabiliyordu. Mevcut sahiplik/durum şartları (received_by
--    = auth.uid(), status='taslak') aynen korunuyor, sadece rol şartı ekleniyor.
drop policy if exists "receipts_insert_manager" on receipts;
create policy "receipts_insert_manager" on receipts for insert to authenticated
  with check (
    received_by = auth.uid()
    and status = 'taslak'
    and quality_by is null
    and quality_note is null
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici'))
  );

drop policy if exists "receipts_update_manager_draft" on receipts;
create policy "receipts_update_manager_draft" on receipts for update to authenticated
  using (
    received_by = auth.uid() and status = 'taslak'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici'))
  )
  with check (
    received_by = auth.uid()
    and status in ('taslak', 'onaylandi')
    and quality_by is null
    and quality_note is null
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici'))
  );

-- 4) receipt_items: insert/update/delete aynı desenle rol şartı alıyor.
drop policy if exists "receipt_items_insert_manager" on receipt_items;
create policy "receipt_items_insert_manager" on receipt_items for insert to authenticated
  with check (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
        and p.role in ('admin', 'depo_yonetici')
    )
  );

drop policy if exists "receipt_items_update_flow" on receipt_items;
create policy "receipt_items_update_flow" on receipt_items for update to authenticated
  using (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
        and p.role in ('admin', 'depo_yonetici')
    )
  )
  with check (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
        and p.role in ('admin', 'depo_yonetici')
    )
  );

drop policy if exists "receipt_items_delete_draft" on receipt_items;
create policy "receipt_items_delete_draft" on receipt_items for delete to authenticated
  using (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
        and p.role in ('admin', 'depo_yonetici')
    )
  );

-- 5) profiles: admin, başka kullanıcıların rolünü değiştirebilsin. Kolon bazlı grant zaten
--    hangi sütunların authenticated tarafından değiştirilebileceğini sınırlıyor (0002'de
--    full_name için yapılmıştı) — role için aynı deseni tekrarlıyoruz.
grant update (role) on profiles to authenticated;

drop policy if exists "profiles_update_admin_role" on profiles;
create policy "profiles_update_admin_role" on profiles for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 6) handle_new_user: rol artık sabit 'depo_yonetici' değil, user_metadata'dan okunuyor
--    (Edge Function yeni kullanıcı oluştururken role'ü buraya yazacak). Metadata'da rol
--    yoksa (ör. Supabase Dashboard'dan elle oluşturulan bir kullanıcı) eski varsayılan korunuyor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'depo_yonetici')
  );
  return new;
end;
$$;

-- 7) Bootstrap: mevcut 'test' kullanıcısı ilk admin olarak işaretleniyor.
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'test@malkabul.local');
```

- [ ] **Step 2: Kullanıcıdan migration'ı Supabase SQL Editor'da çalıştırmasını iste**

Kullanıcıya şu mesajı ilet: "0014_rol_tabanli_yetkilendirme.sql dosyasının tamamını Supabase SQL
Editor'da çalıştırıp onaylar mısın?" — onay gelmeden Task 5/6/7'ye (Edge Function, admin panel,
canlı doğrulama) geçme, bunlar bu migration olmadan test edilemez.

- [ ] **Step 3: Doğrula — bootstrap gerçekten admin işaretledi mi**

Kullanıcıdan şu sorguyu SQL Editor'da çalıştırıp sonucu paylaşmasını iste:
```sql
select id, full_name, role from profiles where role = 'admin';
```
Beklenen: `test` kullanıcısının satırı `role = 'admin'` ile dönüyor. Dönmüyorsa (ör.
`test@malkabul.local` gerçek email'le eşleşmiyorsa) kullanıcıya doğru kullanıcı adını sorup
Step 1'deki bootstrap satırını düzelt, tekrar çalıştır.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_rol_tabanli_yetkilendirme.sql
git commit -m "feat: rol tabanli yetkilendirme icin RLS politikalarini genislet (admin rolu eklendi)"
```

---

## Task 2: `hasAnyRole` Yardımcı Fonksiyonu

**Files:**
- Modify: `src/lib/role.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Consumes: yok (saf fonksiyon).
- Produces: `hasAnyRole(profile, roles: string[]): boolean` — Task 7 (main.js) bunu nav/route
  gating için kullanacak.

- [ ] **Step 1: Başarısız testi yaz**

`tests/auth.test.js`'in en üstündeki import satırını:
```js
import { hasRole } from '../src/lib/role.js';
```
şuna çevir:
```js
import { hasRole, hasAnyRole } from '../src/lib/role.js';
```

Sonra, mevcut `describe('hasRole', ...)` bloğunun (satır 27-39) HEMEN ALTINA ekle:

```js
describe('hasAnyRole', () => {
  it('profil rolü listede varsa true döner', () => {
    expect(hasAnyRole({ role: 'admin' }, ['admin', 'depo_yonetici'])).toBe(true);
  });

  it('profil rolü listede yoksa false döner', () => {
    expect(hasAnyRole({ role: 'kalite_ekibi' }, ['admin', 'depo_yonetici'])).toBe(false);
  });

  it('profil null ise false döner', () => {
    expect(hasAnyRole(null, ['admin'])).toBe(false);
  });

  it('boş rol listesiyle her zaman false döner', () => {
    expect(hasAnyRole({ role: 'admin' }, [])).toBe(false);
  });
});
```

- [ ] **Step 2: Testi çalıştır, `hasAnyRole is not defined` ile FAIL ettiğini doğrula**

Run: `npm run test -- tests/auth.test.js`
Expected: FAIL — `hasAnyRole is not a function` (henüz export edilmedi).

- [ ] **Step 3: `hasAnyRole`'u uygula**

`src/lib/role.js`'in tam içeriği:

```js
export function hasRole(profile, role) {
  return !!profile && profile.role === role;
}

export function hasAnyRole(profile, roles) {
  return !!profile && roles.includes(profile.role);
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

Run: `npm run test -- tests/auth.test.js`
Expected: PASS (tüm `hasRole` + yeni `hasAnyRole` testleri).

- [ ] **Step 5: Commit**

```bash
git add src/lib/role.js tests/auth.test.js
git commit -m "feat: coklu rol kontrolu icin hasAnyRole ekle"
```

---

## Task 3: "Kayıt Ara" Listesine Kaydeden Sütunu

**Files:**
- Modify: `src/lib/receipts.js:82`
- Modify: `src/pages/arama.js:60`, `src/pages/arama.js:86`, `src/pages/arama.js:91-98`
- Test: `tests/receipts-list.test.js`

**Interfaces:**
- Consumes: mevcut `listReceipts()` (receipts.js). Task 1'e bağımlı değil (SELECT politikaları
  değişmedi), bağımsız çalıştırılabilir.
- Produces: `listReceipts()` sonucundaki her satırda artık `received_profile: { full_name }` da var.

- [ ] **Step 1: Başarısız testi yaz**

`tests/receipts-list.test.js`'e, mevcut son test bloğunun (`'filtresiz aramada bile sonuç 500 kayıtla sınırlanır'`) ALTINA:

```js
  it('received_profile join ile kaydı oluşturanın adını da döner', async () => {
    receiptsQuery.limit.mockResolvedValueOnce({
      data: [{
        id: 'r1', receipt_date: '2026-08-20', irsaliye_no: 'IRS-1', status: 'onaylandi',
        companies: { name: 'TEST FIRMA' },
        received_profile: { full_name: 'Depo Kişisi' }
      }],
      error: null
    });
    const result = await listReceipts({});
    expect(result[0].received_profile.full_name).toBe('Depo Kişisi');
    expect(receiptsQuery.select).toHaveBeenCalledWith(expect.stringContaining('received_profile'));
  });
```

- [ ] **Step 2: Testi çalıştır, FAIL ettiğini doğrula**

Run: `npm run test -- tests/receipts-list.test.js`
Expected: FAIL — `select` çağrısı `received_profile` içermiyor (mevcut select bunu sorgulamıyor).

- [ ] **Step 3: `listReceipts` sorgusuna join ekle**

`src/lib/receipts.js:82`:
```js
    .select('id, receipt_date, irsaliye_no, status, companies (name)');
```
şuna çevir:
```js
    .select('id, receipt_date, irsaliye_no, status, companies (name), received_profile:profiles!receipts_received_by_fkey (full_name)');
```

- [ ] **Step 4: Testi çalıştır, PASS ettiğini doğrula**

Run: `npm run test -- tests/receipts-list.test.js`
Expected: PASS (tüm testler, yenisi dahil).

- [ ] **Step 5: `arama.js` tablosuna Kaydeden sütunu ekle**

`src/pages/arama.js:60`:
```js
          <thead><tr><th>Tarih</th><th>Firma</th><th>İrsaliye No</th><th>Durum</th><th></th></tr></thead>
```
şuna çevir:
```js
          <thead><tr><th>Tarih</th><th>Firma</th><th>Kaydeden</th><th>İrsaliye No</th><th>Durum</th><th></th></tr></thead>
```

`src/pages/arama.js:86` (`colspan="5"`):
```js
        tbody.innerHTML = '<tr><td colspan="5">Sonuç bulunamadı.</td></tr>';
```
şuna çevir:
```js
        tbody.innerHTML = '<tr><td colspan="6">Sonuç bulunamadı.</td></tr>';
```

`src/pages/arama.js:91-98` (satır şablonu):
```js
          (r) => `<tr>
            <td>${escapeHtml(r.receipt_date)}</td>
            <td>${escapeHtml(r.companies.name)}</td>
            <td>${escapeHtml(r.irsaliye_no || '-')}</td>
            <td><span class="badge badge-${STATUS_BADGE_VARIANT[r.status] || 'neutral'}">${escapeHtml(STATUS_LABELS[r.status] || r.status)}</span></td>
            <td><button data-view="${escapeHtml(r.id)}">Çıktı</button></td>
          </tr>`
```
şuna çevir:
```js
          (r) => `<tr>
            <td>${escapeHtml(r.receipt_date)}</td>
            <td>${escapeHtml(r.companies.name)}</td>
            <td>${escapeHtml(r.received_profile?.full_name || '-')}</td>
            <td>${escapeHtml(r.irsaliye_no || '-')}</td>
            <td><span class="badge badge-${STATUS_BADGE_VARIANT[r.status] || 'neutral'}">${escapeHtml(STATUS_LABELS[r.status] || r.status)}</span></td>
            <td><button data-view="${escapeHtml(r.id)}">Çıktı</button></td>
          </tr>`
```

- [ ] **Step 6: Build ile derleme hatasını kontrol et**

Run: `npm run build`
Expected: hatasız derleme. (arama.js için dedike bir test dosyası yok — mevcut proje deseniyle
tutarlı; görsel doğrulama Task 8'de yapılacak.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/receipts.js src/pages/arama.js tests/receipts-list.test.js
git commit -m "feat: kayit ara listesine kaydeden sutunu ekle"
```

---

## Task 4: İmzalar Hücresine Kaydı Oluşturanın Adı (PDF + Excel)

**Files:**
- Modify: `src/pages/mal-kabul-ciktisi.js:70`
- Modify: `src/lib/mal-kabul-excel.js:96-97`
- Test: `tests/mal-kabul-excel.test.js`

**Interfaces:**
- Consumes: `receipt.receivedByName` (zaten `getReceiptDetail`'den geliyor, bkz.
  `src/lib/receipts.js:72`). Task 1'e bağımlı değil, bağımsız çalıştırılabilir.
- Produces: yok (uçtaki çıktı, başka task buna bağlı değil).

- [ ] **Step 1: Başarısız Excel testini yaz**

`tests/mal-kabul-excel.test.js`'e, `describe('buildMalKabulWorkbook', ...)` bloğu içine (mevcut
testlerden herhangi birinin altına) ekle:

```js
  it('İmzalar hücresine (O:P birleştirilmiş) kaydı oluşturanın adını yazar', async () => {
    const wb = await buildMalKabulWorkbook(
      [{ receipt: ornekReceipt({ receivedByName: 'Depo Kişisi' }), items: [ornekOge()] }],
      await sablon()
    );
    const sheet = wb.worksheets[0];
    expect(sheet.getCell('O5').value).toBe('Depo Kişisi');
    expect(sheet.model.merges).toContain('O5:P5');
  });

  it('receivedByName yoksa İmzalar hücresine "-" yazar', async () => {
    const wb = await buildMalKabulWorkbook(
      [{ receipt: ornekReceipt({ receivedByName: undefined }), items: [ornekOge()] }],
      await sablon()
    );
    expect(wb.worksheets[0].getCell('O5').value).toBe('-');
  });
```

- [ ] **Step 2: Testi çalıştır, FAIL ettiğini doğrula**

Run: `npm run test -- tests/mal-kabul-excel.test.js`
Expected: FAIL — `O5` hücresi `null`/boş dönüyor (henüz yazılmıyor), `sheet.model.merges` `O5:P5` içermiyor.

- [ ] **Step 3: `mal-kabul-excel.js`'i güncelle**

`src/lib/mal-kabul-excel.js:96-97`:
```js
      sheet.getCell(`N${row}`).value = item.note || '-';
      // O{row}:P{row} (İmzalar) bilerek boş bırakılıyor — ıslak imza için.
```
şuna çevir:
```js
      sheet.getCell(`N${row}`).value = item.note || '-';
      // İmzalar (O:P) artık ıslak imza için boş bırakılmıyor — kaydı oluşturanın adı tek
      // birleştirilmiş hücreye yazılıyor (kullanıcı isteği, fiziksel imza alanı kalkıyor).
      sheet.mergeCells(`O${row}:P${row}`);
      sheet.getCell(`O${row}`).value = receipt.receivedByName || '-';
```

- [ ] **Step 4: Testi çalıştır, PASS ettiğini doğrula**

Run: `npm run test -- tests/mal-kabul-excel.test.js`
Expected: PASS (tüm testler, iki yenisi dahil). `sheet.model.merges` formatı beklenenden
farklıysa (ör. ExcelJS sürümüne göre farklı bir API şekli), gerçek hata mesajına bakıp assertion'ı
ona göre düzelt — asıl doğrulanması gereken davranış "O5 ve P5 tek bir birleştirilmiş hücre".

- [ ] **Step 5: PDF/print çıktısını güncelle**

`src/pages/mal-kabul-ciktisi.js:70`:
```js
              <td></td>
```
şuna çevir:
```js
              <td>${escapeHtml(receipt.receivedByName || '-')}</td>
```

- [ ] **Step 6: Tüm test paketini çalıştır**

Run: `npm run test`
Expected: tüm testler PASS (regresyon yok).

- [ ] **Step 7: Commit**

```bash
git add src/pages/mal-kabul-ciktisi.js src/lib/mal-kabul-excel.js tests/mal-kabul-excel.test.js
git commit -m "feat: imzalar hucresine kaydi olusturanin adini yaz (PDF+Excel)"
```

---

## Task 5: Edge Function `create-user`

**Files:**
- Create: `supabase/functions/create-user/index.ts`

**Interfaces:**
- Consumes: Task 1'deki `profiles.role='admin'` kontrolü (çağıranın admin olup olmadığını
  doğrulamak için), Supabase'in fonksiyona otomatik enjekte ettiği `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ortam değişkenleri.
- Produces: `POST` isteğiyle `{ username, password, fullName, role }` alır, başarılıysa
  `{ id, fullName, role }` döner. Task 6'daki `src/lib/users.js`'in `createUser()`'ı bunu
  `supabase.functions.invoke('create-user', { body })` ile çağıracak.

- [ ] **Step 1: Edge Function dosyasını yaz**

`supabase/functions/create-user/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const ALLOWED_ROLES = ['admin', 'depo_yonetici', 'kalite_ekibi'];
const EMAIL_DOMAIN = '@malkabul.local';

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Yetkilendirme başlığı eksik' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // Çağıranın kim olduğunu doğrulamak için ANON anahtarlı, çağıranın kendi JWT'sini taşıyan bir
  // client kullanıyoruz — service_role client'ıyla auth.getUser() çağırmak JWT doğrulamasını
  // atlar (her token'ı sorgusuzca geçerli sayar), bu yüzden ayrı bir "caller" client'ı şart.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Geçersiz oturum' }, 401);
  }

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  // KRİTİK: bu kontrol olmadan fonksiyon herkese açık bir "kullanıcı oluştur" arka kapısı olur.
  if (profileError || callerProfile?.role !== 'admin') {
    return jsonResponse({ error: 'Bu işlem için admin yetkisi gerekli' }, 403);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Geçersiz istek gövdesi' }, 400);
  }

  const { username, password, fullName, role } = body;
  if (!username || !password || !fullName || !role) {
    return jsonResponse({ error: 'username, password, fullName, role alanları zorunlu' }, 400);
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return jsonResponse({ error: 'Geçersiz rol: ' + role }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: username.trim().toLowerCase() + EMAIL_DOMAIN,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role }
  });

  if (createError) {
    return jsonResponse({ error: createError.message }, 400);
  }

  return jsonResponse({ id: created.user.id, fullName, role }, 200);
});
```

- [ ] **Step 2: Deploy talimatını kullanıcıya ilet**

Bu fonksiyon Deno runtime'da çalışır, proje bu monorepo'da bir Deno/Supabase CLI kurulumu
gerektirmez — Supabase Dashboard → Edge Functions → "Deploy a new function" → adı `create-user`
→ yukarıdaki kodu yapıştır → Deploy. `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
Supabase tarafından fonksiyona otomatik enjekte edilir, ekstra secret ayarlamaya gerek yok
(Supabase'in güncel Edge Function davranışı) — deploy sonrası bir hata alınırsa bu üçünün
Dashboard'daki Function secrets bölümünde manuel eklenmesi gerekebilir.

- [ ] **Step 3: Manuel doğrulama (otomatik test kapsamı yok — Deno runtime, Vitest'in dışında)**

Kullanıcıdan (veya kendin, tarayıcı console'unda gerçek oturumla) şu doğrulamaları yapmasını iste:
1. Admin (`test`) olarak giriş yapılmış oturumdan `supabase.functions.invoke('create-user', { body: { username: 'deneme1', password: 'test1234', fullName: 'Deneme Kullanıcı', role: 'depo_yonetici' } })` çağrılır → `{ data: { id, fullName:'Deneme Kullanıcı', role:'depo_yonetici' } }` dönmeli.
2. SQL Editor'da `select full_name, role from profiles where full_name='Deneme Kullanıcı';` → satır `role='depo_yonetici'` ile görünmeli (trigger doğru çalıştı).
3. Admin OLMAYAN bir hesaptan aynı çağrı yapılırsa `403` ve `"Bu işlem için admin yetkisi gerekli"` dönmeli.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/create-user/index.ts
git commit -m "feat: admin kullanici olusturma icin create-user Edge Function ekle"
```

---

## Task 6: Admin Paneli — `/kullanicilar` Sayfası

**Files:**
- Create: `src/lib/users.js`
- Create: `src/pages/kullanicilar.js`
- Test: `tests/kullanicilar.test.js`

**Interfaces:**
- Consumes: Task 1'deki `profiles_update_admin_role` politikası, Task 5'teki `create-user`
  Edge Function.
- Produces: `renderKullanicilar(container)` — Task 7, bunu `/kullanicilar` route'una bağlayacak.
  `listUsers()`, `updateUserRole(userId, role)`, `createUser({ username, password, fullName, role })`
  — `src/lib/users.js`'ten export edilir.

- [ ] **Step 1: `src/lib/users.js`'i yaz**

```js
import { supabase } from './supabase.js';

export async function listUsers() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
  if (error) throw error;
  return data;
}

export async function updateUserRole(userId, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw error;
}

export async function createUser({ username, password, fullName, role }) {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { username, password, fullName, role }
  });
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Başarısız sayfa testlerini yaz**

`tests/kullanicilar.test.js` (yeni dosya):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { listUsers, updateUserRole, createUser } = vi.hoisted(() => ({
  listUsers: vi.fn(),
  updateUserRole: vi.fn(),
  createUser: vi.fn()
}));

vi.mock('../src/lib/users.js', () => ({ listUsers, updateUserRole, createUser }));

import { renderKullanicilar } from '../src/pages/kullanicilar.js';

async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('kullanicilar sayfası', () => {
  let container;

  beforeEach(async () => {
    vi.clearAllMocks();
    listUsers.mockResolvedValue([
      { id: 'u1', full_name: 'Depo Kişisi', role: 'depo_yonetici' },
      { id: 'u2', full_name: 'Kalite Kişisi', role: 'kalite_ekibi' }
    ]);
    container = document.createElement('div');
    document.body.appendChild(container);
    await renderKullanicilar(container);
  });

  it('kullanıcı listesini ad-soyad ve rolüyle gösterir', () => {
    const rows = container.querySelectorAll('#users-body tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Depo Kişisi');
  });

  it('rol değiştirildiğinde updateUserRole doğru kullanıcı id ve yeni rolle çağrılır', async () => {
    const select = container.querySelector('[data-role-select="u1"]');
    select.value = 'admin';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();
    expect(updateUserRole).toHaveBeenCalledWith('u1', 'admin');
  });

  it('yeni kullanıcı formu gönderildiğinde createUser doğru alanlarla çağrılır', async () => {
    container.querySelector('#new-user-username').value = 'yeniuser';
    container.querySelector('#new-user-password').value = 'sifre123';
    container.querySelector('#new-user-fullname').value = 'Yeni Kullanıcı';
    container.querySelector('#new-user-role').value = 'kalite_ekibi';
    container.querySelector('#new-user-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAsync();
    expect(createUser).toHaveBeenCalledWith({
      username: 'yeniuser', password: 'sifre123', fullName: 'Yeni Kullanıcı', role: 'kalite_ekibi'
    });
  });

  it('createUser hata fırlatırsa okunur bir hata mesajı gösterir', async () => {
    createUser.mockRejectedValue(new Error('Bu kullanıcı adı zaten kayıtlı'));
    container.querySelector('#new-user-username').value = 'varolan';
    container.querySelector('#new-user-password').value = 'sifre123';
    container.querySelector('#new-user-fullname').value = 'Var Olan';
    container.querySelector('#new-user-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAsync();
    const msg = container.querySelector('#new-user-msg');
    expect(msg.textContent).toBe('Hata: Bu kullanıcı adı zaten kayıtlı');
  });
});
```

- [ ] **Step 3: Testi çalıştır, FAIL ettiğini doğrula**

Run: `npm run test -- tests/kullanicilar.test.js`
Expected: FAIL — `src/pages/kullanicilar.js` henüz yok (`Cannot find module`).

- [ ] **Step 4: `src/pages/kullanicilar.js`'i yaz**

```js
import { listUsers, updateUserRole, createUser } from '../lib/users.js';
import { escapeHtml } from '../lib/html.js';

const ROLE_LABELS = {
  admin: 'Admin',
  depo_yonetici: 'Depo',
  kalite_ekibi: 'Kalite Ekibi'
};

export async function renderKullanicilar(container) {
  const users = await listUsers();

  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">👥 Kullanıcılar</div></div>
      <table class="card-table">
        <thead><tr><th>Ad Soyad</th><th>Rol</th></tr></thead>
        <tbody id="users-body">
          ${users
            .map(
              (u) => `
            <tr>
              <td>${escapeHtml(u.full_name)}</td>
              <td>
                <select data-role-select="${escapeHtml(u.id)}">
                  ${Object.entries(ROLE_LABELS)
                    .map(([value, label]) => `<option value="${value}" ${u.role === value ? 'selected' : ''}>${label}</option>`)
                    .join('')}
                </select>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <p id="users-msg"></p>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-header-title">➕ Yeni Kullanıcı</div></div>
      <form id="new-user-form" style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <input type="text" id="new-user-username" placeholder="Kullanıcı adı" required style="flex:1;min-width:150px;" />
        <input type="password" id="new-user-password" placeholder="Şifre" required style="flex:1;min-width:150px;" />
        <input type="text" id="new-user-fullname" placeholder="Ad Soyad" required style="flex:1;min-width:150px;" />
        <select id="new-user-role">
          ${Object.entries(ROLE_LABELS)
            .map(([value, label]) => `<option value="${value}">${label}</option>`)
            .join('')}
        </select>
        <button type="submit" class="btn-accent">Oluştur</button>
      </form>
      <p id="new-user-msg"></p>
    </div>
  `;

  container.querySelectorAll('[data-role-select]').forEach((select) => {
    select.addEventListener('change', async () => {
      const msg = container.querySelector('#users-msg');
      msg.textContent = '';
      try {
        await updateUserRole(select.dataset.roleSelect, select.value);
        msg.style.color = 'var(--color-success-text)';
        msg.textContent = 'Rol güncellendi.';
      } catch (err) {
        msg.style.color = 'var(--color-danger-text)';
        msg.textContent = 'Hata: ' + err.message;
      }
    });
  });

  container.querySelector('#new-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = container.querySelector('#new-user-msg');
    msg.textContent = '';
    const username = container.querySelector('#new-user-username').value.trim();
    const password = container.querySelector('#new-user-password').value;
    const fullName = container.querySelector('#new-user-fullname').value.trim();
    const role = container.querySelector('#new-user-role').value;
    try {
      await createUser({ username, password, fullName, role });
      msg.style.color = 'var(--color-success-text)';
      msg.textContent = 'Kullanıcı oluşturuldu.';
      await renderKullanicilar(container);
    } catch (err) {
      msg.style.color = 'var(--color-danger-text)';
      msg.textContent = 'Hata: ' + err.message;
    }
  });
}
```

- [ ] **Step 5: Testi çalıştır, PASS ettiğini doğrula**

Run: `npm run test -- tests/kullanicilar.test.js`
Expected: PASS (4 test).

- [ ] **Step 6: Tüm test paketini çalıştır**

Run: `npm run test`
Expected: tüm testler PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/users.js src/pages/kullanicilar.js tests/kullanicilar.test.js
git commit -m "feat: admin kullanici yonetimi sayfasini ekle (/kullanicilar)"
```

---

## Task 7: Nav/Route Gating (main.js)

**Files:**
- Modify: `src/main.js:2` (import), `src/main.js:4` (import), `src/main.js:121-137`, `src/main.js:151-159`

**Interfaces:**
- Consumes: `hasAnyRole(profile, roles)` (Task 2), `renderKullanicilar` (Task 6).
- Produces: nav pilleri ve route kayıtları role göre filtrelenmiş `renderApp()`.

- [ ] **Step 1: main.js'i güncelle**

`src/main.js:2` satırındaki import'u:
```js
import { getCurrentProfile, onAuthStateChange, signOut } from './lib/auth.js';
```
şuna çevir:
```js
import { getCurrentProfile, onAuthStateChange, signOut } from './lib/auth.js';
import { hasAnyRole } from './lib/role.js';
```

`src/main.js:4`'teki `renderFirmalar` import satırının altına ekle:
```js
import { renderKullanicilar } from './pages/kullanicilar.js';
```

`src/main.js:121-137` arasındaki (mevcut `app.innerHTML = ...` bloğu, nav dahil) kodu şununla değiştir:

```js
    const canManageCatalog = hasAnyRole(profile, ['admin', 'depo_yonetici']);
    const canCreateReceipt = hasAnyRole(profile, ['depo_yonetici']);
    const isAdmin = hasAnyRole(profile, ['admin']);

    app.innerHTML = `
      <header class="app-topbar">
        <span class="app-topbar-title">Mal Kabul Formu</span>
        <span>
          <span class="app-topbar-user">${escapeHtml(profile.full_name)} (${escapeHtml(profile.role)})</span>
          <button id="logout-btn" class="btn-ghost">Çıkış</button>
        </span>
      </header>
      <nav class="app-subnav">
        <button class="pill-tab" data-nav="/">Ana Sayfa</button>
        ${canManageCatalog ? '<button class="pill-tab" data-nav="/firmalar">Firmalar</button>' : ''}
        ${canManageCatalog ? '<button class="pill-tab" data-nav="/urunler">Ürünler</button>' : ''}
        ${canCreateReceipt ? '<button class="pill-tab" data-nav="/yeni-kabul">Yeni Mal Kabul</button>' : ''}
        <button class="pill-tab" data-nav="/arama">Kayıt Ara</button>
        ${isAdmin ? '<button class="pill-tab" data-nav="/kullanicilar">Kullanıcılar</button>' : ''}
      </nav>
      <main id="page-content" style="padding:1.25rem;"></main>
    `;
```

`src/main.js:151-159` arasındaki route kayıtlarını şununla değiştir (home route'u da role göre
uyarlıyor — kayıt oluşturamayan roller için buton yerine sade bir karşılama metni):

```js
    registerRoute('/', (c) => {
      c.innerHTML = canCreateReceipt
        ? '<p><button class="btn-accent" data-nav="/yeni-kabul">+ Yeni Mal Kabul</button></p>'
        : '<p>Hoş geldiniz.</p>';
      const btn = c.querySelector('[data-nav]');
      if (btn) btn.addEventListener('click', () => navigate('/yeni-kabul'));
    });
    if (canManageCatalog) registerRoute('/firmalar', renderFirmalar);
    if (canManageCatalog) registerRoute('/urunler', renderUrunler);
    if (canCreateReceipt) registerRoute('/yeni-kabul', renderYeniKabul);
    registerRoute('/arama', renderArama);
    registerRoute('/mal-kabul-ciktisi', renderMalKabulCiktisi);
    if (isAdmin) registerRoute('/kullanicilar', renderKullanicilar);
```

Not: `router.js`'teki `renderCurrent()` kayıtlı olmayan bir path için `routes.get('/')`'e
(ana sayfaya) düşüyor (bkz. `src/router.js:46`) — yani bir kullanıcı yetkisi olmayan bir rotayı
elle URL'den denerse hata almaz, sessizce ana sayfaya yönlenir. Bu kabul edilebilir davranış
(gerçek engelleme RLS'te).

- [ ] **Step 2: Bu projede main.js için otomatik test yok (mevcut desen) — build ile doğrula**

Bu dosya için (firmalar.js/urunler.js/arama.js gibi diğer sayfa-orkestrasyon dosyalarında olduğu
gibi) projede dedike bir test dosyası yok; `npm run build` ile derleme hatasını, nav görünürlüğünü
ise Task 8'deki üç-rollü canlı doğrulamayla kontrol edeceğiz.

Run: `npm run build`
Expected: hatasız derleme.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: nav ve route erisimini role gore filtrele"
```

---

## Task 8: Uçtan Uca Canlı Doğrulama (üç rol)

**Files:** yok (sadece doğrulama, kod değişikliği yok)

**Interfaces:** yok.

- [ ] **Step 1: `npm run build` ile temiz derleme doğrula**

Run: `npm run build`
Expected: hatasız.

- [ ] **Step 2: `npm run test` ile tüm paketi doğrula**

Run: `npm run test`
Expected: tüm testler PASS (regresyon yok).

- [ ] **Step 3: Kullanıcıdan üç ayrı hesapla canlı doğrulama iste (veya kendin dev server üzerinden yap)**

Şu senaryoları kontrol et:
1. **admin (`test`)**: nav'da Firmalar, Ürünler, Kullanıcılar, Kayıt Ara görünüyor; Yeni Mal
   Kabul GÖRÜNMÜYOR. `/kullanicilar`'da yeni bir `depo_yonetici` kullanıcısı oluşturulabiliyor
   ve listede rolü değiştirilebiliyor.
2. **depo_yonetici** (Task 5/6'da oluşturulan test kullanıcısı): nav'da Firmalar, Ürünler,
   Yeni Mal Kabul, Kayıt Ara görünüyor; Kullanıcılar GÖRÜNMÜYOR. Yeni bir mal kabul kaydı
   oluşturulabiliyor.
3. **kalite_ekibi** (admin panelinden oluşturulan bir test kullanıcısı): nav'da SADECE Kayıt
   Ara görünüyor. Kayıt Ara'da mevcut kayıtları arayıp bir kaydın PDF/Excel çıktısını
   görüntüleyebiliyor ama Firmalar/Ürünler/Yeni Mal Kabul'e erişemiyor (nav'da yok ve URL'den
   `#/yeni-kabul` denenirse ana sayfaya düşüyor).
4. Kayıt Ara listesinde "Kaydeden" sütunu doluyor; bir kaydın PDF ve Excel çıktısında İmzalar
   hücresinde kaydı oluşturanın adı görünüyor (ıslak imza alanı kalkmış).

- [ ] **Step 4: Bulunan sorunları düzelt, ilgili task'ın testini güncelleyip tekrar çalıştır**

Bir sorun bulunursa, hangi task'a ait olduğunu belirle, o task'ın dosyalarında düzelt, ilgili
test dosyasını çalıştır, sonra bu adıma geri dön.
