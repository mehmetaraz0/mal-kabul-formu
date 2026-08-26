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
create policy "profiles_update_own" on profiles for update to authenticated using (id = auth.uid());

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
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici')
  );
-- depo_yonetici taslak durumundaki kendi kaydını güncelleyebilir; kalite_ekibi kalite_bekliyor durumundaki her kaydı güncelleyebilir
create policy "receipts_update_manager_draft" on receipts for update to authenticated
  using (
    (status = 'taslak' and received_by = auth.uid()
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'))
    or
    (status = 'kalite_bekliyor'
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'kalite_ekibi'))
  );

-- receipt_items: receipts ile aynı erişim kuralına bağlı (join üzerinden)
create policy "receipt_items_select_all" on receipt_items for select to authenticated using (true);
create policy "receipt_items_insert_manager" on receipt_items for insert to authenticated
  with check (
    exists (
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
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'depo_yonetici');
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
  await supabase.auth.signOut();
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

```javascript
import { signIn } from '../lib/auth.js';

export function renderLogin(container, onSuccess) {
  container.innerHTML = `
    <form id="login-form" style="max-width:320px;margin:4rem auto;display:flex;flex-direction:column;gap:0.75rem;">
      <h1>Mal Kabul Formu</h1>
      <input type="email" id="login-email" placeholder="E-posta" required />
      <input type="password" id="login-password" placeholder="Şifre" required />
      <button type="submit">Giriş Yap</button>
      <p id="login-error" style="color:#b00020;"></p>
    </form>
  `;

  container.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = container.querySelector('#login-email').value.trim();
    const password = container.querySelector('#login-password').value;
    const errorEl = container.querySelector('#login-error');
    errorEl.textContent = '';
    try {
      await signIn(email, password);
      onSuccess();
    } catch (err) {
      errorEl.textContent = 'Giriş başarısız: ' + err.message;
    }
  });
}
```

- [ ] **Step 6: `src/main.js` içini güncelle — oturum durumuna göre login veya karşılama ekranı göster**

```javascript
import { getCurrentProfile, onAuthStateChange, signOut } from './lib/auth.js';
import { renderLogin } from './pages/login.js';

const app = document.querySelector('#app');

async function renderApp() {
  const profile = await getCurrentProfile();
  if (!profile) {
    renderLogin(app, renderApp);
    return;
  }
  app.innerHTML = `
    <header style="display:flex;justify-content:space-between;padding:1rem;background:#1e3a5f;color:white;">
      <span>${profile.full_name} (${profile.role})</span>
      <button id="logout-btn">Çıkış</button>
    </header>
    <main style="padding:1rem;">Ana sayfa — sonraki planlarda doldurulacak.</main>
  `;
  app.querySelector('#logout-btn').addEventListener('click', async () => {
    await signOut();
    renderApp();
  });
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

## Bu Plan Tamamlandığında Doğrulanacaklar

- `npm run dev` ile uygulama açılır, login çalışır, çıkış çalışır.
- `npm run test` yeşil.
- Supabase Table Editor'de 5 tablo, RLS aktif, 62 firma + 63 ürün seed edilmiş.
- Bir sonraki plan (`2026-08-26-firma-urun-yonetimi.md`) bu tablolara ve `src/lib/auth.js` API'sine güvenerek devam edebilir.
