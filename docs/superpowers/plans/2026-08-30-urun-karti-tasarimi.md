# Yeni Mal Kabul — Ürün Kartı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yeni Mal Kabul formundaki ürün girişini, tek bir yatay tablo yerine her ürün kalemi için ayrı, dikey bir kart (kendi ürün arama popup'u, Uygun/Uygunsuz iki butonu, Kartı Sil butonu ile) gösteren bir yapıya dönüştürmek.

**Architecture:** `state.items`'in veri şekli DEĞİŞMİYOR — sadece `#urun-picker`'ın (bir önceki işte eklenen "sabit tablo") kaldırılıp yerine her kart için ayrı bir `renderSearchList` popup'ı konması, ve tablo satırlarının (`renderItemsBody`/`#items-table`) yerine dikey kartların (`renderUrunKartlari`/`#urun-kartlari`) gelmesiyle tek bir fonksiyonda birleşik bir yeniden yazım. Sayfa her zaman en az bir boş kart (`productId: null`) ile başlar; "Ürün Ekle" yeni bir boş kart daha ekler.

**Tech Stack:** Vite + vanilla JS (mevcut proje), mevcut CSS sınıfları (`.card`, `.field`, `.field-grid`, `.btn-success`, `.btn-danger`, `.btn-ghost`), Vitest.

## Global Constraints

- Tasarım belgesi: `docs/superpowers/specs/2026-08-30-urun-karti-tasarimi.md` — bu planın tüm kararları oradan gelir.
- Görsel stil bu uygulamanın MEVCUT tasarım dilini kullanır (referans ekran görüntüsünün renkleri kopyalanmıyor) — `.btn-success`/`.btn-danger`/`.card`/`.field`/`.field-grid` sınıfları.
- Ürün arama, kart içinde POPUP olarak kalır (bir önceki "sabit tablo" değişikliği bu kart için geri alınıyor).
- "Koli Bazlı Giriş" özelliği dahil edilmiyor — kapsam dışı.
- `createReceiptWithItems`'a giden payload şekli, RPC, backend hiçbir şekilde değişmiyor — sadece `src/pages/yeni-kabul.js`'in kendi iç render/etkileşim mantığı değişiyor.
- Mevcut doğrulama kuralları (miktar > 0, tarih zorunlu, Kaydet için tüm satırların Uygun/Uygunsuz işaretlenmiş olması) DEĞİŞMEDEN kalır — sadece "ürün seçilmemiş kart" için YENİ bir kontrol eklenir.

---

## Task 1: Ürün Kartı Render'ı + Doğrulama + Testler

**Files:**
- Modify: `src/pages/yeni-kabul.js` (kapsamlı iç yeniden yazım — dosyanın geri kalanı, `save()` fonksiyonunun gövdesi dahil, aynı kalıyor)
- Modify: `tests/yeni-kabul.test.js`

**Interfaces:**
- Consumes: `renderSearchList` (`../components/search-list.js`, mevcut), mevcut CSS sınıfları.
- Produces: `renderYeniKabul(container)` (imza değişmiyor) — sayfa artık kart tabanlı ürün girişi gösteriyor.

- [ ] **Step 1: Mevcut testleri yeni kart yapısına uyarlayacak şekilde güncelle**

`tests/yeni-kabul.test.js`'in en üstündeki yardımcı fonksiyonları güncelle. Mevcut hali:

```js
function selectFirstFromSearchList(container, pickerId) {
  const input = container.querySelector(`#${pickerId} .search-input`);
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const li = container.querySelector(`#${pickerId} .search-results li`);
  li.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// Ürün seçimi popup değil her zaman görünen bir tablo (kullanıcı isteği) — Firma seçiminden
