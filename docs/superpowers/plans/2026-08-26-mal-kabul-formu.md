# Mal Kabul Formu ve Kalite Onay Akışı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depo yöneticisinin tek bir sayfada firma seçip, ürünleri (seri/lot no, SKT, miktar ile) toplu olarak girip kaydettiği bir Mal Kabul Formu ekranı ve kalite ekibinin bu kayıtları satır satır uygunluk kontrolünden geçirip onayladığı/reddettiği bir Kalite Onay ekranı kurmak.

**Architecture:** Tek sayfalık form (`src/pages/yeni-kabul.js`) yerel state'te (bir JS dizisi) satırları tutar, kullanıcı "Kaydet" dediğinde tüm başlık + satır verisini tek seferde (`createReceiptWithItems`) Supabase'e yazar — bu, kullanıcının istediği "toplu olarak bir sayfa" davranışıdır. Kalite ekibi ayrı bir ekrandan (`src/pages/kalite-onay.js`) bekleyen kayıtları görüp satır bazında `uygunluk` alanını günceller ve kaydı onaylar/reddeder. Durum akışı Plan 1'de tanımlanan `taslak → kalite_bekliyor → onaylandi | reddedildi` state machine'ini takip eder.

**Tech Stack:** Plan 1 (Supabase şema/auth) ve Plan 2'nin (`listCompanies`, `listProducts`, `renderSearchList`, router) üzerine inşa edilir. Ek bağımlılık yok.

## Global Constraints

- Bu plan Plan 1 ve Plan 2'nin tamamlanmış olduğunu varsayar.
- Sadece `depo_yonetici` rolü yeni mal kabul kaydı oluşturabilir/düzenleyebilir (taslak durumdayken); sadece `kalite_ekibi` rolü `kalite_bekliyor` durumundaki kayıtları onaylayabilir/reddedebilir (Plan 1 RLS bunu zaten veritabanı seviyesinde zorunlu kılıyor — bu plan arayüzde de aynı kısıtı uygular).
- Bir mal kabul kaydının en az bir satırı (ürün) olmadan "Kalite Onayına Gönder" yapılamaz.
- `uygunluk` alanı üç değerden biri olabilir: `uygun`, `uygun_degil`, `beklemede` (varsayılan). Kalite ekibi her satırı tek tek `uygun`/`uygun_degil` olarak işaretlemeden kaydı `onaylandi` yapamaz.
- Teslim alan personel adı `receipts.received_by` üzerinden (oturum açan `depo_yonetici` profili), kalite kontrolü yapan personel adı `receipts.quality_by` üzerinden (oturum açan `kalite_ekibi` profili) otomatik kaydedilir — elle imza alanı yerine oturum kimliği "imza" yerine geçer (elle imza/ıslak imza gerekiyorsa bu, gerçek Mal Kabul Formu şablonu elde edildiğinde Plan 4'te yazdırma çıktısına eklenecek ayrı bir konudur).
- **Varsayım:** İrsaliye No ve Sipariş No serbest metin alanı olarak tutulur (ayrı bir "siparişler" tablosuyla eşleştirme bu planın kapsamı dışında — kullanıcı sadece bu iki alanın forma girilmesini istedi, otomatik eşleştirme istemedi).
- **Güvenlik (Plan 1 Task 6 review'dan):** Veritabanından/formdan gelen serbest metin (firma adı, ürün adı/kodu, lot no, irsaliye/sipariş no, not alanları vb.) `innerHTML` içine yazılırken MUTLAKA `src/lib/html.js`'teki `escapeHtml()` ile kaçışlanmalı (stored XSS önlemi) — bu, `yeni-kabul.js`'teki satır tablosunu ve `kalite-onay.js`'teki detay görünümünü de kapsar. Ayrıca bir değer `value="..."` gibi bir HTML attribute içine yazılıyorsa (örn. `<input value="${item.note}">`), `escapeHtml()` çift tırnak (`"`) karakterini de kaçışlamalı ki not alanındaki bir `"` attribute'tan kaçıp yeni bir HTML özniteliği/olayı enjekte edemesin.

---

## Dosya Yapısı

```
src/
  lib/
    receipts.js          # createReceiptWithItems, submitForQuality, listPendingQuality,
                          # getReceiptDetail, updateItemUygunluk, finalizeQuality
  pages/
    yeni-kabul.js          # tek sayfa mal kabul giriş formu
    kalite-onay.js          # bekleyen kayıtlar listesi + detay onay ekranı
tests/
  receipts.test.js
```

---

### Task 1: Mal Kabul Veri Katmanı (`src/lib/receipts.js`)

**Files:**
- Create: `src/lib/receipts.js`
- Test: `tests/receipts.test.js`

**Interfaces:**
- Consumes: `supabase` (Plan 1).
- Produces:
  - `createReceiptWithItems({ companyId, receiptDate, irsaliyeNo, siparisNo, receivedBy, items })` → `Promise<string>` (yeni receipt id)
  - `submitForQuality(receiptId)` → `Promise<void>`
  - `listPendingQuality()` → `Promise<Array<{id, receipt_date, irsaliye_no, companies: {name}}>>`
  - `getReceiptDetail(receiptId)` → `Promise<{receipt, items}>` — `items` her biri `{id, product_id, lot_no, skt, quantity, unit, uygunluk, note, products: {code, name}}`
  - `updateItemUygunluk(itemId, uygunluk, note)` → `Promise<void>`
  - `finalizeQuality(receiptId, { decision, qualityBy, qualityNote })` → `Promise<void>` (`decision` = `'onaylandi'` | `'reddedildi'`)
  - Task 2 (`yeni-kabul.js`) `createReceiptWithItems`/`submitForQuality`'i, Task 3 (`kalite-onay.js`) diğer dört fonksiyonu kullanır.

- [ ] **Step 1: `tests/receipts.test.js` yaz**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockState = { receiptsInsertResult: { data: { id: 'r1' }, error: null } };

vi.mock('../src/lib/supabase.js', () => {
  const from = vi.fn((table) => {
    if (table === 'receipts') {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve(mockState.receiptsInsertResult))
          }))
        })),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({
              data: [{ id: 'r1', receipt_date: '2026-08-26', irsaliye_no: 'IRS-1', companies: { name: 'TEST FIRMA' } }],
              error: null
            }))
          })),
          single: vi.fn(() => Promise.resolve({
            data: { id: 'r1', company_id: 1, status: 'kalite_bekliyor' },
            error: null
          }))
        }))
      };
    }
    if (table === 'receipt_items') {
      return {
        insert: vi.fn(() => Promise.resolve({ error: null })),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: [{ id: 'i1', product_id: 1, lot_no: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg', uygunluk: 'beklemede', note: null, products: { code: 'YIY01000001', name: 'DANA' } }],
            error: null
          }))
        }))
      };
    }
    throw new Error('beklenmeyen tablo: ' + table);
  });
  return { supabase: { from } };
});

