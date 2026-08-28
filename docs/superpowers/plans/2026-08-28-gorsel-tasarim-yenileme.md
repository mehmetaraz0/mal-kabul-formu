# Görsel Tasarım Yenileme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mal Kabul Formu uygulamasının tüm ekranlarını (Login, nav kabuğu, Firmalar, Ürünler, Yeni Mal Kabul, Kalite Onayı, Kayıt Ara), kullanıcının referans gösterdiği ERP ekranındaki tasarım diline (kart tabanlı bölümler, hap şeklinde sekmeler, büyük harf etiketler, renkli durum rozetleri) uygun hale getirmek.

**Architecture:** `src/style.css`'e CSS custom property token'ları ve paylaşılan bileşen sınıfları (`.card`, `.badge`, `.pill-tab`, `.status-box`, `.field` vb.) eklenir; her sayfa dosyasındaki mevcut inline `style="..."` blokları bu sınıflarla değiştirilir. Hiçbir JS mantığı, `id` seçicisi, `escapeHtml()` kullanımı veya veri akışı değişmez — sadece markup/CSS.

**Tech Stack:** Vanilla CSS (framework yok), mevcut vanilla JS sayfa yapısı. Yeni bağımlılık yok.

## Global Constraints

- **Davranış değişmez.** Var olan `id` değerleri (`#firma-msg`, `#kabul-tarih`, `#firma-search`, `#login-error` vb.) ve JS'in `querySelector` ile aradığı yapı korunur — bunlar hem uygulama mantığının hem de `tests/*.test.js`'in üzerine kurulu.
- **`escapeHtml()` kuralı korunur:** DB/form kaynaklı hiçbir string, `escapeHtml()`'siz `innerHTML`'e yazılamaz (bu proje boyunca tekrar tekrar bulunan gerçek bir XSS sınıfı — bkz. Plan 1-4 Global Constraints).
- **Kapsam dışı:** `src/pages/mal-kabul-ciktisi.js`'nin `.print-page` içeriği ve `src/lib/mal-kabul-excel.js` — gerçek kağıt "MAL KABUL FORMU" (F.22) şablonuna Plan 4'te birebir uydurulmuş, bu plan onlara dokunmaz. Sadece `mal-kabul-ciktisi.js`'nin ekran-üstü `.no-print` kontrol butonları yeni buton sınıflarını alır.
- Her görev sonunda `npm run test` **mevcut haliyle, değişmeden** yeşil kalmalı (yeni test gerekmiyor). Her görev sonunda `npm run build` başarılı olmalı ve ilgili sayfa gerçek tarayıcıda (`npm run dev`, `test`/`1234567890` veya `kalite`/`123456` hesabıyla) görsel olarak doğrulanmalı.
- Renk paleti (spec'ten, `docs/superpowers/specs/2026-08-28-gorsel-tasarim-yenileme-design.md`): birincil `#1e3a5f` (mevcut lacivert korunur), vurgu `#d9822b` (turuncu, "Ekle" butonları), başarı `#1f8a4c`/`#e6f4ea`, hata `#b00020`/`#fbe9ea`, uyarı `#a15c00`/`#fff4e5`, sayfa zemini `#f4f5f7`, kart zemini `#ffffff`, kenarlık `#e2e5ea`.

---

## Dosya Yapısı

```
src/
  style.css                   # (genişletilir) token'lar + paylaşılan bileşen sınıfları
  main.js                       # (değiştirilir) nav kabuğu kart/hap stiline geçer, aktif rota vurgusu
  pages/
    login.js                     # (değiştirilir) kart içine alınır
    firmalar.js                   # (değiştirilir) kart bölümleri
    urunler.js                     # (değiştirilir) kart bölümleri
    yeni-kabul.js                   # (değiştirilir) en büyük görev — Teslimat/Ürünler kartları, status-box
    kalite-onay.js                   # (değiştirilir) liste + detay kart stiline geçer
    arama.js                          # (değiştirilir) filtre kartı + rozet renkli durum sütunu
    mal-kabul-ciktisi.js               # (değiştirilir, sadece .no-print kontrolleri)
  components/
    search-list.js                     # (değiştirilir) satır hover'ı class'a taşınır
    offline-banner.js                    # (değiştirilir) hardcoded renkler token'lara geçer
```

---

### Task 1: Tasarım Token'ları + Uygulama Kabuğu (Nav)

**Files:**
- Modify: `src/style.css`
- Modify: `src/main.js`

**Interfaces:**
- Produces: `.card`, `.card-header`, `.card-header-title`, `.badge` (+ `-neutral`/`-success`/`-danger`/`-warning` varyantları), `.field`, `.field-grid`, `.status-box` (+ `.checked`), `.pill-tab` (+ `.active`), `button.btn-accent`/`.btn-danger`/`.btn-success`/`.btn-ghost` CSS sınıfları — Task 2-7 bunları kullanır.

- [ ] **Step 1: `src/style.css`'i tamamen yeniden yaz**

```css
:root {
  --color-primary: #1e3a5f;
  --color-primary-hover: #16293f;
  --color-accent: #d9822b;
  --color-accent-hover: #bf6f1e;
  --color-success-bg: #e6f4ea;
  --color-success-border: #a8d5b5;
  --color-success-text: #1f8a4c;
  --color-danger-bg: #fbe9ea;
  --color-danger-border: #f0b4b8;
  --color-danger-text: #b00020;
  --color-warning-bg: #fff4e5;
  --color-warning-border: #f0c987;
  --color-warning-text: #a15c00;
  --color-page-bg: #f4f5f7;
  --color-card-bg: #ffffff;
  --color-border: #e2e5ea;
  --color-input-border: #d7dbe0;
  --color-label: #6b7280;
  --color-text: #1a1a1a;
  --radius-card: 12px;
  --radius-input: 8px;
  --radius-pill: 999px;
  --shadow-card: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, "Segoe UI", Arial, sans-serif;
  background: var(--color-page-bg);
  color: var(--color-text);
}

#app { min-height: 100vh; display: flex; flex-direction: column; }

h1, h2, h3 { margin: 0 0 0.75rem; }

button {
  font-size: 1rem;
  padding: 0.6rem 1.1rem;
  border-radius: var(--radius-input);
  border: none;
  background: var(--color-primary);
  color: white;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.15s ease;
}
button:hover { background: var(--color-primary-hover); }
button:disabled { opacity: 0.6; cursor: not-allowed; }

button.btn-accent { background: var(--color-accent); }
button.btn-accent:hover { background: var(--color-accent-hover); }

button.btn-danger { background: var(--color-danger-text); }
button.btn-danger:hover { background: #8f0018; }

button.btn-success { background: var(--color-success-text); }
button.btn-success:hover { background: #17703c; }

button.btn-ghost {
  background: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-input-border);
}
button.btn-ghost:hover { background: #f0f2f5; }

input, select {
  font-size: 1rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--color-input-border);
  border-radius: var(--radius-input);
  width: 100%;
  background: white;
  color: var(--color-text);
}
input:focus, select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.12);
}

.field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.9rem; }
.field-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-label);
}
.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 1.5rem;
}
@media (max-width: 640px) {
  .field-grid { grid-template-columns: 1fr; }
}

.card {
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}
.card-header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.05rem;
  font-weight: 700;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.7rem;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}
.badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
.badge-neutral { background: #eef0f3; color: #4b5563; }
.badge-success { background: var(--color-success-bg); color: var(--color-success-text); border: 1px solid var(--color-success-border); }
.badge-danger { background: var(--color-danger-bg); color: var(--color-danger-text); border: 1px solid var(--color-danger-border); }
.badge-warning { background: var(--color-warning-bg); color: var(--color-warning-text); border: 1px solid var(--color-warning-border); }

.status-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--color-input-border);
  border-radius: var(--radius-input);
  background: white;
}
.status-box select { border: none; padding: 0; background: transparent; font-weight: 600; }
.status-box select:focus { box-shadow: none; }
.status-box[data-value="true"] {
  background: var(--color-success-bg);
  border-color: var(--color-success-border);
}
.status-box[data-value="false"] {
  background: var(--color-danger-bg);
  border-color: var(--color-danger-border);
}

.app-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1.25rem;
  background: var(--color-card-bg);
  border-bottom: 1px solid var(--color-border);
}
.app-topbar-title { font-weight: 700; }
.app-topbar-user { color: var(--color-label); font-size: 0.9rem; margin-right: 0.75rem; }

.app-subnav {
  display: flex;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  background: var(--color-page-bg);
  flex-wrap: wrap;
}
.pill-tab {
  background: white;
  color: var(--color-text);
  border: 1px solid var(--color-input-border);
  border-radius: var(--radius-pill);
  padding: 0.5rem 1rem;
  font-weight: 600;
}
.pill-tab:hover { background: #f0f2f5; }
.pill-tab.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.search-results li:hover { background: #f7f8fa; }

table.card-table {
  width: 100%;
  border-collapse: collapse;
}
table.card-table th {
  text-align: left;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-label);
  padding: 0.5rem 0.6rem;
  border-bottom: 2px solid var(--color-border);
}
table.card-table td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
}

@media (min-width: 768px) {
  #app { max-width: 1080px; margin: 0 auto; width: 100%; }
}
```

- [ ] **Step 2: `src/main.js`'teki `renderApp` fonksiyonunun `app.innerHTML` bloğunu güncelle**

Mevcut `header`/`nav` bloğunu bul (satır ~110-124'e denk gelir) ve şununla değiştir — `data-nav` öznitelikleri ve buton sayısı/rota kuralları aynen korunur, sadece class'lar eklenir:

```javascript
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
        <button class="pill-tab" data-nav="/firmalar">Firmalar</button>
        <button class="pill-tab" data-nav="/urunler">Ürünler</button>
        ${profile.role === 'depo_yonetici' ? '<button class="pill-tab" data-nav="/yeni-kabul">Yeni Mal Kabul</button>' : ''}
        ${profile.role === 'kalite_ekibi' ? '<button class="pill-tab" data-nav="/kalite-onay">Kalite Onayı</button>' : ''}
        <button class="pill-tab" data-nav="/arama">Kayıt Ara</button>
      </nav>
      <main id="page-content" style="padding:1.25rem;"></main>
    `;
```

- [ ] **Step 3: Aktif rota vurgusu için `updateActiveNav` fonksiyonunu ekle**

`src/main.js`'in en üstüne, `const app = document.querySelector('#app');` satırının hemen altına ekle:

```javascript
// Aktif nav pill'ini `location.hash`e göre işaretler. Modül seviyesinde TEK bir fonksiyon
// referansı olduğu için `window.addEventListener('hashchange', updateActiveNav)` her
// renderApp() çağrısında tekrar eklense bile tarayıcı aynı referansı dedup eder (router.js'in
// kendi hashchange dinleyicisiyle aynı, kanıtlanmış desen) — biriken dinleyici riski yok.
function updateActiveNav() {
  const current = window.location.hash.slice(1) || '/';
  app.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === current);
  });
}
window.addEventListener('hashchange', updateActiveNav);
```

`renderApp()` içinde, `startRouter(pageContent);` satırından hemen sonra çağır:

```javascript
    startRouter(pageContent);
    updateActiveNav();
