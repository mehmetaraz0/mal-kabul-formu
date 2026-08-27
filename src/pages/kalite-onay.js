import { listPendingQuality, getReceiptDetail, updateItemUygunluk, finalizeQuality } from '../lib/receipts.js';
import { getCurrentProfile, hasRole } from '../lib/auth.js';
import { escapeHtml } from '../lib/html.js';

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
      <button data-open="${escapeHtml(r.id)}">${escapeHtml(r.receipt_date)} — ${escapeHtml(r.companies.name)} (İrsaliye: ${escapeHtml(r.irsaliye_no || '-')})</button>
    </li>`)
    .join('');

  list.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => renderDetail(btn.dataset.open));
  });

  async function renderDetail(receiptId) {
    const { receipt, items } = await getReceiptDetail(receiptId);
    const panel = container.querySelector('#detail-panel');
    panel.innerHTML = `
      <h3>Detay — İrsaliye: ${escapeHtml(receipt.irsaliye_no || '-')} / Sipariş: ${escapeHtml(receipt.siparis_no || '-')}</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th>Ürün</th><th>Lot No</th><th>SKT</th><th>Miktar</th><th>Uygunluk</th><th>Not</th></tr></thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td>${escapeHtml(item.products.code)} — ${escapeHtml(item.products.name)}</td>
              <td>${escapeHtml(item.lot_no || '-')}</td>
              <td>${escapeHtml(item.skt || '-')}</td>
              <td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td>
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
