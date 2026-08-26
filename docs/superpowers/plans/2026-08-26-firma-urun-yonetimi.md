# Firma ve Ürün Yönetimi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firma listesi ve ürün kataloğu için arama/listeleme/yeni kayıt ekleme ekranları kurmak; "yeni firma gelme ihtimali, yeni ürün gelme ihtimali var" gereksinimini karşılayan, rol bazlı düzenleme/silme kısıtlı bir yönetim arayüzü oluşturmak.

**Architecture:** İki benzer CRUD ekranı (`src/pages/firmalar.js`, `src/pages/urunler.js`) ve ikisinin de kullandığı ortak bir arama/filtre bileşeni (`src/components/search-list.js`). Veri katmanı `src/lib/companies.js` ve `src/lib/products.js` modüllerinde; bunlar Plan 3'teki Mal Kabul Formu'nun ürün/firma seçim kutuları tarafından da doğrudan import edilecek.

**Tech Stack:** Bu plan Plan 1'in (`2026-08-26-supabase-temel-altyapi.md`) kurduğu Vite + Supabase altyapısının üzerine inşa edilir. Ek bağımlılık yok.

## Global Constraints

- Bu plan, Plan 1'in tamamlanmış olduğunu varsayar: `src/lib/supabase.js`, `src/lib/auth.js`, `companies`/`products` tabloları ve RLS politikaları mevcut olmalı.
- Firma ve ürün **ekleme** her iki rol için de açık (Plan 1 RLS: `companies_insert_all`, `products_insert_all`).
- Firma ve ürün **düzenleme/silme** sadece `depo_yonetici` rolüne açık (Plan 1 RLS: `*_update_manager`, `*_delete_manager`). Arayüz bu kısıtı hem RLS'e güvenerek hem de buton görünürlüğünü rol bazlı gizleyerek uygular.
- Ürün kategorisi sabit iki değer: `ET`, `BALIK`. Birim sabit iki değer: `kg`, `ad`. Yeni ürün formunda bunlar serbest metin değil, `<select>` ile seçilir (veri bütünlüğü için).
- Arama, istemci tarafında (in-memory filter) yapılır — firma/ürün sayısı (62/63) küçük olduğu için sunucu taraflı sayfalama gerekmez.

---

## Dosya Yapısı

```
src/
  lib/
    companies.js       # listCompanies, addCompany
    products.js         # listProducts, addProduct
  components/
    search-list.js      # yeniden kullanılabilir arama kutusu + liste render fonksiyonu
  pages/
    firmalar.js
    urunler.js
  router.js              # basit hash-router (Task 1'de eklenir, main.js'e bağlanır)
tests/
  companies.test.js
  products.test.js
  search-list.test.js
```

---

### Task 1: Basit Hash Router Ekle

Mevcut `src/main.js` (Plan 1) tek ekran gösteriyordu; bu plandan itibaren birden fazla sayfa arasında geçiş gerekiyor.

**Files:**
- Create: `src/router.js`
- Modify: `src/main.js`
- Test: `tests/router.test.js`

**Interfaces:**
- Produces: `registerRoute(path, renderFn)`, `navigate(path)`, `startRouter(container)` — Plan 3 ve 4'teki sayfalar da bu router'a kayıt olacak.

- [ ] **Step 1: `tests/router.test.js` yaz**

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerRoute, navigate, startRouter, _resetRoutes } from '../src/router.js';