```

- [ ] **Step 4: Ana sayfa kısayolunun butonunu stille**

`registerRoute('/', ...)` içindeki `c.innerHTML` satırını güncelle:

```javascript
      c.innerHTML = '<p><button class="btn-accent" data-nav="/yeni-kabul">+ Yeni Mal Kabul</button></p>';
```

- [ ] **Step 5: Testleri çalıştır (değişmeden geçmeli)**

Run: `npm run test`
Expected: PASS, mevcut test sayısı değişmez (bu görev hiçbir `id` veya test edilen davranışı değiştirmiyor).

- [ ] **Step 6: Build al**

Run: `npm run build`
Expected: Hatasız biter.

- [ ] **Step 7: Tarayıcıda doğrula**

`npm run dev`, `test`/`1234567890` ile giriş yap.
Expected: Üstte beyaz bir üst çubuk (başlık solda, kullanıcı+Çıkış sağda), altında açık gri zeminde hap şeklinde nav butonları görünür. "Firmalar"a tıklayınca o pill koyu lacivert dolgulu (aktif) olur, diğerleri beyaz kalır. Ana sayfadaki "+ Yeni Mal Kabul" turuncu.

- [ ] **Step 8: Commit**

```bash
git add src/style.css src/main.js
git commit -m "feat(tasarim): token sistemi ve kart/hap tabanlı nav kabuğu"
```

---

### Task 2: Login Ekranı

**Files:**
- Modify: `src/pages/login.js`

**Interfaces:**
- Consumes: `.card` (Task 1).

- [ ] **Step 1: `src/pages/login.js`'teki `renderLogin` fonksiyonunun `container.innerHTML` bloğunu güncelle**

```javascript
export function renderLogin(container, onSuccess) {
  container.innerHTML = `
    <form id="login-form" class="card" style="max-width:340px;margin:4rem auto;display:flex;flex-direction:column;gap:0.9rem;">
      <h1 style="text-align:center;">Mal Kabul Formu</h1>
      <input type="text" id="login-username" placeholder="Kullanıcı Adı" required autocomplete="username" />
      <input type="password" id="login-password" placeholder="Şifre" required autocomplete="current-password" />
      <button type="submit">Giriş Yap</button>
      <p id="login-error" style="color:var(--color-danger-text);margin:0;"></p>
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

(Sadece `container.innerHTML` şablonu ve `#login-error`'ın inline rengi değişti; `signIn`/event handler mantığı birebir aynı kaldı.)

- [ ] **Step 2: Testleri çalıştır**

Run: `npm run test`
Expected: PASS, değişmeden.

- [ ] **Step 3: Tarayıcıda doğrula**

`npm run dev`, çıkış yapılmış haldeyken ana sayfayı aç.
Expected: Login formu ortalanmış bir kart içinde, yuvarlak köşeli input'lar, gölgeli kart görünür.

- [ ] **Step 4: Commit**

```bash
git add src/pages/login.js
git commit -m "feat(tasarim): login ekranını kart içine al"
```

---

### Task 3: Firmalar, Ürünler ve Paylaşılan Arama Bileşeni

**Files:**
- Modify: `src/pages/firmalar.js`
- Modify: `src/pages/urunler.js`
- Modify: `src/components/search-list.js`

**Interfaces:**
- Consumes: `.card`, `.card-header`, `.card-header-title`, `button.btn-accent` (Task 1).

- [ ] **Step 1: `src/components/search-list.js`'teki `renderSearchList` şablonunu güncelle**

`ul`/`li` inline stillerini kaldır, class tabanlı hale getir (hover kuralı zaten Task 1'de `.search-results li:hover` olarak eklendi):

```javascript
export function renderSearchList(container, { items, getLabel, getKey, onSelect, placeholder }) {
  container.innerHTML = `
    <input type="text" class="search-input" placeholder="${escapeHtml(placeholder || 'Ara...')}" />
    <ul class="search-results" style="list-style:none;padding:0;margin:0.5rem 0 0;max-height:260px;overflow-y:auto;border:1px solid var(--color-border);border-radius:var(--radius-input);"></ul>
  `;
  const input = container.querySelector('.search-input');
  const list = container.querySelector('.search-results');

  function renderList(filtered) {
    list.innerHTML = filtered
      .map((item) => `<li data-key="${escapeHtml(getKey(item))}" style="padding:0.6rem 0.8rem;border-bottom:1px solid var(--color-border);cursor:pointer;">${escapeHtml(getLabel(item))}</li>`)
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

(`filterItems`, `normalize`, `escapeHtml` importu ve tüm event mantığı birebir aynı — sadece görsel çerçeve eklendi.)

- [ ] **Step 2: `src/pages/firmalar.js`'teki `container.innerHTML` ve alt bloklarını güncelle**

```javascript
export async function renderFirmalar(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">🔍 Firma Ara</div></div>
      <div id="firma-search"></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-header-title">🏢 Yeni Firma Ekle</div></div>
      <div id="firma-add"></div>
      <p id="firma-msg"></p>
    </div>
  `;
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
    <form id="firma-add-form" style="display:flex;gap:0.5rem;flex-wrap:wrap;">
      <input type="text" id="new-firma-name" placeholder="Firma adı" required style="flex:1;min-width:200px;" />
      <button type="submit" class="btn-accent">Ekle</button>
    </form>
  `;
  addBox.querySelector('#firma-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = addBox.querySelector('#new-firma-name');
    const name = input.value;
    try {
      await addCompany(name);
      input.value = '';
      await renderFirmalar(container);
      const msg = container.querySelector('#firma-msg');
      msg.style.color = 'var(--color-success-text)';
      msg.textContent = 'Firma eklendi.';
    } catch (err) {
      const msg = container.querySelector('#firma-msg');
      msg.style.color = 'var(--color-danger-text)';
      msg.textContent = err.code === '23505' ? 'Hata: Bu firma zaten kayıtlı.' : 'Hata: ' + err.message;
    }
  });

  if (!isManager) {
    // NOT: container'da artık iki `.card-header-title` var (Ara / Ekle kartları), o yüzden
    // `container.querySelector('.card-header-title')` belirsiz olurdu (ilk eşleşeni, yanlış
    // kartı hedefler). Notu container'ın en sonuna (her iki kartın da altına) ekliyoruz.
    container.insertAdjacentHTML(
      'beforeend',
      '<p style="color:var(--color-label);font-size:0.85rem;">Not: Firma düzenleme/silme yetkisi sadece depo yöneticisindedir.</p>'
    );
  }
}
```

(`addCompany`/`listCompanies`/hata kodları birebir aynı; sadece `<h2>`/`<h3>` başlıkları kart başlıklarına dönüştü ve `!isManager` notu artık container'ın sonuna ekleniyor.)

- [ ] **Step 3: `src/pages/urunler.js`'teki `container.innerHTML` ve alt bloklarını aynı desenle güncelle**

```javascript
export async function renderUrunler(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">🔍 Ürün Ara</div></div>
      <div id="urun-search"></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-header-title">📦 Yeni Ürün Ekle</div></div>
      <div id="urun-add"></div>
      <p id="urun-msg"></p>
    </div>
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
    <form id="urun-add-form" class="field-grid" style="align-items:end;">
      <div class="field"><span class="field-label">Ürün Kodu</span><input type="text" id="new-urun-code" placeholder="örn. YIY01000999" required /></div>
      <div class="field"><span class="field-label">Ürün Adı</span><input type="text" id="new-urun-name" required /></div>
      <div class="field"><span class="field-label">Birim</span>
        <select id="new-urun-unit">
          <option value="kg">kg</option>
          <option value="ad">ad</option>
        </select>
      </div>
      <div class="field"><span class="field-label">Kategori</span>
        <select id="new-urun-category">
          <option value="ET">ET</option>
          <option value="BALIK">BALIK</option>
        </select>
      </div>
      <button type="submit" class="btn-accent" style="grid-column:1 / -1;justify-self:start;">Ekle</button>
    </form>
  `;
  addBox.querySelector('#urun-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await addProduct({
        code: addBox.querySelector('#new-urun-code').value,
        name: addBox.querySelector('#new-urun-name').value,
        unit: addBox.querySelector('#new-urun-unit').value,
        category: addBox.querySelector('#new-urun-category').value
      });
      await renderUrunler(container);
      const msg = container.querySelector('#urun-msg');
      msg.style.color = 'var(--color-success-text)';
      msg.textContent = 'Ürün eklendi.';
    } catch (err) {
      const msg = container.querySelector('#urun-msg');
      msg.style.color = 'var(--color-danger-text)';
      msg.textContent = err.code === '23505' ? 'Hata: Bu ürün kodu zaten kayıtlı.' : 'Hata: ' + err.message;
    }
  });

  if (!isManager) {
    // NOT: container'da artık iki `.card-header-title` var (Ara / Ekle kartları) — bkz. firmalar.js
    // Step 2'deki aynı düzeltme. Notu container'ın en sonuna ekliyoruz.
    container.insertAdjacentHTML(
      'beforeend',
      '<p style="color:var(--color-label);font-size:0.85rem;">Not: Ürün düzenleme/silme yetkisi sadece depo yöneticisindedir.</p>'
    );
  }
}
```

- [ ] **Step 4: Testleri çalıştır**

Run: `npm run test`
Expected: PASS, değişmeden (`tests/search-list.test.js`, `tests/companies.test.js`, `tests/products.test.js` dahil — hiçbiri `id`/fonksiyon imzası değişmedi).

- [ ] **Step 5: Tarayıcıda doğrula**

`npm run dev`, Firmalar ve Ürünler sayfalarına git.
Expected: Her ikisi de iki ayrı beyaz kartta (Ara / Ekle), arama sonuçları kenarlıklı bir kutu içinde, "Ekle" butonu turuncu. Bir firma/ürün ekleyip listenin tazelendiğini doğrula.

- [ ] **Step 6: Commit**

```bash
git add src/pages/firmalar.js src/pages/urunler.js src/components/search-list.js
git commit -m "feat(tasarim): Firmalar/Ürünler kart yapısına ve paylaşılan arama listesine stil"
```

---

### Task 4: Yeni Mal Kabul Formu

**Files:**
- Modify: `src/pages/yeni-kabul.js`

**Interfaces:**
- Consumes: `.card`, `.card-header`, `.field`, `.field-grid`, `.status-box`, `table.card-table`, `button.btn-ghost` (Task 1).

- [ ] **Step 1: `container.innerHTML` şablonunu (Teslimat Bilgileri + Ürünler kartları) güncelle**

`renderYeniKabul` içindeki `container.innerHTML` atamasını şununla değiştir:

```javascript
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">📋 Teslimat Bilgileri</div></div>
      <div class="field-grid">
        <div class="field">
          <span class="field-label">Firma *</span>
          <div id="firma-picker"></div>
          <div id="firma-selected" style="font-weight:bold;margin-top:0.3rem;"></div>
        </div>
        <div class="field"><span class="field-label">Tarih *</span><input type="date" id="kabul-tarih" value="${new Date().toISOString().slice(0, 10)}" /></div>
        <div class="field"><span class="field-label">İrsaliye No</span><input type="text" id="kabul-irsaliye" /></div>
        <div class="field"><span class="field-label">Sipariş No</span><input type="text" id="kabul-siparis" /></div>
        <div class="field"><span class="field-label">Fatura No</span><input type="text" id="kabul-fatura" placeholder="Fatura No" /></div>
        <div class="field">
          <span class="field-label">Araç Hijyeni</span>
          <div class="status-box" id="arac-hijyen-box">
            <select id="kabul-arac-hijyen">
              <option value="">Araç Hijyeni —</option>
              <option value="true">Uygun</option>
              <option value="false">Uygun Değil</option>
            </select>
          </div>
        </div>
        <div class="field"><span class="field-label">Araç Sıcaklığı (°C)</span><input type="number" step="0.1" id="kabul-arac-sicaklik" placeholder="Örn: 4" /></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-header-title">📦 Ürünler</div>
      </div>
      <div id="urun-picker" style="margin-bottom:1rem;"></div>

      <div style="overflow-x:auto;">
        <table id="items-table" class="card-table">
          <thead>
            <tr><th>Ürün</th><th>Lot No</th><th>SKT</th><th>Miktar</th><th>Birim</th><th>Ürün Sıcaklığı</th><th>Yarı Ömür Geçti mi</th><th></th></tr>
          </thead>
          <tbody id="items-body"></tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button id="save-draft-btn" class="btn-ghost">Taslak Kaydet</button>
      <button id="submit-quality-btn">Kaydet ve Kalite Onayına Gönder</button>
    </div>
    <p id="kabul-msg"></p>
  `;
```

- [ ] **Step 2: Araç Hijyeni seçimine göre `.status-box`'ı renklendiren dinleyiciyi ekle**

`renderSearchList(container.querySelector('#firma-picker'), {...});` bloğunun hemen altına ekle:

```javascript
  const aracHijyenBox = container.querySelector('#arac-hijyen-box');
  container.querySelector('#kabul-arac-hijyen').addEventListener('change', (e) => {
    aracHijyenBox.dataset.value = e.target.value;
  });
```

- [ ] **Step 3: Testleri çalıştır**

Run: `npm run test`
Expected: PASS, değişmeden — `tests/yeni-kabul.test.js` dahil (o testler `#kabul-tarih`, satır ekleme/kaldırma, `save()` mantığını `id` üzerinden test ediyor, hiçbiri değişmedi; yeni eklenen `change` dinleyicisi test edilen davranışı etkilemiyor).

- [ ] **Step 4: Build al**

Run: `npm run build`
Expected: Hatasız.

- [ ] **Step 5: Tarayıcıda doğrula**

`npm run dev`, `test`/`1234567890` ile giriş yap, "Yeni Mal Kabul"a git.
Expected: "Teslimat Bilgileri" ve "Ürünler" iki ayrı kart, alanlar 2 sütunlu grid (mobilde tek sütuna düşer — tarayıcı genişliğini daraltarak doğrula). Araç Hijyeni'nde "Uygun" seçilince kutu yeşile, "Uygun Değil" seçilince kırmızıya döner. Bir firma + ürün seçip kaydet, "Taslak Kaydet" butonunun kenarlıklı/şeffaf (ghost) göründüğünü doğrula.

- [ ] **Step 6: Commit**

```bash
git add src/pages/yeni-kabul.js
git commit -m "feat(tasarim): Yeni Mal Kabul formunu kart yapısına ve durum renklerine geçir"
```

---

### Task 5: Kalite Onayı

**Files:**
- Modify: `src/pages/kalite-onay.js`

**Interfaces:**
- Consumes: `.card`, `.card-header`, `table.card-table`, `button.btn-danger`, `button.btn-success` (Task 1).

- [ ] **Step 1: `container.innerHTML` ve `fillList`'i kart yapısına geçir**

```javascript
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">✅ Kalite Onayı Bekleyen Kayıtlar</div></div>
      <p id="list-msg" style="color:var(--color-danger-text);"></p>
      <ul id="pending-list" style="list-style:none;padding:0;margin:0;"></ul>
    </div>
    <div id="detail-panel"></div>
  `;

  const list = container.querySelector('#pending-list');
  fillList(pending);

  function fillList(records) {
    if (records.length === 0) {
      list.innerHTML = '<li style="color:var(--color-label);">Bekleyen kayıt yok.</li>';
      return;
    }
    list.innerHTML = records
      .map((r) => `<li style="padding:0.6rem 0;border-bottom:1px solid var(--color-border);">
      <button data-open="${escapeHtml(r.id)}" class="btn-ghost" style="width:100%;text-align:left;">${escapeHtml(r.receipt_date)} — ${escapeHtml(r.companies.name)} (İrsaliye: ${escapeHtml(r.irsaliye_no || '-')})</button>
    </li>`)
      .join('');

    list.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const listMsg = container.querySelector('#list-msg');
        listMsg.textContent = '';
        try {
          await renderDetail(btn.dataset.open);
        } catch (err) {
          listMsg.textContent = 'Detay yüklenemedi: ' + err.message;
        }
      });
    });
  }
