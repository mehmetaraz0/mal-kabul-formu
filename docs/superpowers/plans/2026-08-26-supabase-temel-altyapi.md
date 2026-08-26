# Supabase Temel Altyapı ve Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mal Kabul Formu PWA'sının temelini kurmak: Vite tabanlı vanilla JS proje iskeleti, Supabase veritabanı şeması (firmalar, ürünler, mal kabul kayıtları, profiller), Row Level Security politikaları, rol tabanlı kimlik doğrulama (depo yöneticisi / kalite ekibi) ve PWA manifest/service worker iskeleti.

**Architecture:** Vite + vanilla JavaScript (ES modules) ile derlenen, build çıktısı düz HTML/CSS/JS olan bir SPA. Veri katmanı tamamen Supabase (Postgres + Auth + RLS) üzerinde. `src/lib/supabase.js` tek bir Supabase client'ı export eder; tüm sayfalar bunun üzerinden veri okur/yazar. Sonraki planlar (firma/ürün yönetimi, mal kabul formu, arama/export, offline senkron) bu plandaki tabloları ve `src/lib/auth.js` API'sini kullanır.

**Tech Stack:** Vite 5, vanilla JS (ES modules, framework yok), `@supabase/supabase-js` v2, `vite-plugin-pwa`, Vitest (saf mantık testleri için), Supabase CLI (yerel şema migration'ları için).

## Global Constraints

- Tüm arayüz metinleri Türkçe.
- Supabase proje kurulumu **yeni** bir proje olacak (kullanıcı onayladı) — proje oluşturma adımları bu planda manuel talimat olarak verilir, otomatik script Supabase Cloud hesabı gerektirdiği için CLI ile yapılamaz.
- Roller sabit: `depo_yonetici`, `kalite_ekibi`. Yeni kullanıcılar varsayılan olarak `depo_yonetici` olur; `kalite_ekibi` rolüne yükseltme Supabase Dashboard'dan manuel yapılır (bu planda ayrı bir admin paneli istenmedi).
- Ürün birimleri sabit: `kg`, `ad`. Ürün kategorileri sabit: `ET`, `BALIK` (kaynak "Kasap Sipariş Formu" belgesindeki iki bölüme karşılık gelir).
- Mal kabul durum akışı sabit: `taslak` → `kalite_bekliyor` → `onaylandi` | `reddedildi` (sonraki planlarda kullanılacak, şema burada oluşturulur).
- RLS her tabloda açık olacak; hiçbir tablo public/anon yazma izni almayacak.
- Firma verisi kaynağı: `C:\Users\mta-1\Desktop\Firma_Isim_Listesi (1).xlsx` (62 firma). Ürün verisi kaynağı: kullanıcının paylaştığı "KASAP SİPARİŞ FORMU" görseli/PDF'i (bu planda transkript edilmiş haliyle seed script'ine gömülür).
- **Varsayım (kullanıcıya doğrulatılmalı):** Gerçek "Mal Kabul Formu" kağıt şablonu henüz elde değil; bu plan sadece veri şemasını kurar, form/print tasarımı Plan 4'te ele alınır ve o plan bu varsayımı tekrar işaretler.
- **Güvenlik:** Veritabanından gelen serbest metin (firma adı, ürün adı, kullanıcı tam adı, not alanları vb.) `innerHTML` içine yazılırken MUTLAKA Task 6'da eklenen `src/lib/html.js`'teki `escapeHtml()` ile kaçışlanmalı — stored XSS riski (Task 6 review'da tespit edildi). Plan 2, 3 ve 4'teki tüm listeleme/detay sayfaları bu kurala tabidir.
- **Giriş yöntemi (kullanıcı talebiyle güncellendi):** Depo personelinin tamamında e-posta olmayabileceğinden giriş ekranı kullanıcı adı + şifre ister; Supabase Auth'un e-posta zorunluluğunu karşılamak için kullanıcı adına sabit `@malkabul.local` son eki eklenir (bkz. Task 6). Yeni personel hesabı Supabase Dashboard'dan `kullaniciadi@malkabul.local` e-postasıyla ve **Auto Confirm User** işaretli olarak açılır.
- **KRİTİK güvenlik gereksinimi (final review'da tespit edildi):** Supabase Dashboard → Authentication → Sign In / Providers → Email → **"Allow new users to sign up" MUTLAKA kapatılmalı**. Kapatılmazsa, herkese açık `anon` anahtarıyla (istemci JS bundle'ında zaten herkese açık) `supabase.auth.signUp()` çağrılarak `@malkabul.local` uzantılı sahte bir hesap self-servis açılabilir; `on_auth_user_created` trigger'ı bu hesaba otomatik `depo_yonetici` rolü verir ve canlı, gerçek verili projeye yazma yetkisi kazandırır. Bu ayar kod ile kapatılamaz, sadece Dashboard'dan manuel yapılır.
- **Task 4 sonrası güvenlik sıkılaştırması (final review'da bulundu, `0004_receipt_items_ve_receipts_sikilastirma.sql` ile eklendi):** `receipt_items_update_flow` politikasında `with check` eksikti — bu, `receipt_items_insert_manager`'ın `uygunluk = 'beklemede'` zorunluluğunu bir sonraki UPDATE ile tamamen etkisiz kılıyordu (bir depo_yonetici, ürünü ekledikten hemen sonra `uygunluk`'u `uygun` yapıp öyle kalite onayına gönderebiliyordu). Ayrıca `quality_by` sahtelenebiliyordu (herhangi bir kalite_ekibi üyesi başka bir kullanıcının UUID'sini `quality_by` olarak yazabiliyordu) ve `receipts`'in temel alanları (`company_id`, `received_by`, `receipt_date`, `irsaliye_no`, `siparis_no`, `client_uuid`) oluşturulduktan sonra hiçbir RLS politikası tarafından donduruLmamıştı. `0004` migration'ı: (a) `receipt_items_update_flow`'a uygunluk geçişlerini rol bazlı kısıtlayan bir `with check` ekler, (b) `receipts_insert_manager`'a `quality_by is null and quality_note is null` ekler, (c) `receipts_update_manager_draft`'ın kalite dalına `quality_by = auth.uid()` ve depo dalına `quality_by is null` ekler, (d) yukarıdaki 6 temel alanı BEFORE UPDATE trigger'ıyla donduruLur, (e) `updated_at`'ı otomatik güncelleyen bir trigger ekler, (f) `receipt_items(receipt_id, line_no)` üzerine bir UNIQUE kısıt ekler (Plan 5'in offline senkron kuyruğu bu anahtar olmadan retry sırasında satırları sessizce kaybediyordu).

---

## Dosya Yapısı

```
kabul-formu/
  package.json
  vite.config.js
  index.html
  .env.local                # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (gitignore'da)
  .gitignore
  public/
    manifest.webmanifest    # vite-plugin-pwa tarafından da üretilir, elle de tutulur
    icons/
      icon-192.png
      icon-512.png
  src/
    main.js                 # uygulama giriş noktası, router
    style.css                # global stiller (mobile-first)
    lib/
      supabase.js            # Supabase client singleton
      auth.js                 # login/logout/getProfile/onAuthChange
    pages/
      login.js               # Plan 1 kapsamında minimal login ekranı
  supabase/
    migrations/
      0001_init_schema.sql
      0002_rls_policies.sql
      0003_profile_trigger.sql
    seed/
      seed_companies.sql
      seed_products.sql
  scripts/
    xlsx_to_seed.py          # Excel -> seed_companies.sql üretici (tek seferlik yardımcı script)
  tests/
    auth.test.js
```

---

### Task 1: Proje İskeletini Kur (Vite + PWA eklentisi)

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/main.js`
- Create: `src/style.css`
- Create: `.gitignore`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png` (basit placeholder ikon — gerçek logo Plan 4/5'te değiştirilecek)

**Interfaces:**
- Produces: `npm run dev` ile çalışan bir Vite geliştirme sunucusu, `#app` id'li bir kök `div`.

- [ ] **Step 1: `package.json` oluştur**

```json
{
  "name": "mal-kabul-formu",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vite-plugin-pwa": "^0.20.5",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Bağımlılıkları yükle**

Run: `npm install`
Expected: `node_modules` klasörü oluşur, hata yok.

- [ ] **Step 3: `vite.config.js` oluştur (PWA eklentisi ile, offline caching stratejisi Plan 5'te doldurulacak)**

```javascript
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Mal Kabul Formu',
        short_name: 'MalKabul',
        description: 'Depo mal kabul kayıt ve onay sistemi',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // Plan 5'te app-shell ve master data caching kuralları eklenecek
        globPatterns: ['**/*.{js,css,html}']
      }
    })
  ]
});
```

- [ ] **Step 4: `index.html` oluştur**

```html
<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mal Kabul Formu</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app">Yükleniyor...</div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 5: `src/style.css` oluştur (mobile-first temel)**

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, "Segoe UI", Arial, sans-serif;
  background: #f4f5f7;
  color: #1a1a1a;
}
#app { min-height: 100vh; display: flex; flex-direction: column; }
button {
  font-size: 1rem;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  border: none;
  background: #1e3a5f;
  color: white;
  cursor: pointer;
}
input, select {
  font-size: 1rem;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 100%;
}
@media (min-width: 768px) {
  #app { max-width: 960px; margin: 0 auto; }
}
```

- [ ] **Step 6: `src/main.js` oluştur (geçici placeholder — Task 4'te login akışına bağlanacak)**

```javascript
document.querySelector('#app').innerHTML = '<h1>Mal Kabul Formu</h1><p>Kurulum devam ediyor.</p>';
```

- [ ] **Step 7: `.gitignore` oluştur**

```
node_modules
dist
.env.local
dev-dist
```

- [ ] **Step 8: Geliştirme sunucusunu çalıştır ve tarayıcıda doğrula**

Run: `npm run dev`
Expected: Terminalde `Local: http://localhost:5173/` yazar. Tarayıcıda aç, "Mal Kabul Formu / Kurulum devam ediyor." metni görünür, konsol hatası yok.