describe('router', () => {
  beforeEach(() => {
    _resetRoutes();
    window.location.hash = '';
  });

  it('kayıtlı rota render fonksiyonunu çağırır', () => {
    const container = document.createElement('div');
    const renderFn = vi.fn();
    registerRoute('/test', renderFn);
    startRouter(container);
    navigate('/test');
    expect(renderFn).toHaveBeenCalledWith(container);
  });

  it('bilinmeyen rota için varsayılan rotaya döner', () => {
    const container = document.createElement('div');
    const homeFn = vi.fn();
    registerRoute('/', homeFn);
    startRouter(container);
    navigate('/olmayan-rota');
    expect(homeFn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `router.js` bulunamadı.

- [ ] **Step 3: `src/router.js` yaz**

```javascript
const routes = new Map();
let rootContainer = null;

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

export function _resetRoutes() {
  routes.clear();
}

export function navigate(path) {
  window.location.hash = path;
}

function renderCurrent() {
  if (!rootContainer) return;
  const path = window.location.hash.slice(1) || '/';
  const renderFn = routes.get(path) || routes.get('/');
  if (renderFn) renderFn(rootContainer);
}

export function startRouter(container) {
  rootContainer = container;
  window.addEventListener('hashchange', renderCurrent);
  renderCurrent();
}
```

- [ ] **Step 4: Testi tekrar çalıştır**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: `src/main.js` içine router'ı bağla — login sonrası ana ekranda navigasyon menüsü göster**

`src/main.js` içindeki `renderApp` fonksiyonunun `main` içeriğini güncelle:

```javascript
import { getCurrentProfile, onAuthStateChange, signOut } from './lib/auth.js';
import { renderLogin } from './pages/login.js';
import { registerRoute, startRouter, navigate } from './router.js';

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
    <nav style="display:flex;gap:0.5rem;padding:0.5rem 1rem;background:#e9ecef;flex-wrap:wrap;">
      <button data-nav="/">Ana Sayfa</button>
      <button data-nav="/firmalar">Firmalar</button>
      <button data-nav="/urunler">Ürünler</button>
    </nav>
    <main id="page-content" style="padding:1rem;"></main>
  `;
  app.querySelector('#logout-btn').addEventListener('click', async () => {
    await signOut();
    renderApp();
  });
  app.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav));
  });

  const pageContent = app.querySelector('#page-content');
  registerRoute('/', (c) => { c.innerHTML = '<p>Ana sayfa — sonraki planlarda mal kabul formu buraya eklenecek.</p>'; });
  startRouter(pageContent);
}

onAuthStateChange(() => renderApp());
renderApp();
```

- [ ] **Step 6: Tarayıcıda doğrula**

Run: `npm run dev`, giriş yap.
Expected: Üstte "Ana Sayfa / Firmalar / Ürünler" menüsü görünür. "Firmalar"a tıklayınca URL `#/firmalar` olur ama henüz sayfa boş kalır (Task 2'de doldurulacak) — konsolda hata olmamalı.

- [ ] **Step 7: Commit**

```bash
git add src/router.js src/main.js tests/router.test.js
git commit -m "feat: basit hash router ve navigasyon menüsü ekle"
```

---

### Task 2: Firma Veri Katmanı ve Liste/Arama/Ekleme Sayfası

**Files:**
- Create: `src/lib/companies.js`
- Create: `src/components/search-list.js`
- Create: `src/pages/firmalar.js`
- Modify: `src/main.js` (rota kaydı)
- Test: `tests/companies.test.js`
- Test: `tests/search-list.test.js`

**Interfaces:**
- Consumes: `supabase` (Plan 1), `getCurrentProfile`/`hasRole` (Plan 1).
- Produces: `listCompanies()`, `addCompany(name)` — Plan 3'teki Mal Kabul Formu firma seçim kutusu bunları kullanır. `renderSearchList(container, options)` — Task 3'te ürün sayfası da bunu kullanır.

- [ ] **Step 1: `tests/search-list.test.js` yaz (saf mantık: filtreleme fonksiyonu)**

```javascript
import { describe, it, expect } from 'vitest';
import { filterItems } from '../src/components/search-list.js';

describe('filterItems', () => {
  const items = [
    { name: 'ANKA GRUP GIDA' },
    { name: 'BAHAR GIDA' },
    { name: 'BALHAN GRUP GIDA' }
  ];

  it('boş sorguda tüm öğeleri döner', () => {
    expect(filterItems(items, '', (i) => i.name)).toHaveLength(3);
  });

  it('büyük/küçük harf duyarsız kısmi eşleşme yapar', () => {
    const result = filterItems(items, 'grup', (i) => i.name);
    expect(result.map((r) => r.name)).toEqual(['ANKA GRUP GIDA', 'BALHAN GRUP GIDA']);
  });

  it('Türkçe karakter normalize eder (İ/I, Ğ, Ş vb. göz ardı edilir)', () => {
    const result = filterItems([{ name: 'BAHAR HINDI ENTEGRE' }], 'hındı', (i) => i.name);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `search-list.js` bulunamadı.

- [ ] **Step 3: `src/components/search-list.js` yaz**

```javascript
function normalize(str) {
  return str
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u');
}

export function filterItems(items, query, getLabel) {
  const q = normalize(query.trim());
  if (!q) return items;
  return items.filter((item) => normalize(getLabel(item)).includes(q));
}