```

- [ ] **Step 2: `renderDetail`'in `panel.innerHTML` şablonunu kart yapısına ve renkli butonlara geçir**

```javascript
  async function renderDetail(receiptId) {
    const { receipt, items } = await getReceiptDetail(receiptId);
    const panel = container.querySelector('#detail-panel');
    panel.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-header-title">Detay — İrsaliye: ${escapeHtml(receipt.irsaliye_no || '-')} / Sipariş: ${escapeHtml(receipt.siparis_no || '-')}</div>
        </div>
        <p>Araç Hijyeni: ${receipt.arac_hijyen_uygun === null ? '-' : receipt.arac_hijyen_uygun ? 'Uygun' : 'Uygun Değil'} — Araç Sıcaklığı: ${escapeHtml(receipt.arac_sicaklik ?? '-')}°C</p>
        <div style="overflow-x:auto;">
          <table class="card-table">
            <thead><tr><th>Ürün</th><th>Lot No</th><th>SKT</th><th>Miktar</th><th>Ürün Sıcaklığı</th><th>Yarı Ömür Geçti mi</th><th>Uygunluk</th><th>Not</th></tr></thead>
            <tbody>
              ${items
                .map(
                  (item) => `
                <tr>
                  <td>${escapeHtml(item.products.code)} — ${escapeHtml(item.products.name)}</td>
                  <td>${escapeHtml(item.lot_no || '-')}</td>
                  <td>${escapeHtml(item.skt || '-')}</td>
                  <td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td>
                  <td>${escapeHtml(item.urun_sicakligi ?? '-')}</td>
                  <td>${item.yari_omur_gecti ? 'Evet' : 'Hayır'}</td>
                  <td>
                    <select data-item="${escapeHtml(item.id)}" data-field="uygunluk">
                      <option value="beklemede" ${item.uygunluk === 'beklemede' ? 'selected' : ''}>Beklemede</option>
                      <option value="uygun" ${item.uygunluk === 'uygun' ? 'selected' : ''}>Uygun</option>
                      <option value="uygun_degil" ${item.uygunluk === 'uygun_degil' ? 'selected' : ''}>Uygun Değil</option>
                    </select>
                  </td>
                  <td><input type="text" data-item="${escapeHtml(item.id)}" data-field="note" value="${escapeHtml(item.note || '')}" /></td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <div class="field" style="margin-top:1rem;"><span class="field-label">Genel Kalite Notu</span><input type="text" id="quality-note" /></div>
        <div style="margin-top:0.5rem;display:flex;gap:0.5rem;">
          <button id="approve-btn" class="btn-success">Onayla</button>
          <button id="reject-btn" class="btn-danger">Reddet</button>
        </div>
        <p id="detail-msg"></p>
      </div>
    `;
```

(Bu bloktan sonraki tüm fonksiyon gövdesi — `lastGood`, `saveItem`, `finalize`, event listener'lar — birebir aynı kalır, sadece `panel.innerHTML`'in kendisi değişti.)

- [ ] **Step 3: Testleri çalıştır**

Run: `npm run test`
Expected: PASS, değişmeden (bu sayfa için özel bir test dosyası yok — Plan 4'ün final review'unda bu bilinçli bir karar olarak not edilmişti).

- [ ] **Step 4: Tarayıcıda doğrula**

`npm run dev`, `kalite`/`123456` ile giriş yap, "Kalite Onayı"na git, bekleyen bir kayda tıkla.
Expected: Liste kart içinde, detay paneli ayrı bir kart, "Onayla" yeşil, "Reddet" kırmızı buton. Bir satırın uygunluğunu değiştirip "Kaydedildi." mesajını doğrula (davranış Task öncesiyle birebir aynı olmalı).

- [ ] **Step 5: Commit**

```bash
git add src/pages/kalite-onay.js
git commit -m "feat(tasarim): Kalite Onayı ekranını kart yapısına ve renkli aksiyon butonlarına geçir"
```

---

### Task 6: Kayıt Ara

**Files:**
- Modify: `src/pages/arama.js`

**Interfaces:**
- Consumes: `.card`, `table.card-table`, `.badge` (+ varyantları) (Task 1).

- [ ] **Step 1: Durum → rozet varyantı eşleme fonksiyonunu ve `container.innerHTML`'i güncelle**

`STATUS_LABELS` sabitinin altına ekle:

```javascript
const STATUS_BADGE_VARIANT = {
  taslak: 'neutral',
  kalite_bekliyor: 'warning',
  onaylandi: 'success',
  reddedildi: 'danger'
};
```

`renderArama` içindeki `container.innerHTML` atamasını şununla değiştir:

```javascript
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">🔍 Mal Kabul Kayıtlarında Ara</div></div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:end;">
        <div class="field" style="min-width:180px;flex:1;">
          <span class="field-label">Firma</span>
          <select id="filter-company"><option value="">Tümü</option>${companies.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}</select>
        </div>
        <div class="field" style="min-width:180px;flex:1;">
          <span class="field-label">Ürün</span>
          <select id="filter-product"><option value="">Tümü</option>${products.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.code)} — ${escapeHtml(p.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><span class="field-label">Başlangıç</span><input type="date" id="filter-start" /></div>
        <div class="field"><span class="field-label">Bitiş</span><input type="date" id="filter-end" /></div>
        <div class="field">
          <span class="field-label">Durum</span>
          <select id="filter-status">
            <option value="">Tümü</option>
            <option value="taslak">Taslak</option>
            <option value="kalite_bekliyor">Kalite Bekliyor</option>
            <option value="onaylandi">Onaylandı</option>
            <option value="reddedildi">Reddedildi</option>
          </select>
        </div>
        <button id="search-btn">Ara</button>
        <button id="export-csv-btn" class="btn-ghost">CSV İndir</button>
      </div>
    </div>
    <p id="arama-msg"></p>
    <div class="card">
      <div style="overflow-x:auto;">
        <table class="card-table">
          <thead><tr><th>Tarih</th><th>Firma</th><th>İrsaliye No</th><th>Durum</th><th></th></tr></thead>
          <tbody id="results-body"></tbody>
        </table>
      </div>
    </div>
  `;
```

- [ ] **Step 2: Sonuç satırındaki durum hücresini rozet olarak render et**

`runSearch` içindeki `tbody.innerHTML` map'ini güncelle — `<td>${escapeHtml(STATUS_LABELS[r.status] || r.status)}</td>` satırını şununla değiştir:

```javascript
            <td><span class="badge badge-${STATUS_BADGE_VARIANT[r.status] || 'neutral'}">${escapeHtml(STATUS_LABELS[r.status] || r.status)}</span></td>
```

(`escapeHtml` çağrısı `STATUS_LABELS`'ten geldiği için zaten güvenli sabit bir string üzerinde; `STATUS_BADGE_VARIANT[r.status] || 'neutral'` de sabit bir class adı üretiyor, DB'den gelen serbest metin değil — `escapeHtml` gerektirmiyor.)

- [ ] **Step 3: Testleri çalıştır**

Run: `npm run test`
Expected: PASS, değişmeden (bu sayfa için özel bir test dosyası yok, veri katmanı testleri (`tests/receipts-list.test.js`) DOM class'larını değil sorgu mantığını test ediyor).

- [ ] **Step 4: Tarayıcıda doğrula**

`npm run dev`, "Kayıt Ara"ya git, filtresiz ara.
Expected: Filtre satırı kart içinde, sonuç tablosu ayrı bir kartta, Durum sütununda renkli rozetler (Onaylandı=yeşil, Reddedildi=kırmızı, Kalite Bekliyor=turuncu/sarı, Taslak=gri) görünür.

- [ ] **Step 5: Commit**

```bash
git add src/pages/arama.js
git commit -m "feat(tasarim): Kayıt Ara filtre kartı ve renkli durum rozetleri"
```

---

### Task 7: Offline Banner ve Çıktı Ekranı Kontrolleri

**Files:**
- Modify: `src/components/offline-banner.js`
- Modify: `src/pages/mal-kabul-ciktisi.js`

**Interfaces:**
- Consumes: `button.btn-ghost`, CSS token'ları (Task 1).

- [ ] **Step 1: `src/components/offline-banner.js`'teki hardcoded renkleri token'lara çevir**

`updateBanner` içindeki şu satırı:

```javascript
  currentBannerEl.style.background = offline || stuck ? '#b00020' : '#a15c00';
```

şununla değiştir:

```javascript
  currentBannerEl.style.background = offline || stuck ? 'var(--color-danger-text)' : 'var(--color-warning-text)';
```

`renderOfflineBanner` içindeki `el.style.cssText` satırını, köşe/boşluk tutarlılığı için güncelle:

```javascript
  el.style.cssText = 'display:none;color:white;text-align:center;padding:0.5rem;font-size:0.9rem;border-radius:0;';
```

(Banner tam genişlik bir üst şerit olarak kalmalı — bilerek köşe yuvarlatılmadı; sadece diğer alanlarla aynı `padding` birimine hizalandı. Fonksiyonellik — `pickFailingEntry`, `summarizeError`, event dinleyicileri, `MAX_ERROR_CHARS` — birebir aynı.)

- [ ] **Step 2: `src/pages/mal-kabul-ciktisi.js`'teki `.no-print` kontrol butonlarına sınıf ekle**

Mevcut şu bloğu bul:

```javascript
    <div class="no-print" style="margin-bottom:1rem;display:flex;gap:0.5rem;">
      <button id="print-btn">Yazdır</button>
      <button id="pdf-btn">PDF İndir</button>
      <button id="excel-btn">Excel İndir</button>
    </div>
```

ve şununla değiştir:

```javascript
    <div class="no-print" style="margin-bottom:1rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button id="print-btn" class="btn-ghost">Yazdır</button>
      <button id="pdf-btn">PDF İndir</button>
      <button id="excel-btn" class="btn-accent">Excel İndir</button>
    </div>
```

(`#print-btn`/`#pdf-btn`/`#excel-btn` event listener'ları ve altındaki `.print-page` içeriği hiç değişmedi.)

- [ ] **Step 3: Testleri çalıştır**

Run: `npm run test`
Expected: PASS, değişmeden.

- [ ] **Step 4: Build al**

Run: `npm run build`
Expected: Hatasız.

- [ ] **Step 5: Tarayıcıda doğrula**

`npm run dev`, herhangi bir sayfada bağlantıyı kesip (DevTools → Network → Offline) banner'ın kırmızı, token renkleriyle uyumlu göründüğünü doğrula. "Kayıt Ara"dan bir kaydın "Çıktı"sını aç, üç butonun (Yazdır/PDF İndir/Excel İndir) yeni stille göründüğünü, `.print-page` içeriğinin (gerçek form çıktısı) **değişmediğini** doğrula.

- [ ] **Step 6: Commit**

```bash
git add src/components/offline-banner.js src/pages/mal-kabul-ciktisi.js
git commit -m "feat(tasarim): offline banner ve çıktı ekranı kontrol butonlarını token'lara geçir"
```

---

## Bu Plan Tamamlandığında Doğrulanacaklar

- `npm run test` bu planın başındaki sayı ile birebir aynı (yeni test eklenmedi, hiçbiri kırılmadı).
- `npm run build` başarılı.
- Her ekran (Login, nav, Firmalar, Ürünler, Yeni Mal Kabul, Kalite Onayı, Kayıt Ara) gerçek tarayıcıda `test`/`kalite` hesaplarıyla görsel olarak doğrulandı: kart tabanlı bölümler, hap şeklinde aktif nav, turuncu "Ekle" butonları, yeşil/kırmızı/sarı durum renkleri.
- `.print-page` (PDF/print çıktısı) ve Excel çıktısı görsel olarak **değişmedi** — sadece ekran-üstü kontrol butonları stillendi.
- Mobil genişlikte (`--max-width:640px` altı) form grid'leri tek sütuna düşüyor.