- [ ] **Step 9: Commit**

```bash
git init
git add package.json vite.config.js index.html src .gitignore
git commit -m "chore: Vite + PWA proje iskeletini kur"
```

---

### Task 2: Supabase Projesini Oluştur ve Client'ı Bağla

Bu görev manuel bir Supabase Cloud adımı içerir (otomatik script ile yapılamaz).

**Files:**
- Create: `.env.local`
- Create: `src/lib/supabase.js`
- Create: `supabase/migrations/` (klasör, boş — Task 3'te doldurulacak)

**Interfaces:**
- Produces: `supabase` (named export) — `createClient` ile oluşturulmuş, tüm sonraki planların import edeceği tek client.

- [ ] **Step 1: Supabase projesi oluştur (manuel)**

1. https://supabase.com adresinde oturum aç, "New Project" ile yeni proje oluştur (örn. isim: `mal-kabul-formu`).
2. Proje ayarlarından **Project URL** ve **anon public key** değerlerini kopyala (Settings → API).

- [ ] **Step 2: `.env.local` oluştur**

```
VITE_SUPABASE_URL=https://XXXXXXXX.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

(Gerçek değerleri Adım 1'den yapıştır. Bu dosya `.gitignore` içinde, commit'lenmeyecek.)

- [ ] **Step 3: `src/lib/supabase.js` oluştur**

```javascript
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY .env.local dosyasında tanımlı olmalı');
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});
```

- [ ] **Step 4: Bağlantıyı doğrula**

`src/main.js` içine geçici olarak ekle:

```javascript
import { supabase } from './lib/supabase.js';
supabase.auth.getSession().then(({ data, error }) => {
  console.log('Supabase bağlantısı:', error ? 'HATA: ' + error.message : 'OK', data);
});
```

Run: `npm run dev`, tarayıcı konsolunu aç.
Expected: `Supabase bağlantısı: OK { session: null }` yazar, hata yok.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.js .env.example 2>/dev/null; git add src/main.js
git commit -m "feat: Supabase client bağlantısını kur"
```