// (search-list.js tabanlı popup) farklı bir DOM yapısı, bu yüzden ayrı bir yardımcı gerekiyor.
function selectFirstFromUrunTablo(container) {
  const btn = container.querySelector('#urun-picker [data-add]');
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function addFirstProductRow(container) {
  selectFirstFromUrunTablo(container);
  const qtyInput = container.querySelector('#items-body input[data-field="quantity"][data-index="0"]');
  qtyInput.value = '5';
  qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
}
```

Şuna çevir (ürün seçimi artık kart-içi popup, ürün satırları `#urun-kartlari` altında, `data-index`
kartın `state.items` içindeki index'i — İLK kart zaten sayfa açılışında var olduğu için index 0'ın
kendi popup'unu kullanıyoruz):

```js
function selectFirstFromSearchList(container, pickerId) {
  const input = container.querySelector(`#${pickerId} .search-input`);
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const li = container.querySelector(`#${pickerId} .search-results li`);
  li.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// Ürün seçimi artık kart-içi bir popup (search-list.js) — sayfa açılışında zaten var olan İLK
// kartın (index 0) kendi arama kutusu kullanılıyor.
function selectFirstFromUrunKarti(container, cardIndex = 0) {
  const input = container.querySelector(`.urun-arama[data-index="${cardIndex}"] .search-input`);
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const li = container.querySelector(`.urun-arama[data-index="${cardIndex}"] .search-results li`);
  li.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function addFirstProductRow(container) {
  selectFirstFromUrunKarti(container, 0);
  const qtyInput = container.querySelector('#urun-kartlari input[data-field="quantity"][data-index="0"]');
  qtyInput.value = '5';
  qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
}
```

Dosyadaki `selectFirstFromSearchList(container, 'urun-picker');` çağrısını (miktar<=0 testinde)
şuna çevir:

```js
    selectFirstFromSearchList(container, 'firma-picker');
    selectFirstFromUrunKarti(container, 0);
    // quantity varsayılan olarak 0 bırakılıyor (addFirstProductRow kullanılmadı)
```

Dosyanın SONUNDAKİ (bir önceki işte eklenen) `describe('yeni-kabul ürün tablosu — popup değil
her zaman görünen tablo', ...)` bloğunun TAMAMINI SİL — o blok, bu planla geri alınan "sabit
tablo" davranışını test ediyordu, artık geçersiz. Yerine (aynı `beforeEach`/`afterEach` desenini
kullanarak, 2 ürünlü mock veriyle) şu YENİ blok'u ekle:

```js
describe('yeni-kabul ürün kartları', () => {
  let container;

  beforeEach(async () => {
    vi.clearAllMocks();
    getCurrentProfile.mockResolvedValue({ id: 'u1', full_name: 'Depo Yöneticisi', role: 'depo_yonetici' });
    listCompanies.mockResolvedValue([{ id: 1, name: 'TEST FIRMA' }]);
    listProducts.mockResolvedValue([
      { id: 1, code: 'P1', name: 'DANA KUŞBAŞI', unit: 'kg', category: 'ET' },
      { id: 2, code: 'P2', name: 'TAVUK BUT', unit: 'kg', category: 'ET' }
    ]);

    container = document.createElement('div');
    document.body.appendChild(container);
    await renderYeniKabul(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('sayfa açıldığında bir boş kart hazır bekler', () => {
    const cards = container.querySelectorAll('#urun-kartlari > .card');
    expect(cards).toHaveLength(1);
  });

  it('"+ Ürün Ekle" yeni bir boş kart daha ekler', () => {
    container.querySelector('#urun-ekle-btn').click();
    const cards = container.querySelectorAll('#urun-kartlari > .card');
    expect(cards).toHaveLength(2);
  });

  it('bir karttaki arama kutusundan ürün seçilince o kartın Birim alanı otomatik dolar', () => {
    const input = container.querySelector('.urun-arama[data-index="0"] .search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const li = container.querySelector('.urun-arama[data-index="0"] .search-results li');
    li.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const birimInput = container.querySelectorAll('#urun-kartlari > .card')[0].querySelector('input[disabled]');
    expect(birimInput.value).toBe('kg');
  });

  it('Uygun butonuna basınca o buton vurgulu, Uygunsuz nötr olur; hiçbiri basılmadan önce ikisi de nötrdür', () => {
    const uygunBtn = container.querySelector('[data-uygunluk="uygun"][data-index="0"]');
    const uygunsuzBtn = container.querySelector('[data-uygunluk="uygun_degil"][data-index="0"]');
    expect(uygunBtn.className).not.toContain('btn-success');
    expect(uygunsuzBtn.className).not.toContain('btn-danger');

    uygunBtn.click();
    expect(uygunBtn.className).toContain('btn-success');
    expect(uygunsuzBtn.className).not.toContain('btn-danger');
  });

  it('"Kartı Sil" o kartı kaldırır', () => {
    container.querySelector('#urun-ekle-btn').click(); // artık 2 kart var
    expect(container.querySelectorAll('#urun-kartlari > .card')).toHaveLength(2);

    container.querySelector('[data-remove-card="0"]').click();
    expect(container.querySelectorAll('#urun-kartlari > .card')).toHaveLength(1);
  });

  it('ürün seçilmemiş bir kartla "Kaydet"e basılırsa yerel hata gösterir, RPC\'ye gitmez', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    // İlk kart (index 0) ürün seçilmeden bırakılıyor.
    const tarihInput = container.querySelector('#kabul-tarih');
    tarihInput.value = tarihInput.value || new Date().toISOString().slice(0, 10);

    container.querySelector('#save-draft-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toContain('ürün seçilmeli');
    expect(createReceiptWithItems).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testi çalıştır, FAIL ettiğini doğrula**

Run: `npm run test -- tests/yeni-kabul.test.js`
Expected: FAIL — `#urun-kartlari`, `#urun-ekle-btn`, `.urun-arama`, `[data-uygunluk]`,
`[data-remove-card]` henüz yok (eski `#urun-picker`/`#items-body`/`#items-table` hâlâ mevcut).

- [ ] **Step 3: `src/pages/yeni-kabul.js`'i yeniden yaz**

`src/pages/yeni-kabul.js:3`'teki import satırını:
```js
import { renderSearchList, filterItems } from '../components/search-list.js';
```
şuna çevir (`filterItems` artık kullanılmıyor, sabit tablo kaldırıldığı için):
```js
import { renderSearchList } from '../components/search-list.js';
```

`src/pages/yeni-kabul.js:16`'daki (`const state = { companyId: null, items: [] };`) satırın
HEMEN ÜSTÜNE bir `emptyItem()` yardımcı fonksiyonu ekle, ve `state`'i bunu kullanacak şekilde
değiştir:

```js
  function emptyItem() {
    return {
      productId: null, code: '', name: '', unit: '', marka: '', lotNo: '', skt: '',
      quantity: 0, urunSicakligi: '', yariOmurGecti: false, uygunluk: 'beklemede', note: ''
    };
  }

  const state = { companyId: null, items: [emptyItem()] };
```

`src/pages/yeni-kabul.js:44-58` arasındaki (Ürünler kartı — `<div class="card"> ... </div>` bloğu,
`<div id="urun-picker">` ve `<table id="items-table">` içeren) HTML'i şuna çevir:

```js
    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <div class="card-header-title">📦 Ürünler</div>
        <button type="button" id="urun-ekle-btn" class="btn-accent">+ Ürün Ekle</button>
      </div>
      <div id="urun-kartlari"></div>
    </div>
```

`src/pages/yeni-kabul.js:83-136` arasındaki TÜM `renderItemsBody` fonksiyonunu (blok başı
`function renderItemsBody() {` — blok sonu, fonksiyonun kapanış `}`'ı) SİL, yerine (fonksiyon
tanımının olduğu yere) şu YENİ fonksiyonu koy:

```js
  function renderUrunKartlari() {
    const wrap = container.querySelector('#urun-kartlari');
    wrap.innerHTML = state.items
      .map(
        (item, i) => `
      <div class="card" style="margin-bottom:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
          <strong>${item.productId ? escapeHtml(item.code) + ' — ' + escapeHtml(item.name) : 'Ürün ' + (i + 1)}</strong>
          <button type="button" data-remove-card="${i}" class="btn-ghost">Kartı Sil</button>
        </div>
        <div class="field">
          <label class="field-label">Ürün Adı</label>
          <div class="urun-arama" data-index="${i}"></div>
        </div>
        <div class="field-grid">
          <div class="field"><label class="field-label">Miktar</label><input type="number" min="0" step="0.01" data-field="quantity" data-index="${i}" value="${escapeHtml(item.quantity)}" /></div>
          <div class="field"><label class="field-label">Birim</label><input type="text" value="${escapeHtml(item.unit || '-')}" disabled /></div>
          <div class="field"><label class="field-label">SKT</label><input type="date" data-field="skt" data-index="${i}" value="${escapeHtml(item.skt)}" /></div>
          <div class="field"><label class="field-label">Sıcaklık (°C)</label><input type="number" step="0.1" data-field="urunSicakligi" data-index="${i}" value="${escapeHtml(item.urunSicakligi)}" /></div>
          <div class="field"><label class="field-label">Seri/Lot No</label><input type="text" data-field="lotNo" data-index="${i}" value="${escapeHtml(item.lotNo)}" /></div>
          <div class="field"><label class="field-label">Marka</label><input type="text" data-field="marka" data-index="${i}" value="${escapeHtml(item.marka)}" placeholder="Opsiyonel" /></div>
        </div>
        <div class="field">
          <label class="field-label" style="flex-direction:row;align-items:center;gap:0.4rem;">
            <input type="checkbox" data-field="yariOmurGecti" data-index="${i}" ${item.yariOmurGecti ? 'checked' : ''} /> Yarı Ömrünü Geçti mi
          </label>
        </div>
        <div class="field">
          <label class="field-label">Uygunluk</label>
          <div style="display:flex;gap:0.5rem;">
            <button type="button" data-uygunluk="uygun" data-index="${i}" class="${item.uygunluk === 'uygun' ? 'btn-success' : 'btn-ghost'}" style="flex:1;">✓ Uygun</button>
            <button type="button" data-uygunluk="uygun_degil" data-index="${i}" class="${item.uygunluk === 'uygun_degil' ? 'btn-danger' : 'btn-ghost'}" style="flex:1;">✗ Uygunsuz</button>
          </div>
        </div>
        <div class="field"><label class="field-label">Not</label><input type="text" data-field="note" data-index="${i}" value="${escapeHtml(item.note)}" /></div>
      </div>`
      )
      .join('');

    state.items.forEach((item, i) => {
      renderSearchList(wrap.querySelector(`.urun-arama[data-index="${i}"]`), {
        items: products,
        getLabel: (p) => `[${p.category}] ${p.code} — ${p.name} (${p.unit})`,
        getKey: (p) => p.id,
        placeholder: 'Ürün ara...',
        onSelect: (p) => {
          state.items[i] = { ...state.items[i], productId: p.id, code: p.code, name: p.name, unit: p.unit };
          renderUrunKartlari();
        }
      });
    });

    wrap.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.index);
        state.items[idx][input.dataset.field] = input.checked;
      });
    });
    wrap.querySelectorAll('input:not([type="checkbox"])').forEach((input) => {
      if (!input.dataset.field) return; // Birim alanı: disabled, salt-okunur, state'e yazılmıyor
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.index);
        const field = input.dataset.field;
        state.items[idx][field] = field === 'quantity' ? Number(input.value) : input.value;
      });
    });
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
    wrap.querySelectorAll('[data-remove-card]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.items.splice(Number(btn.dataset.removeCard), 1);
        renderUrunKartlari();
      });
    });
  }

  container.querySelector('#urun-ekle-btn').addEventListener('click', () => {
    state.items.push(emptyItem());
    renderUrunKartlari();
  });

  renderUrunKartlari();
```

Not: eski dosyada `renderItemsBody` fonksiyonunun HEMEN ARDINDAN gelen "Ürün seçimi... sabit
tablo" bloğu (`const urunPicker = ...` ile başlayıp `urunFiltre.addEventListener(...)` ile biten,
`addUrun`/`renderUrunTablo` fonksiyonlarını içeren tüm blok) TAMAMEN SİLİNİYOR — yerini yukarıdaki
`renderUrunKartlari()` çağrısı ve `#urun-ekle-btn` listener'ı alıyor.

`src/pages/yeni-kabul.js`'teki `save()` fonksiyonunun İÇİNDE, mevcut şu bloğun:
```js
    if (state.items.length === 0) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: En az bir ürün satırı gerekli';
      return;
    }
    if (state.items.some((item) => !(item.quantity > 0))) {
```
ARASINA (length===0 kontrolünden SONRA, miktar kontrolünden ÖNCE) yeni bir kontrol ekle:
```js
    if (state.items.length === 0) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: En az bir ürün satırı gerekli';
      return;
    }
    if (state.items.some((item) => !item.productId)) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: Tüm kartlarda bir ürün seçilmeli (boş kartı silin veya ürün seçin)';
      return;
    }
    if (state.items.some((item) => !(item.quantity > 0))) {
```

`save()` fonksiyonunun başarılı-kayıt sonrası temizleme bloğundaki (dosyanın sonlarına doğru):
```js
      state.items = [];
      state.companyId = null;
      container.querySelector('#firma-selected').textContent = '';
      renderItemsBody();
```
satırlarını şuna çevir (boş dizi yerine tek bir boş kart — sayfa "her zaman en az bir boş kart"
kuralını korusun diye — ve yeniden adlandırılan render fonksiyonu çağrılsın):
```js
      state.items = [emptyItem()];
      state.companyId = null;
      container.querySelector('#firma-selected').textContent = '';
      renderUrunKartlari();
```

- [ ] **Step 4: Testi çalıştır, PASS ettiğini doğrula**

Run: `npm run test -- tests/yeni-kabul.test.js`
Expected: PASS (tüm testler — mevcut 6 + yeni kart testleri).

- [ ] **Step 5: Tüm test paketini çalıştır**

Run: `npm run test`
Expected: tüm testler PASS (regresyon yok — `receipts.js`/RPC/backend hiç değişmedi).

- [ ] **Step 6: Build ile derleme hatasını kontrol et**

Run: `npm run build`
Expected: hatasız derleme.

- [ ] **Step 7: Commit**

```bash
git add src/pages/yeni-kabul.js tests/yeni-kabul.test.js
git commit -m "feat: yeni mal kabulde urun girisini tablo yerine dikey kartlara cevir"
```

---

## Task 2: Uçtan Uca Canlı Doğrulama

**Files:** yok (sadece doğrulama, kod değişikliği yok)

**Interfaces:** yok.

- [ ] **Step 1: `npm run build` ve `npm run test` ile son durumu doğrula**

Run: `npm run build && npm run test`
Expected: ikisi de temiz/PASS.

- [ ] **Step 2: Kullanıcıdan canlı doğrulama iste (bu özellik giriş gerektirdiği için otomatik tarayıcı doğrulaması yapılamıyor)**

Şunları kontrol et:
1. Yeni Mal Kabul sayfası açıldığında bir boş ürün kartı hazır görünüyor.
2. Karttaki "Ürün Adı" kutusuna yazınca popup açılıyor (sabit tablo değil), seçilince Birim
   otomatik doluyor, kart başlığında ürün adı görünüyor.
3. "+ Ürün Ekle" yeni bir boş kart daha açıyor — birden fazla kalem girilebiliyor.
4. Uygunluk'ta "Uygun"/"Uygunsuz" butonlarından birine basınca o buton renkli (yeşil/kırmızı)
   oluyor, diğeri nötr kalıyor; hiçbirine basılmazsa (Beklemede) "Kaydet" (final) engelleniyor
   (mevcut kural).
5. "Kartı Sil" o kalemi kaldırıyor.
6. Ürün seçilmemiş bir kartla kaydetmeye çalışınca anlaşılır bir hata gösteriyor.
7. Kayıt başarıyla tamamlanınca form sıfırlanıyor ve tek bir boş kart tekrar hazır bekliyor.

- [ ] **Step 3: Bulunan sorunları düzelt, ilgili testi güncelleyip tekrar çalıştır**