export function renderSearchList(container, { items, getLabel, getKey, onSelect, placeholder }) {
  container.innerHTML = `
    <input type="text" class="search-input" placeholder="${placeholder || 'Ara...'}" />
    <ul class="search-results" style="list-style:none;padding:0;max-height:260px;overflow-y:auto;"></ul>
  `;
  const input = container.querySelector('.search-input');
  const list = container.querySelector('.search-results');

  function renderList(filtered) {
    list.innerHTML = filtered
      .map((item) => `<li data-key="${getKey(item)}" style="padding:0.5rem;border-bottom:1px solid #eee;cursor:pointer;">${getLabel(item)}</li>`)
      .join('');
    list.querySelectorAll('li').forEach((li) => {
      li.addEventListener('click', () => {
        const item = filtered.find((i) => String(getKey(i)) === li.dataset.key);
        onSelect(item);
      });
    });
  }

  renderList(items);
  input.addEventListener('input', () => {
    renderList(filterItems(items, input.value, getLabel));
  });
}
```

- [ ] **Step 4: `search-list` testini tekrar çalıştır**

Run: `npm run test`
Expected: PASS (3/3).

- [ ] **Step 5: `tests/companies.test.js` yaz (Supabase çağrısını mock'layarak)**

```javascript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => {
  const order = vi.fn(() => Promise.resolve({ data: [{ id: 1, name: 'TEST FIRMA', sira_no: 1 }], error: null }));
  const select = vi.fn(() => ({ order }));
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn(() => ({ select, insert }));
  return { supabase: { from } };
});

import { listCompanies, addCompany } from '../src/lib/companies.js';
import { supabase } from '../src/lib/supabase.js';

describe('companies', () => {
  it('listCompanies isim sırasına göre firmaları döner', async () => {
    const result = await listCompanies();
    expect(result).toEqual([{ id: 1, name: 'TEST FIRMA', sira_no: 1 }]);
    expect(supabase.from).toHaveBeenCalledWith('companies');
  });

  it('addCompany boş isimde hata fırlatır', async () => {
    await expect(addCompany('   ')).rejects.toThrow('Firma adı boş olamaz');
  });

  it('addCompany geçerli isimle insert çağırır', async () => {
    await addCompany('Yeni Firma');
    expect(supabase.from).toHaveBeenCalledWith('companies');
  });
});
```

- [ ] **Step 6: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `companies.js` bulunamadı.

- [ ] **Step 7: `src/lib/companies.js` yaz**

```javascript
import { supabase } from './supabase.js';

export async function listCompanies() {
  const { data, error } = await supabase.from('companies').select('id, name, sira_no').order('name');
  if (error) throw error;
  return data;
}

export async function addCompany(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Firma adı boş olamaz');
  const { error } = await supabase.from('companies').insert({ name: trimmed });
  if (error) throw error;
}
```

- [ ] **Step 8: Testi tekrar çalıştır**

Run: `npm run test`
Expected: PASS (3/3).

- [ ] **Step 9: `src/pages/firmalar.js` yaz**

```javascript
import { listCompanies, addCompany } from '../lib/companies.js';
import { renderSearchList } from '../components/search-list.js';
import { getCurrentProfile, hasRole } from '../lib/auth.js';

export async function renderFirmalar(container) {
  container.innerHTML = '<h2>Firmalar</h2><div id="firma-search"></div><div id="firma-add"></div><p id="firma-msg"></p>';
  const profile = await getCurrentProfile();
  const isManager = hasRole(profile, 'depo_yonetici');

  const companies = await listCompanies();
  renderSearchList(container.querySelector('#firma-search'), {
    items: companies,
    getLabel: (c) => `${c.sira_no ?? ''} — ${c.name}`,
    getKey: (c) => c.id,
    onSelect: () => {},
    placeholder: 'Firma ara...'
  });

  const addBox = container.querySelector('#firma-add');
  addBox.innerHTML = `
    <h3>Yeni Firma Ekle</h3>
    <form id="firma-add-form" style="display:flex;gap:0.5rem;">
      <input type="text" id="new-firma-name" placeholder="Firma adı" required />
      <button type="submit">Ekle</button>
    </form>
  `;
  addBox.querySelector('#firma-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = addBox.querySelector('#new-firma-name');
    const msg = container.querySelector('#firma-msg');
    try {
      await addCompany(input.value);
      input.value = '';
      msg.style.color = 'green';
      msg.textContent = 'Firma eklendi.';
      renderFirmalar(container);
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    }
  });

  if (!isManager) {
    container.querySelector('h2').insertAdjacentHTML(
      'afterend',
      '<p style="color:#666;font-size:0.9rem;">Not: Firma düzenleme/silme yetkisi sadece depo yöneticisindedir.</p>'
    );
  }
}
```

- [ ] **Step 10: Rotayı `src/main.js`'e kaydet**

`registerRoute('/', ...)` satırının altına ekle:

```javascript
  registerRoute('/firmalar', renderFirmalar);