(Not: `.env.local` gitignore'da olduğu için commit'e girmez; ekip arkadaşları için `.env.example` dosyasını da bu adımda `VITE_SUPABASE_URL=` / `VITE_SUPABASE_ANON_KEY=` boş anahtarlarla oluştur ve commit'le.)

---

### Task 3: Veritabanı Şemasını Oluştur

**Files:**
- Create: `supabase/migrations/0001_init_schema.sql`

**Interfaces:**
- Produces: `profiles`, `companies`, `products`, `receipts`, `receipt_items` tabloları. Sonraki tüm planlar bu tablo/kolon adlarını birebir kullanır.

- [ ] **Step 1: Migration SQL dosyasını yaz**

```sql
-- 0001_init_schema.sql

create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'depo_yonetici' check (role in ('depo_yonetici', 'kalite_ekibi')),
  created_at timestamptz not null default now()
);

create table companies (
  id bigint generated always as identity primary key,
  sira_no int,
  name text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table products (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  unit text not null check (unit in ('kg', 'ad')),
  category text not null check (category in ('ET', 'BALIK')),
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  client_uuid text unique,
  company_id bigint not null references companies(id),
  receipt_date date not null default current_date,
  irsaliye_no text,
  siparis_no text,
  status text not null default 'taslak' check (status in ('taslak', 'kalite_bekliyor', 'onaylandi', 'reddedildi')),
  received_by uuid references profiles(id),
  quality_by uuid references profiles(id),
  quality_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  product_id bigint not null references products(id),
  line_no int not null,
  lot_no text,
  skt date,
  quantity numeric(10,2) not null,
  unit text not null check (unit in ('kg', 'ad')),
  uygunluk text not null default 'beklemede' check (uygunluk in ('uygun', 'uygun_degil', 'beklemede')),
  note text
);

create index idx_receipts_company on receipts(company_id);
create index idx_receipts_date on receipts(receipt_date);
create index idx_receipts_status on receipts(status);
create index idx_receipt_items_receipt on receipt_items(receipt_id);
create index idx_products_category on products(category);
```

- [ ] **Step 2: Migration'ı Supabase'e uygula (manuel — Supabase Dashboard SQL Editor üzerinden)**

1. Supabase Dashboard → SQL Editor → New Query.
2. `0001_init_schema.sql` içeriğini yapıştır, Run.
Expected: "Success. No rows returned." mesajı, Table Editor'de 5 tablo görünür.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_init_schema.sql
git commit -m "feat: mal kabul veritabanı şemasını oluştur"
```

---

### Task 4: RLS Politikalarını ve Profil Trigger'ını Ekle

**Files:**
- Create: `supabase/migrations/0002_rls_policies.sql`
- Create: `supabase/migrations/0003_profile_trigger.sql`

**Interfaces:**
- Consumes: Task 3'teki tablolar.
- Produces: Her tabloda RLS aktif; yeni `auth.users` kaydı oluştuğunda otomatik `profiles` satırı oluşturan trigger.

- [ ] **Step 1: `0002_rls_policies.sql` yaz**

```sql
-- 0002_rls_policies.sql

alter table profiles enable row level security;
alter table companies enable row level security;
alter table products enable row level security;
alter table receipts enable row level security;
alter table receipt_items enable row level security;

-- profiles: herkes (authenticated) tüm profilleri okuyabilir (isim göstermek için), sadece kendi satırını güncelleyebilir
create policy "profiles_select_all" on profiles for select to authenticated using (true);
create policy "profiles_update_own" on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- role sütunu authenticated kullanıcılar tarafından hiç değiştirilemez (self-escalation engeli):
-- yükseltme sadece Supabase Dashboard'dan manuel yapılır (bkz. Global Constraints).
-- Supabase yeni tablolara varsayılan olarak authenticated rolüne tablo genelinde UPDATE
-- yetkisi verir; sadece sütun bazlı revoke bunu geçersiz kılmaz (tablo genelindeki yetki
-- tüm sütunları zaten kapsar). Önce tablo genelindeki UPDATE yetkisini tamamen kaldırıp,
-- ardından sadece full_name sütununa izin veriyoruz.
revoke update on profiles from authenticated;
grant update (full_name) on profiles to authenticated;

-- companies: authenticated herkes okuyabilir ve ekleyebilir; güncelleme/silme sadece depo_yonetici
create policy "companies_select_all" on companies for select to authenticated using (true);
create policy "companies_insert_all" on companies for insert to authenticated with check (true);
create policy "companies_update_manager" on companies for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'));
create policy "companies_delete_manager" on companies for delete to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'));

-- products: companies ile aynı kural
create policy "products_select_all" on products for select to authenticated using (true);
create policy "products_insert_all" on products for insert to authenticated with check (true);
create policy "products_update_manager" on products for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'));
create policy "products_delete_manager" on products for delete to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'));

-- receipts: herkes okuyabilir (kalite ekibi bekleyenleri görmeli)
create policy "receipts_select_all" on receipts for select to authenticated using (true);
-- depo_yonetici kendi adına yeni kayıt oluşturabilir
create policy "receipts_insert_manager" on receipts for insert to authenticated
  with check (
    received_by = auth.uid()
    and status = 'taslak'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici')
  );
-- depo_yonetici taslak durumundaki kendi kaydını güncelleyebilir (ve kalite_bekliyor'a gönderebilir);
-- kalite_ekibi kalite_bekliyor durumundaki her kaydı güncelleyebilir (ve onaylandi/reddedildi'ye taşıyabilir).
-- with check olmadan Postgres, using ifadesini GÜNCEL (yeni) satıra da uygular — bu da taslak->kalite_bekliyor
-- ve kalite_bekliyor->onaylandi/reddedildi geçişlerini using'deki durum kısıtına takılıp engelleyeceğinden
-- geçişlere izin veren ayrı bir with check şart.
create policy "receipts_update_manager_draft" on receipts for update to authenticated
  using (
    (status = 'taslak' and received_by = auth.uid()
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'))
    or
    (status = 'kalite_bekliyor'
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'kalite_ekibi'))
  )
  with check (
    (received_by = auth.uid() and status in ('taslak', 'kalite_bekliyor')
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'))
    or
    (status in ('kalite_bekliyor', 'onaylandi', 'reddedildi')
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'kalite_ekibi'))
  );

-- receipt_items: receipts ile aynı erişim kuralına bağlı (join üzerinden)
create policy "receipt_items_select_all" on receipt_items for select to authenticated using (true);
create policy "receipt_items_insert_manager" on receipt_items for insert to authenticated
  with check (
    uygunluk = 'beklemede'
    and exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid() and p.role = 'depo_yonetici'
    )
  );
create policy "receipt_items_update_flow" on receipt_items for update to authenticated
  using (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and (
        (r.status = 'taslak' and r.received_by = auth.uid() and p.role = 'depo_yonetici')
        or (r.status = 'kalite_bekliyor' and p.role = 'kalite_ekibi')
      )
    )
  );
create policy "receipt_items_delete_draft" on receipt_items for delete to authenticated
  using (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid() and p.role = 'depo_yonetici'
    )
  );