import {
  createReceiptWithItems,
  submitForQuality,
  listPendingQuality,
  getReceiptDetail,
  updateItemUygunluk,
  finalizeQuality
} from '../src/lib/receipts.js';

describe('receipts', () => {
  it('createReceiptWithItems en az bir satır ister', async () => {
    await expect(createReceiptWithItems({
      companyId: 1, receiptDate: '2026-08-26', irsaliyeNo: '', siparisNo: '', receivedBy: 'u1', items: []
    })).rejects.toThrow('En az bir ürün satırı gerekli');
  });

  it('createReceiptWithItems geçerli veriyle receipt id döner', async () => {
    const id = await createReceiptWithItems({
      companyId: 1, receiptDate: '2026-08-26', irsaliyeNo: 'IRS-1', siparisNo: '', receivedBy: 'u1',
      items: [{ productId: 1, lotNo: 'L1', skt: '2026-09-01', quantity: 10, unit: 'kg' }]
    });
    expect(id).toBe('r1');
  });

  it('listPendingQuality kalite_bekliyor kayıtlarını döner', async () => {
    const result = await listPendingQuality();
    expect(result).toHaveLength(1);
    expect(result[0].companies.name).toBe('TEST FIRMA');
  });

  it('getReceiptDetail receipt ve items birlikte döner', async () => {
    const result = await getReceiptDetail('r1');
    expect(result.receipt.status).toBe('kalite_bekliyor');
    expect(result.items).toHaveLength(1);
  });

  it('finalizeQuality tüm satırlar işaretlenmeden onaylandi kabul etmez', async () => {
    await expect(finalizeQuality('r1', { decision: 'onaylandi', qualityBy: 'u2', qualityNote: '' }))
      .rejects.toThrow('Tüm satırlar uygun/uygun değil olarak işaretlenmeden onaylanamaz');
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `receipts.js` bulunamadı.

- [ ] **Step 3: `src/lib/receipts.js` yaz**

```javascript
import { supabase } from './supabase.js';

export async function createReceiptWithItems({ companyId, receiptDate, irsaliyeNo, siparisNo, receivedBy, items }) {
  if (!items || items.length === 0) throw new Error('En az bir ürün satırı gerekli');

  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .insert({
      client_uuid: crypto.randomUUID(),
      company_id: companyId,
      receipt_date: receiptDate,
      irsaliye_no: irsaliyeNo || null,
      siparis_no: siparisNo || null,
      received_by: receivedBy,
      status: 'taslak'
    })
    .select()
    .single();
  if (receiptError) throw receiptError;

  const rows = items.map((item, index) => ({
    receipt_id: receipt.id,
    product_id: item.productId,
    line_no: index + 1,
    lot_no: item.lotNo || null,
    skt: item.skt || null,
    quantity: item.quantity,
    unit: item.unit,
    uygunluk: 'beklemede'
  }));
  const { error: itemsError } = await supabase.from('receipt_items').insert(rows);
  if (itemsError) throw itemsError;

  return receipt.id;
}

export async function submitForQuality(receiptId) {
  const { error } = await supabase.from('receipts').update({ status: 'kalite_bekliyor' }).eq('id', receiptId);
  if (error) throw error;
}

export async function listPendingQuality() {
  const { data, error } = await supabase
    .from('receipts')
    .select('id, receipt_date, irsaliye_no, siparis_no, companies (name)')
    .eq('status', 'kalite_bekliyor')
    .order('receipt_date');
  if (error) throw error;
  return data;
}

export async function getReceiptDetail(receiptId) {
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select('id, company_id, receipt_date, irsaliye_no, siparis_no, status, received_by, quality_by, quality_note')
    .eq('id', receiptId)
    .single();
  if (receiptError) throw receiptError;

  const { data: items, error: itemsError } = await supabase
    .from('receipt_items')
    .select('id, product_id, lot_no, skt, quantity, unit, uygunluk, note, products (code, name)')
    .eq('receipt_id', receiptId);
  if (itemsError) throw itemsError;

  return { receipt, items };
}

export async function updateItemUygunluk(itemId, uygunluk, note) {
  const { error } = await supabase.from('receipt_items').update({ uygunluk, note: note || null }).eq('id', itemId);
  if (error) throw error;
}

export async function finalizeQuality(receiptId, { decision, qualityBy, qualityNote }) {
  const { items } = await getReceiptDetail(receiptId);
  if (decision === 'onaylandi' && items.some((i) => i.uygunluk === 'beklemede')) {
    throw new Error('Tüm satırlar uygun/uygun değil olarak işaretlenmeden onaylanamaz');
  }
  const { error } = await supabase
    .from('receipts')
    .update({ status: decision, quality_by: qualityBy, quality_note: qualityNote || null })
    .eq('id', receiptId);
  if (error) throw error;
}
```

- [ ] **Step 4: Testi tekrar çalıştır**

Run: `npm run test`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/receipts.js tests/receipts.test.js
git commit -m "feat: mal kabul veri katmanını ekle (oluşturma, kalite onay akışı)"
```

---

### Task 2: Yeni Mal Kabul Formu Sayfası (Tek Sayfa Giriş)

**Files:**
- Create: `src/pages/yeni-kabul.js`
- Modify: `src/main.js` (rota kaydı + ana sayfa linki)

**Interfaces:**
- Consumes: `listCompanies` (Plan 2), `listProducts` (Plan 2), `renderSearchList` (Plan 2), `createReceiptWithItems`/`submitForQuality` (Task 1), `getCurrentProfile` (Plan 1).
- Produces: `/yeni-kabul` rotası.

- [ ] **Step 1: `src/pages/yeni-kabul.js` yaz**

```javascript
import { listCompanies } from '../lib/companies.js';
import { listProducts } from '../lib/products.js';
import { renderSearchList } from '../components/search-list.js';
import { createReceiptWithItems, submitForQuality } from '../lib/receipts.js';
import { getCurrentProfile } from '../lib/auth.js';

export async function renderYeniKabul(container) {
  const [companies, products, profile] = await Promise.all([listCompanies(), listProducts(), getCurrentProfile()]);

  const state = { companyId: null, items: [] };

  container.innerHTML = `
    <h2>Yeni Mal Kabul</h2>
    <div style="display:flex;flex-direction:column;gap:0.75rem;max-width:520px;">
      <label>Firma
        <div id="firma-picker"></div>
        <div id="firma-selected" style="font-weight:bold;"></div>
      </label>
      <label>Tarih <input type="date" id="kabul-tarih" value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label>İrsaliye No <input type="text" id="kabul-irsaliye" /></label>
      <label>Sipariş No <input type="text" id="kabul-siparis" /></label>
    </div>

    <h3>Ürün Ekle</h3>
    <div id="urun-picker" style="max-width:520px;"></div>

    <table id="items-table" style="width:100%;border-collapse:collapse;margin-top:1rem;">
      <thead>
        <tr style="text-align:left;border-bottom:2px solid #333;">
          <th>Ürün</th><th>Lot No</th><th>SKT</th><th>Miktar</th><th>Birim</th><th></th>
        </tr>
      </thead>
      <tbody id="items-body"></tbody>
    </table>

    <div style="margin-top:1rem;display:flex;gap:0.5rem;">
      <button id="save-draft-btn">Taslak Kaydet</button>
      <button id="submit-quality-btn">Kaydet ve Kalite Onayına Gönder</button>
    </div>
    <p id="kabul-msg"></p>
  `;

  renderSearchList(container.querySelector('#firma-picker'), {
    items: companies,
    getLabel: (c) => c.name,
    getKey: (c) => c.id,
    placeholder: 'Firma ara...',
    onSelect: (c) => {
      state.companyId = c.id;
      container.querySelector('#firma-selected').textContent = 'Seçili: ' + c.name;
    }
  });

  function renderItemsBody() {
    const tbody = container.querySelector('#items-body');
    tbody.innerHTML = state.items
      .map(
        (item, i) => `
      <tr>
        <td>${item.code} — ${item.name}</td>
        <td><input type="text" data-field="lotNo" data-index="${i}" value="${item.lotNo}" /></td>
        <td><input type="date" data-field="skt" data-index="${i}" value="${item.skt}" /></td>
        <td><input type="number" min="0" step="0.01" data-field="quantity" data-index="${i}" value="${item.quantity}" style="width:80px;" /></td>
        <td>${item.unit}</td>
        <td><button data-remove="${i}">Sil</button></td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('input').forEach((input) => {
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

  renderSearchList(container.querySelector('#urun-picker'), {
    items: products,
    getLabel: (p) => `[${p.category}] ${p.code} — ${p.name} (${p.unit})`,
    getKey: (p) => p.id,
    placeholder: 'Eklenecek ürünü ara...',
    onSelect: (p) => {
      state.items.push({ productId: p.id, code: p.code, name: p.name, unit: p.unit, lotNo: '', skt: '', quantity: 0 });
      renderItemsBody();
    }
  });

  async function save(sendToQuality) {
    const msg = container.querySelector('#kabul-msg');
    msg.textContent = '';
    try {
      if (!state.companyId) throw new Error('Lütfen bir firma seçin');
      const receiptId = await createReceiptWithItems({
        companyId: state.companyId,
        receiptDate: container.querySelector('#kabul-tarih').value,
        irsaliyeNo: container.querySelector('#kabul-irsaliye').value,
        siparisNo: container.querySelector('#kabul-siparis').value,
        receivedBy: profile.id,
        items: state.items
      });
      if (sendToQuality) await submitForQuality(receiptId);
      msg.style.color = 'green';
      msg.textContent = sendToQuality ? 'Kaydedildi ve kalite onayına gönderildi.' : 'Taslak olarak kaydedildi.';
      state.items = [];
      state.companyId = null;
      renderItemsBody();
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    }
  }

  container.querySelector('#save-draft-btn').addEventListener('click', () => save(false));
  container.querySelector('#submit-quality-btn').addEventListener('click', () => save(true));
}
```

- [ ] **Step 2: Rotayı ve ana sayfa linkini `src/main.js`'e ekle**

Import ekle:

```javascript
import { renderYeniKabul } from './pages/yeni-kabul.js';
```

`registerRoute('/', ...)` içeriğini güncelle (ana sayfadan hızlı erişim linki):

```javascript
  registerRoute('/', (c) => {
    c.innerHTML = '<p><button data-nav="/yeni-kabul">+ Yeni Mal Kabul</button></p>';
    c.querySelector('[data-nav]').addEventListener('click', () => navigate('/yeni-kabul'));
  });
  registerRoute('/yeni-kabul', renderYeniKabul);
```

Nav menüsüne de ekle (`<nav>` bloğu içine):

```html
<button data-nav="/yeni-kabul">Yeni Mal Kabul</button>
```

- [ ] **Step 3: Tarayıcıda uçtan uca doğrula**

Run: `npm run dev`, `depo_yonetici` rolündeki kullanıcıyla giriş yap, "Yeni Mal Kabul"a git.
Expected: Firma ara → bir firma seç → "Seçili: ..." görünür. Ürün ara → bir ürün seç → tabloya satır eklenir. Lot no, SKT, miktar gir. "Kaydet ve Kalite Onayına Gönder"e bas → yeşil "Kaydedildi ve kalite onayına gönderildi." mesajı, form sıfırlanır. Supabase Table Editor'de `receipts` (status=kalite_bekliyor) ve `receipt_items` satırlarını doğrula.

- [ ] **Step 4: Commit**

```bash
git add src/pages/yeni-kabul.js src/main.js
git commit -m "feat: tek sayfa yeni mal kabul formu ekle"
```

---

### Task 3: Kalite Onay Sayfası

**Files:**
- Create: `src/pages/kalite-onay.js`
- Modify: `src/main.js` (rota kaydı + nav linki, sadece `kalite_ekibi` rolüne görünür)

**Interfaces:**
- Consumes: `listPendingQuality`, `getReceiptDetail`, `updateItemUygunluk`, `finalizeQuality` (Task 1), `getCurrentProfile`/`hasRole` (Plan 1).
- Produces: `/kalite-onay` rotası.

- [ ] **Step 1: `src/pages/kalite-onay.js` yaz**

```javascript
import { listPendingQuality, getReceiptDetail, updateItemUygunluk, finalizeQuality } from '../lib/receipts.js';
import { getCurrentProfile, hasRole } from '../lib/auth.js';

export async function renderKaliteOnay(container) {
  const profile = await getCurrentProfile();
  if (!hasRole(profile, 'kalite_ekibi')) {
    container.innerHTML = '<p>Bu sayfa sadece kalite ekibi rolüne açıktır.</p>';
    return;
  }

  const pending = await listPendingQuality();
  container.innerHTML = `
    <h2>Kalite Onayı Bekleyen Kayıtlar</h2>
    <ul id="pending-list" style="list-style:none;padding:0;"></ul>
    <div id="detail-panel"></div>
  `;

  const list = container.querySelector('#pending-list');
  if (pending.length === 0) {
    list.innerHTML = '<li>Bekleyen kayıt yok.</li>';
  }
  list.innerHTML = pending
    .map((r) => `<li style="padding:0.5rem;border-bottom:1px solid #eee;">
      <button data-open="${r.id}">${r.receipt_date} — ${r.companies.name} (İrsaliye: ${r.irsaliye_no || '-'})</button>
    </li>`)
    .join('');

  list.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => renderDetail(btn.dataset.open));
  });

  async function renderDetail(receiptId) {
    const { receipt, items } = await getReceiptDetail(receiptId);
    const panel = container.querySelector('#detail-panel');
    panel.innerHTML = `
      <h3>Detay — İrsaliye: ${receipt.irsaliye_no || '-'} / Sipariş: ${receipt.siparis_no || '-'}</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th>Ürün</th><th>Lot No</th><th>SKT</th><th>Miktar</th><th>Uygunluk</th><th>Not</th></tr></thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td>${item.products.code} — ${item.products.name}</td>
              <td>${item.lot_no || '-'}</td>
              <td>${item.skt || '-'}</td>
              <td>${item.quantity} ${item.unit}</td>
              <td>
                <select data-item="${item.id}" data-field="uygunluk">
                  <option value="beklemede" ${item.uygunluk === 'beklemede' ? 'selected' : ''}>Beklemede</option>
                  <option value="uygun" ${item.uygunluk === 'uygun' ? 'selected' : ''}>Uygun</option>
                  <option value="uygun_degil" ${item.uygunluk === 'uygun_degil' ? 'selected' : ''}>Uygun Değil</option>
                </select>
              </td>
              <td><input type="text" data-item="${item.id}" data-field="note" value="${item.note || ''}" /></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <label>Genel Kalite Notu <input type="text" id="quality-note" /></label>
      <div style="margin-top:0.5rem;display:flex;gap:0.5rem;">
        <button id="approve-btn">Onayla</button>
        <button id="reject-btn">Reddet</button>
      </div>
      <p id="detail-msg"></p>
    `;

    panel.querySelectorAll('select[data-field="uygunluk"]').forEach((sel) => {
      sel.addEventListener('change', () => updateItemUygunluk(sel.dataset.item, sel.value, currentNote(sel.dataset.item)));
    });
    panel.querySelectorAll('input[data-field="note"]').forEach((input) => {
      input.addEventListener('change', () => updateItemUygunluk(input.dataset.item, currentUygunluk(input.dataset.item), input.value));
    });

    function currentNote(itemId) {
      return panel.querySelector(`input[data-item="${itemId}"][data-field="note"]`).value;
    }
    function currentUygunluk(itemId) {
      return panel.querySelector(`select[data-item="${itemId}"][data-field="uygunluk"]`).value;
    }

    async function finalize(decision) {
      const msg = panel.querySelector('#detail-msg');
      try {
        await finalizeQuality(receiptId, {
          decision,
          qualityBy: profile.id,
          qualityNote: panel.querySelector('#quality-note').value
        });
        msg.style.color = 'green';
        msg.textContent = decision === 'onaylandi' ? 'Kayıt onaylandı.' : 'Kayıt reddedildi.';
        renderKaliteOnay(container);
      } catch (err) {
        msg.style.color = '#b00020';
        msg.textContent = 'Hata: ' + err.message;
      }
    }

    panel.querySelector('#approve-btn').addEventListener('click', () => finalize('onaylandi'));
    panel.querySelector('#reject-btn').addEventListener('click', () => finalize('reddedildi'));
  }
}
```

- [ ] **Step 2: Rotayı ve rol bazlı nav linkini `src/main.js`'e ekle**

Import ekle:

```javascript
import { renderKaliteOnay } from './pages/kalite-onay.js';
```

```javascript
  registerRoute('/kalite-onay', renderKaliteOnay);
```

`<nav>` bloğunu rol bazlı hale getir — `renderApp` içindeki nav HTML'ini güncelle:

```javascript
    <nav style="display:flex;gap:0.5rem;padding:0.5rem 1rem;background:#e9ecef;flex-wrap:wrap;">
      <button data-nav="/">Ana Sayfa</button>
      <button data-nav="/firmalar">Firmalar</button>
      <button data-nav="/urunler">Ürünler</button>
      <button data-nav="/yeni-kabul">Yeni Mal Kabul</button>
      ${profile.role === 'kalite_ekibi' ? '<button data-nav="/kalite-onay">Kalite Onayı</button>' : ''}
    </nav>
```

- [ ] **Step 3: Tarayıcıda uçtan uca doğrula**

1. `kalite_ekibi` rolündeki test kullanıcısıyla giriş yap (Supabase Dashboard'dan bir kullanıcının `profiles.role` değerini `kalite_ekibi` yap).
2. "Kalite Onayı"na git → Task 2'de oluşturduğun bekleyen kaydı listede gör.
3. Kayda tıkla → satırları gör, her birinin uygunluk seçimini "Uygun" yap.
4. "Onayla"ya bas.

Expected: "Kayıt onaylandı." mesajı, liste yenilenir ve kayıt artık listede görünmez (status artık `onaylandi`). Supabase Table Editor'de `receipts.status = 'onaylandi'`, `receipts.quality_by` dolu olduğunu doğrula. Tüm satırlar `beklemede` bırakılıp "Onayla"ya basılırsa kırmızı hata mesajı görünmeli (RLS/uygulama kontrolü).

- [ ] **Step 4: Commit**

```bash
git add src/pages/kalite-onay.js src/main.js
git commit -m "feat: kalite onay ekranı ekle (satır bazlı uygunluk, onayla/reddet)"
```

---

## Bu Plan Tamamlandığında Doğrulanacaklar

- `npm run test` yeşil (receipts testleri dahil).
- `depo_yonetici` ile tek sayfada firma + birden çok ürün satırı (lot no/SKT/miktar ile) girilip "Kalite Onayına Gönder" ile kaydedilebiliyor.
- `kalite_ekibi` ile bekleyen kayıtlar görülüp satır bazlı uygunluk işaretlenip onaylanabiliyor/reddedilebiliyor.
- RLS sayesinde `depo_yonetici` kullanıcısı kalite onay işlemini, `kalite_ekibi` kullanıcısı yeni kayıt oluşturmayı yapamıyor (manuel olarak yanlış rolle denenip hata alındığı doğrulanmalı).
- Plan 4 (`2026-08-26-arama-cikti-export.md`) `getReceiptDetail` ve yeni yazılacak bir `listReceipts(filters)` fonksiyonunu kullanarak arama/çıktı ekranını bu veriler üzerine kurar.