```

Ve dosyanın başına import ekle:

```javascript
import { renderFirmalar } from './pages/firmalar.js';
```

- [ ] **Step 11: Tarayıcıda uçtan uca doğrula**

Run: `npm run dev`, giriş yap, "Firmalar"a tıkla.
Expected: 62 firma listelenir, arama kutusuna "grup" yazınca sadece "GRUP" geçen firmalar kalır. "Yeni Firma Ekle" formuna bir isim yazıp Ekle'ye basınca liste yenilenir ve yeni firma görünür. Supabase Table Editor'de `companies` tablosunda yeni satırı doğrula.

- [ ] **Step 12: Commit**

```bash
git add src/lib/companies.js src/components/search-list.js src/pages/firmalar.js src/main.js tests/companies.test.js tests/search-list.test.js
git commit -m "feat: firma listesi, arama ve yeni firma ekleme sayfası"
```

---

### Task 3: Ürün Veri Katmanı ve Liste/Arama/Ekleme Sayfası

**Files:**
- Create: `src/lib/products.js`
- Create: `src/pages/urunler.js`
- Modify: `src/main.js` (rota kaydı)
- Test: `tests/products.test.js`

**Interfaces:**
- Consumes: `supabase` (Plan 1), `renderSearchList`/`filterItems` (Task 2), `getCurrentProfile`/`hasRole` (Plan 1).
- Produces: `listProducts()`, `addProduct({ code, name, unit, category })` — Plan 3'teki Mal Kabul Formu ürün seçim kutusu bunları kullanır.

- [ ] **Step 1: `tests/products.test.js` yaz**

```javascript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => {
  const order = vi.fn(() => Promise.resolve({ data: [{ id: 1, code: 'YIY01000001', name: 'TEST ÜRÜN', unit: 'kg', category: 'ET' }], error: null }));
  const select = vi.fn(() => ({ order }));
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn(() => ({ select, insert }));
  return { supabase: { from } };
});

import { listProducts, addProduct } from '../src/lib/products.js';
import { supabase } from '../src/lib/supabase.js';