```

- [ ] **Step 2: `0003_profile_trigger.sql` yaz**

```sql
-- 0003_profile_trigger.sql

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- new.email artık gerçek bir e-posta değil, "kullaniciadi@malkabul.local" biçiminde sahte bir
  -- adres olabilir (bkz. Task 6 login değişikliği) — full_name varsayılanı olarak tüm adresi değil,
  -- sadece @ öncesi kullanıcı adını kullanmak daha okunaklı bir görünen isim verir.
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 'depo_yonetici');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

- [ ] **Step 3: İki dosyayı da Supabase SQL Editor'de sırayla çalıştır**

Expected: Hata yok. Table Editor'de her tabloda "RLS enabled" etiketi görünür.

- [ ] **Step 4: Trigger'ı manuel doğrula**

1. Supabase Dashboard → Authentication → Users → "Add user" ile test kullanıcısı oluştur (email+şifre).
2. Table Editor → `profiles` tablosuna bak.
Expected: Yeni kullanıcı için otomatik bir `profiles` satırı, `role = 'depo_yonetici'` ile oluşmuş.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_rls_policies.sql supabase/migrations/0003_profile_trigger.sql
git commit -m "feat: RLS politikalarını ve otomatik profil trigger'ını ekle"
```

---

### Task 5: Firma ve Ürün Seed Verisini Yükle

**Files:**
- Create: `scripts/xlsx_to_seed.py`
- Create: `supabase/seed/seed_companies.sql`
- Create: `supabase/seed/seed_products.sql`

**Interfaces:**
- Consumes: `companies`, `products` tabloları (Task 3).
- Produces: 62 firma satırı, 63 ürün satırı (Task sonunda Table Editor'de doğrulanacak sayılar).

- [ ] **Step 1: `scripts/xlsx_to_seed.py` yaz (Excel'den SQL üretici, tek seferlik yardımcı araç)**

```python
import openpyxl
import sys

SRC = r"C:\Users\mta-1\Desktop\Firma_Isim_Listesi (1).xlsx"
OUT = "supabase/seed/seed_companies.sql"

wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb["Firma Listesi"]

lines = ["-- seed_companies.sql (xlsx_to_seed.py tarafından üretildi)", "insert into companies (sira_no, name) values"]
rows = []
for sira_no, name, _ in ws.iter_rows(min_row=2, values_only=True):
    if name is None:
        continue
    clean_name = str(name).strip().replace("'", "''")
    rows.append(f"  ({int(sira_no)}, '{clean_name}')")

