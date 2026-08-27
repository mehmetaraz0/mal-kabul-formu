import { listCompanies } from '../lib/companies.js';
import { listProducts } from '../lib/products.js';
import { renderSearchList } from '../components/search-list.js';
import { createReceiptWithItems, submitForQuality } from '../lib/receipts.js';
import { getCurrentProfile } from '../lib/auth.js';
import { escapeHtml } from '../lib/html.js';

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
        <td>${escapeHtml(item.code)} — ${escapeHtml(item.name)}</td>
        <td><input type="text" data-field="lotNo" data-index="${i}" value="${escapeHtml(item.lotNo)}" /></td>
        <td><input type="date" data-field="skt" data-index="${i}" value="${escapeHtml(item.skt)}" /></td>
        <td><input type="number" min="0" step="0.01" data-field="quantity" data-index="${i}" value="${escapeHtml(item.quantity)}" style="width:80px;" /></td>
        <td>${escapeHtml(item.unit)}</td>
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
      container.querySelector('#firma-selected').textContent = '';
      renderItemsBody();
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    }
  }

  container.querySelector('#save-draft-btn').addEventListener('click', () => save(false));
  container.querySelector('#submit-quality-btn').addEventListener('click', () => save(true));
}