describe('products', () => {
  it('listProducts kategoriye göre gruplanabilir veri döner', async () => {
    const result = await listProducts();
    expect(result[0].category).toBe('ET');
    expect(supabase.from).toHaveBeenCalledWith('products');
  });

  it('addProduct geçersiz birimde hata fırlatır', async () => {
    await expect(addProduct({ code: 'X1', name: 'Ürün', unit: 'litre', category: 'ET' })).rejects.toThrow('Geçersiz birim');
  });

  it('addProduct geçersiz kategoride hata fırlatır', async () => {
    await expect(addProduct({ code: 'X1', name: 'Ürün', unit: 'kg', category: 'SEBZE' })).rejects.toThrow('Geçersiz kategori');
  });

  it('addProduct eksik kodda hata fırlatır', async () => {
    await expect(addProduct({ code: '', name: 'Ürün', unit: 'kg', category: 'ET' })).rejects.toThrow('Ürün kodu ve adı zorunlu');
  });

  it('addProduct geçerli veriyle insert çağırır', async () => {
    await addProduct({ code: 'YIY01999999', name: 'Yeni Ürün', unit: 'kg', category: 'ET' });
    expect(supabase.from).toHaveBeenCalledWith('products');
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `products.js` bulunamadı.

- [ ] **Step 3: `src/lib/products.js` yaz**

```javascript
import { supabase } from './supabase.js';

const VALID_UNITS = ['kg', 'ad'];
const VALID_CATEGORIES = ['ET', 'BALIK'];

export async function listProducts() {
  const { data, error } = await supabase.from('products').select('id, code, name, unit, category').order('category').order('name');
  if (error) throw error;
  return data;
}

export async function addProduct({ code, name, unit, category }) {
  if (!code?.trim() || !name?.trim()) throw new Error('Ürün kodu ve adı zorunlu');
  if (!VALID_UNITS.includes(unit)) throw new Error('Geçersiz birim');
  if (!VALID_CATEGORIES.includes(category)) throw new Error('Geçersiz kategori');
  const { error } = await supabase.from('products').insert({
    code: code.trim(),
    name: name.trim(),
    unit,
    category
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Testi tekrar çalıştır**

Run: `npm run test`
Expected: PASS (5/5).

- [ ] **Step 5: `src/pages/urunler.js` yaz**

```javascript
import { listProducts, addProduct } from '../lib/products.js';
import { renderSearchList } from '../components/search-list.js';
import { getCurrentProfile, hasRole } from '../lib/auth.js';

export async function renderUrunler(container) {
  container.innerHTML = `
    <h2>Ürünler</h2>
    <div id="urun-search"></div>
    <div id="urun-add"></div>
    <p id="urun-msg"></p>
  `;
  const profile = await getCurrentProfile();
  const isManager = hasRole(profile, 'depo_yonetici');

  const products = await listProducts();
  renderSearchList(container.querySelector('#urun-search'), {
    items: products,
    getLabel: (p) => `[${p.category}] ${p.code} — ${p.name} (${p.unit})`,
    getKey: (p) => p.id,
    onSelect: () => {},
    placeholder: 'Ürün ara (kod veya isim)...'
  });

  const addBox = container.querySelector('#urun-add');
  addBox.innerHTML = `
    <h3>Yeni Ürün Ekle</h3>
    <form id="urun-add-form" style="display:flex;flex-direction:column;gap:0.5rem;max-width:360px;">
      <input type="text" id="new-urun-code" placeholder="Ürün kodu (örn. YIY01000999)" required />
      <input type="text" id="new-urun-name" placeholder="Ürün adı" required />
      <select id="new-urun-unit">
        <option value="kg">kg</option>
        <option value="ad">ad</option>
      </select>
      <select id="new-urun-category">
        <option value="ET">ET</option>
        <option value="BALIK">BALIK</option>
      </select>
      <button type="submit">Ekle</button>
    </form>
  `;
  addBox.querySelector('#urun-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = container.querySelector('#urun-msg');
    try {
      await addProduct({
        code: addBox.querySelector('#new-urun-code').value,
        name: addBox.querySelector('#new-urun-name').value,
        unit: addBox.querySelector('#new-urun-unit').value,
        category: addBox.querySelector('#new-urun-category').value
      });
      msg.style.color = 'green';
      msg.textContent = 'Ürün eklendi.';
      renderUrunler(container);
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    }
  });

  if (!isManager) {
    container.querySelector('h2').insertAdjacentHTML(
      'afterend',
      '<p style="color:#666;font-size:0.9rem;">Not: Ürün düzenleme/silme yetkisi sadece depo yöneticisindedir.</p>'
    );
  }
}
```

- [ ] **Step 6: Rotayı `src/main.js`'e kaydet**

```javascript
import { renderUrunler } from './pages/urunler.js';
```

```javascript
  registerRoute('/urunler', renderUrunler);
```

- [ ] **Step 7: Tarayıcıda uçtan uca doğrula**

Run: `npm run dev`, "Ürünler"e tıkla.
Expected: 63 ürün listelenir (ET ve BALIK karışık, isme göre sıralı), "somon" araması sadece somon içeren ürünleri gösterir. Yeni ürün formu ile bir test ürünü ekle, listenin yenilendiğini gör.

- [ ] **Step 8: Commit**

```bash
git add src/lib/products.js src/pages/urunler.js src/main.js tests/products.test.js
git commit -m "feat: ürün kataloğu listesi, arama ve yeni ürün ekleme sayfası"
```

---

## Bu Plan Tamamlandığında Doğrulanacaklar

- `npm run test` yeşil (router, search-list, companies, products testleri dahil).
- Firmalar ve Ürünler sayfaları tarayıcıda çalışıyor, arama Türkçe karakter duyarsız çalışıyor.
- Yeni firma/ürün eklemek listeyi anında günceller.
- `depo_yonetici` olmayan bir kullanıcı ile girişte (Task 4'te Supabase Dashboard'dan role='kalite_ekibi' yapılmış bir test kullanıcısı ile) düzenleme/silme uyarısı görünür (bu planda silme/düzenleme UI'ı henüz yok, sadece uyarı metni; CRUD'un update/delete kısmı ihtiyaç doğarsa ayrı bir görev olarak eklenir).
- Plan 3 (`2026-08-26-mal-kabul-formu.md`) `listCompanies`, `listProducts`, `renderSearchList` fonksiyonlarını doğrudan import ederek devam edebilir.