lines.append(",\n".join(rows) + "\non conflict (name) do nothing;")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"{len(rows)} firma yazıldı -> {OUT}")
```

- [ ] **Step 2: Script'i çalıştır**

Run: `python scripts/xlsx_to_seed.py`
Expected: `62 firma yazıldı -> supabase/seed/seed_companies.sql` (veya Excel'deki gerçek satır sayısı).

- [ ] **Step 3: `supabase/seed/seed_products.sql` elle yaz (KASAP SİPARİŞ FORMU görselinden transkript edilen katalog)**

```sql
-- seed_products.sql
insert into products (code, name, unit, category) values
  ('YIY01000001', 'DONER DANA HAZIR BATON (212)', 'kg', 'ET'),
  ('YIY01000002', 'DANA BESLI SET (201)', 'kg', 'ET'),
  ('YIY01000003', 'DANA ET KIYMALIK (202)', 'kg', 'ET'),
  ('YIY01000004', 'DANA KONTRAFILE (203)', 'kg', 'ET'),
  ('YIY01000005', 'DANA BONFILE FITILSIZ (204)', 'kg', 'ET'),
  ('YIY01000006', 'DANA ANTRIKOT (205)', 'kg', 'ET'),
  ('YIY01000007', 'KUZU BUT (206)', 'kg', 'ET'),
  ('YIY01000009', 'KUZU KOL (213)', 'kg', 'ET'),
  ('YIY01000012', 'KUZU KANAT PIRZOLA (209)', 'kg', 'ET'),
  ('YIY01000013', 'KUZU KARACIGER (211)', 'kg', 'ET'),
  ('YIY01000014', 'ISKEMBE (212)', 'kg', 'ET'),
  ('YIY01000015', 'PILIC BUTUN BOYUNSUZ 1300-1400', 'kg', 'ET'),
  ('YIY01000016', 'PILIC BUTUN BOYUNSUZ 1600-1700', 'kg', 'ET'),
  ('YIY01000017', 'PILIC BAGET (251)', 'kg', 'ET'),
  ('YIY01000019', 'PILIC GOGUS FILETO (252)', 'kg', 'ET'),
  ('YIY01000020', 'PILIC KANAT (253)', 'kg', 'ET'),
  ('YIY01000021', 'PILIC GOGUS SIS (254)', 'kg', 'ET'),
  ('YIY01000022', 'SCHNITZEL PILIC (256)', 'kg', 'ET'),
  ('YIY01000025', 'PILIC BABY SIS (258)', 'kg', 'ET'),
  ('YIY01000026', 'PILIC BUT FILETO(IZGR.TAVA) 275', 'kg', 'ET'),
  ('YIY01000027', 'DONER PILIC HAZIR TAM GOG (260)', 'kg', 'ET'),
  ('YIY01000028', 'HINDI GOGUS FILETO (270)', 'kg', 'ET'),
  ('YIY01000031', 'HINDI BUT KEMIKLI (271)', 'kg', 'ET'),
  ('YIY01000032', 'HINDI KALCA SIS (274)', 'kg', 'ET'),
  ('YIY01000033', 'HINDI GOGUS COP SIS (272)', 'kg', 'ET'),
  ('YIY01000036', 'KOFTE INEGOL PINAR (402)', 'kg', 'ET'),
  ('YIY01000058', 'HINDI BUTUN (276)', 'kg', 'ET'),
  ('YIY01000060', 'KUZU BUTUN', 'kg', 'ET'),
  ('YIY01000061', 'KUYRUK YAGI', 'kg', 'ET'),
  ('YIY01000063', 'ORDEK BUTUN (278)', 'kg', 'ET'),
  ('YIY01000064', 'BILDIRCIN', 'ad', 'ET'),
  ('YIY01000086', 'TANTUNI ET', 'kg', 'ET'),
  ('YIY01000100', 'KUZU BUT TAZE', 'kg', 'ET'),
  ('YIY01000101', 'DANA KIYMALIK ET TAZE', 'kg', 'ET'),
  ('YIY01000127', 'DANA ET TAZE YAPRAK DONERLIK', 'kg', 'ET'),
  ('YIY01000134', 'ET FAJITA INCE', 'kg', 'ET'),
  ('YIY01000135', 'DANA TORNADA', 'kg', 'ET'),
  ('YIY01000180', 'HINDI BEYTI SADE (SISTE)', 'kg', 'ET'),
  ('YIY01000187', 'PILIC PIRZOLA DERISIZ (262)', 'kg', 'ET'),
  ('YIY01000188', 'PILIC KELEBEK (261)', 'kg', 'ET'),
  ('YIY01000214', 'PILIC KUSBASI ET', 'kg', 'ET'),
  ('YIY01000215', 'DANA GERDAN SOKLU', 'kg', 'ET'),
  ('YIY01000216', 'DANA KUSBASI', 'kg', 'ET'),
  ('YIY01000224', 'KUZU LOKUM', 'kg', 'ET'),
  ('YIY02000001', 'MEZGIT FILETO BLOK (150)', 'kg', 'BALIK'),
  ('YIY02000002', 'PALAMUT FILETO DERILI (191)', 'kg', 'BALIK'),
  ('YIY02000004', 'PANGA FILETO (152)', 'kg', 'BALIK'),
  ('YIY02000005', 'LEVREK FILETO (199)', 'kg', 'BALIK'),
  ('YIY02000006', 'KEFAL FILETO (153)', 'kg', 'BALIK'),
  ('YIY02000007', 'SOMON FILETO (190)', 'kg', 'BALIK'),
  ('YIY02000008', 'ALABALIK FILETO (157)', 'kg', 'BALIK'),
  ('YIY02000009', 'CUPRA FILETO (200)', 'kg', 'BALIK'),
  ('YIY02000010', 'ALABALIK PORSIYONLUK TAZE 200-', 'ad', 'BALIK'),
  ('YIY02000011', 'ALABALIK PORSIYONLUK SOKLU-200', 'ad', 'BALIK'),
  ('YIY02000017', 'PALAMUT FILETO (185)', 'kg', 'BALIK'),
  ('YIY02000018', 'SOMON STEAK DILIMLI-186(120-22)', 'kg', 'BALIK'),
  ('YIY02000019', 'STEAK ANAC ALABALIK (195)', 'kg', 'BALIK'),
  ('YIY02000027', 'SOMON FUME DILIMLI VAKUML 143', 'kg', 'BALIK'),
  ('YIY02000032', 'STEK KILIC BALIGI DILIMLI 198', 'kg', 'BALIK'),
  ('YIY02000072', 'BARBUN TAVALIK', 'kg', 'BALIK'),
  ('YIY02000073', 'SOMON FILETO KARADENIZ (TIROIL)', 'kg', 'BALIK'),
  ('YIY02000075', 'SOMON STEAK KARADENIZ', 'kg', 'BALIK'),
  ('YIY02000081', 'TARAK ETI SCALLOPS 192', 'kg', 'BALIK')
on conflict (code) do nothing;
```

- [ ] **Step 4: Her iki seed dosyasını Supabase SQL Editor'de sırayla çalıştır**

Expected: `INSERT 0 62` (companies) ve `INSERT 0 63` (products) benzeri sonuç mesajları.

- [ ] **Step 5: Table Editor'de doğrula**

Table Editor → `companies` → satır sayısı 62. Table Editor → `products` → satır sayısı 63, `category` sütununda sadece `ET`/`BALIK` değerleri var.

- [ ] **Step 6: Commit**

```bash
git add scripts/xlsx_to_seed.py supabase/seed/seed_companies.sql supabase/seed/seed_products.sql
git commit -m "feat: firma ve ürün seed verisini ekle"
```

---

### Task 6: Auth Modülü ve Login Ekranı

**Files:**
- Create: `src/lib/auth.js`
- Create: `src/pages/login.js`
- Modify: `src/main.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Consumes: `supabase` (Task 2).
- Produces: `signIn(email, password)`, `signOut()`, `getCurrentProfile()`, `onAuthStateChange(callback)` — Plan 2, 3, 4'teki tüm sayfalar oturum/rol bilgisini bu API üzerinden okur.

- [ ] **Step 1: `tests/auth.test.js` — başarısız testi yaz (saf mantık: rol kontrolü yardımcı fonksiyonu)**

```javascript
import { describe, it, expect } from 'vitest';
import { hasRole } from '../src/lib/auth.js';

describe('hasRole', () => {
  it('profil rolü eşleşince true döner', () => {
    expect(hasRole({ role: 'kalite_ekibi' }, 'kalite_ekibi')).toBe(true);
  });

  it('profil rolü eşleşmeyince false döner', () => {
    expect(hasRole({ role: 'depo_yonetici' }, 'kalite_ekibi')).toBe(false);
  });

  it('profil null ise false döner', () => {
    expect(hasRole(null, 'kalite_ekibi')).toBe(false);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `hasRole` tanımlı değil / import hatası.

- [ ] **Step 3: `src/lib/auth.js` yaz**

```javascript
import { supabase } from './supabase.js';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', session.user.id)
    .single();
  if (error) throw error;
  return data;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

export function hasRole(profile, role) {
  return !!profile && profile.role === role;
}
```

- [ ] **Step 4: Testi tekrar çalıştır**

Run: `npm run test`
Expected: PASS (3/3).

- [ ] **Step 5: `src/pages/login.js` yaz**

**Not (kullanıcı talebiyle güncellendi):** Depo personelinin tamamında e-posta adresi olmayabileceğinden giriş ekranı e-posta yerine **kullanıcı adı** ister. Supabase Auth yerleşik olarak e-posta tabanlı çalıştığından, kullanıcı adı arka planda sabit bir iç alan adı (`@malkabul.local`) eklenerek sahte-ama-geçerli-formatlı bir e-postaya çevrilir ve `signIn()`'e öyle gönderilir — gerçekten mail gönderilmez, sadece Supabase'in email-formatı validasyonunu karşılamak için kullanılır. Yeni personel hesabı açılırken (Supabase Dashboard → Authentication → Users → Add user) "Email" alanına `kullaniciadi@malkabul.local` yazılmalı ve **Auto Confirm User** seçeneği işaretlenmeli (bu adres gerçek olmadığından onay maili asla ulaşmaz).

```javascript
import { signIn } from '../lib/auth.js';

const EMAIL_DOMAIN = '@malkabul.local';

export function renderLogin(container, onSuccess) {
  container.innerHTML = `
    <form id="login-form" style="max-width:320px;margin:4rem auto;display:flex;flex-direction:column;gap:0.75rem;">
      <h1>Mal Kabul Formu</h1>
      <input type="text" id="login-username" placeholder="Kullanıcı Adı" required autocomplete="username" />
      <input type="password" id="login-password" placeholder="Şifre" required autocomplete="current-password" />
      <button type="submit">Giriş Yap</button>
      <p id="login-error" style="color:#b00020;"></p>
    </form>
  `;

  container.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = container.querySelector('#login-username').value.trim().toLowerCase();
    const password = container.querySelector('#login-password').value;
    const errorEl = container.querySelector('#login-error');
    errorEl.textContent = '';
    try {
      await signIn(username + EMAIL_DOMAIN, password);
      onSuccess();
    } catch (err) {
      errorEl.textContent = 'Giriş başarısız: ' + err.message;
    }
  });
}
```

- [ ] **Step 5b: `src/lib/html.js` yaz — paylaşılan HTML escape yardımcı fonksiyonu**

Veritabanından gelen serbest metinler (firma adı, ürün adı, kullanıcı tam adı gibi) `innerHTML` içine yazılırken kaçışsız enjeksiyona (stored XSS) karşı bu yardımcı ile kaçışlanmalı — Plan 2/3/4'teki tüm listeleme sayfaları da bunu kullanacak:

**Not (final review'da güncellendi):** DOM tabanlı ilk taslak (`document.createElement`) hem tırnak karakterlerini kaçışlamıyordu hem de vitest'in varsayılan Node ortamında (jsdom olmadan) `document` tanımsız olduğu için testler çöküyordu. Bağımlılıksız, regex tabanlı şu sürüm kullanılmalı:

```javascript
const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}
```

- [ ] **Step 6: `src/main.js` içini güncelle — oturum durumuna göre login veya karşılama ekranı göster**

```javascript
import { getCurrentProfile, onAuthStateChange, signOut } from './lib/auth.js';
import { renderLogin } from './pages/login.js';
import { escapeHtml } from './lib/html.js';

const app = document.querySelector('#app');

async function renderApp() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      renderLogin(app, renderApp);
      return;
    }
    app.innerHTML = `
      <header style="display:flex;justify-content:space-between;padding:1rem;background:#1e3a5f;color:white;">
        <span>${escapeHtml(profile.full_name)} (${escapeHtml(profile.role)})</span>
        <button id="logout-btn">Çıkış</button>
      </header>
      <main style="padding:1rem;">Ana sayfa — sonraki planlarda doldurulacak.</main>
    `;
    app.querySelector('#logout-btn').addEventListener('click', async () => {
      await signOut();
      renderApp();
    });
  } catch (err) {
    app.innerHTML = `<p style="color:#b00020;padding:1rem;">Bir hata oluştu: ${escapeHtml(err.message)}</p>`;
  }
}

onAuthStateChange(() => renderApp());
renderApp();
```

- [ ] **Step 7: Tarayıcıda uçtan uca doğrula**

Run: `npm run dev`, tarayıcıda aç.
Expected: Login formu görünür. Task 4'te Dashboard'dan oluşturduğun test kullanıcısıyla giriş yap → üst barda "isim (depo_yonetici)" ve "Çıkış" butonu görünür. Çıkış'a tıkla → login formuna geri döner.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth.js src/pages/login.js src/main.js tests/auth.test.js
git commit -m "feat: Supabase Auth ile login/logout ve rol kontrolü ekle"
```

---

### Task 7: Final Review Bulgularının Düzeltilmesi (Güvenlik Sıkılaştırma + Test Bağımsızlığı)

Bu görev, Task 1-6 tamamlandıktan sonra yapılan bütün-plan (final) code review'da bulunan Critical/Important bulguları kapatır.

**Files:**
- Create: `supabase/migrations/0004_receipt_items_ve_receipts_sikilastirma.sql`
- Create: `src/lib/role.js`
- Modify: `src/lib/auth.js`
- Modify: `src/main.js`
- Modify: `tests/auth.test.js`

**Interfaces:**
- Consumes: Task 3/4'teki tablolar ve politikalar.
- Produces: `hasRole` artık `src/lib/role.js`'ten export edilir (Supabase client'ı import etmez); `src/lib/auth.js` geriye dönük uyumluluk için onu re-export eder, böylece Plan 2/3'teki mevcut `import { hasRole } from '../lib/auth.js'` satırları değişmeden çalışmaya devam eder.

- [ ] **Step 1: `supabase/migrations/0004_receipt_items_ve_receipts_sikilastirma.sql` yaz**

```sql
-- 0004_receipt_items_ve_receipts_sikilastirma.sql

-- C1: receipt_items_update_flow'da with check eksikti; bu da receipt_items_insert_manager'ın
-- "uygunluk = beklemede" zorunluluğunu bir sonraki UPDATE ile tamamen etkisiz kılıyordu.
drop policy if exists "receipt_items_update_flow" on receipt_items;
create policy "receipt_items_update_flow" on receipt_items for update to authenticated
  using (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and (
        (r.status = 'taslak' and r.received_by = auth.uid() and p.role = 'depo_yonetici')
        or (r.status = 'kalite_bekliyor' and p.role = 'kalite_ekibi')
      )
    )
  )
  with check (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and (
        (r.status = 'taslak' and r.received_by = auth.uid() and p.role = 'depo_yonetici' and uygunluk = 'beklemede')
        or (r.status = 'kalite_bekliyor' and p.role = 'kalite_ekibi' and uygunluk in ('uygun', 'uygun_degil', 'beklemede'))
      )
    )
  );

-- I1: quality_by sahtelenebiliyordu ve depo_yonetici, oluşturma sırasında quality_by/quality_note'u
-- önceden doldurabiliyordu.
drop policy if exists "receipts_insert_manager" on receipts;
create policy "receipts_insert_manager" on receipts for insert to authenticated
  with check (
    received_by = auth.uid()
    and status = 'taslak'
    and quality_by is null
    and quality_note is null
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici')
  );

drop policy if exists "receipts_update_manager_draft" on receipts;
create policy "receipts_update_manager_draft" on receipts for update to authenticated
  using (
    (status = 'taslak' and received_by = auth.uid()
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'))
    or
    (status = 'kalite_bekliyor'
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'kalite_ekibi'))
  )
  with check (
    (received_by = auth.uid() and status in ('taslak', 'kalite_bekliyor') and quality_by is null
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'))
    or
    (status in ('kalite_bekliyor', 'onaylandi', 'reddedildi') and quality_by = auth.uid()
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'kalite_ekibi'))
  );

-- I1 (devamı): temel alanlar oluşturulduktan sonra hiçbir rol tarafından değiştirilemez.
-- RLS with check tek başına eski/yeni satırı karşılaştıramadığından bir trigger gerekir.
create or replace function public.lock_receipt_core_fields()
returns trigger
language plpgsql
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

drop trigger if exists lock_receipt_core_fields_trigger on receipts;
create trigger lock_receipt_core_fields_trigger
  before update on receipts
  for each row execute procedure public.lock_receipt_core_fields();

-- I4: updated_at hiçbir zaman güncellenmiyordu.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_receipts_updated_at on receipts;
create trigger set_receipts_updated_at
  before update on receipts
  for each row execute procedure public.set_updated_at();

-- I3: receipt_items'ta idempotency anahtarı yoktu; Plan 5'in çevrimdışı senkron kuyruğu aynı
-- receipt_id + line_no ile tekrar denendiğinde (receipts.client_uuid çakışması "zaten senkronize"
-- sayılıp items insert'i hiç yapılmadan dönüyordu) satırların sessizce kaybolmasına yol açıyordu.
alter table receipt_items add constraint receipt_items_receipt_line_unique unique (receipt_id, line_no);
```

- [ ] **Step 2: Migration'ı Supabase SQL Editor'de çalıştır (manuel)**

Expected: Hata yok. `receipt_items_update_flow` ve `receipts_update_manager_draft`/`receipts_insert_manager` politikaları güncellenmiş görünür (Database → Policies).

- [ ] **Step 3: Supabase Dashboard'da self-servis kaydı kapat (manuel, KRİTİK)**

Authentication → Sign In / Providers → Email → **"Allow new users to sign up"** seçeneğini kapat.
Expected: Kapatıldıktan sonra `supabase.auth.signUp()` ile yeni hesap oluşturma denemesi hata döner; hesaplar artık sadece Dashboard → Authentication → Users → Add user ile açılabilir.

- [ ] **Step 4: `src/lib/role.js` oluştur (client'tan bağımsız saf fonksiyon)**

```javascript
export function hasRole(profile, role) {
  return !!profile && profile.role === role;
}
```

- [ ] **Step 5: `src/lib/auth.js`'i güncelle — `hasRole`'u client'tan bağımsız modülden re-export et**

`src/lib/auth.js` içindeki yerel `hasRole` tanımını kaldır, dosyanın en üstüne ekle:

```javascript
export { hasRole } from './role.js';
```

(Diğer tüm export'lar — `signIn`, `signOut`, `getCurrentProfile`, `onAuthStateChange` — değişmeden kalır.)

- [ ] **Step 6: `tests/auth.test.js`'teki `hasRole` testini `role.js`'ten import edecek şekilde güncelle**

```javascript
import { hasRole } from '../src/lib/role.js';
```

(Bu satır, `../src/lib/auth.js`'ten import eden eski satırın yerine geçer — böylece bu test dosyası artık `src/lib/supabase.js`'i hiç yüklemez ve `.env.local` olmadan da çalışır.)

- [ ] **Step 7: Testi `.env.local` olmadan da çalıştığını doğrula**

Run: `npm run test`
Expected: PASS (tüm testler, `hasRole` dahil). Ayrıca (isteğe bağlı doğrulama): `.env.local`'i geçici olarak başka bir isme taşıyıp `npm run test -- tests/auth.test.js tests/role.test.js` çalıştırıldığında da PASS olması beklenir (artık `src/lib/supabase.js` import edilmediği için); test bitince dosyayı eski adına geri taşı.

- [ ] **Step 8: `src/main.js`'teki hata mesajını `escapeHtml` ile kaçışla (final review'da planla kod arasında tutarsızlık bulundu)**

`renderApp()` içindeki catch bloğunu şuna güncelle:

```javascript
  } catch (err) {
    app.innerHTML = `<p style="color:#b00020;padding:1rem;">Bir hata oluştu: ${escapeHtml(err.message)}</p>`;
  }
```

(`escapeHtml` zaten dosyanın başında import edilmiş durumda — sadece bu satırdaki `${err.message}` ifadesini `${escapeHtml(err.message)}` yap.)

- [ ] **Step 9: Tüm testleri ve build'i çalıştır**

Run: `npm run test && npm run build`
Expected: Tümü yeşil/temiz.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0004_receipt_items_ve_receipts_sikilastirma.sql src/lib/role.js src/lib/auth.js src/main.js tests/auth.test.js
git commit -m "fix: final review bulgularını kapat - RLS sıkılaştırma, updated_at trigger, idempotency, test bağımsızlığı, err.message escaping"
```

---

## Bu Plan Tamamlandığında Doğrulanacaklar

- `npm run dev` ile uygulama açılır, login çalışır, çıkış çalışır.
- `npm run test` yeşil, `.env.local` olmadan da `hasRole` testi çalışır.
- Supabase Table Editor'de 5 tablo, RLS aktif, 62 firma + 63 ürün seed edilmiş.
- `0004` migration'ı canlı Supabase'e uygulanmış, self-servis kayıt Dashboard'dan kapatılmış.
- Bir sonraki plan (`2026-08-26-firma-urun-yonetimi.md`) bu tablolara ve `src/lib/auth.js` API'sine güvenerek devam edebilir.
