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
    <p id="list-msg" style="color:#b00020;"></p>
    <ul id="pending-list" style="list-style:none;padding:0;"></ul>
    <div id="detail-panel"></div>
  `;

  const list = container.querySelector('#pending-list');
  fillList(pending);

  function fillList(records) {
    if (records.length === 0) {
      list.innerHTML = '<li>Bekleyen kayıt yok.</li>';
      return;
    }
    list.innerHTML = records
      .map((r) => `<li style="padding:0.5rem;border-bottom:1px solid #eee;">
      <button data-open="${escapeHtml(r.id)}">${escapeHtml(r.receipt_date)} — ${escapeHtml(r.companies.name)} (İrsaliye: ${escapeHtml(r.irsaliye_no || '-')})</button>
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

  // Finalize sonrası tüm sayfayı yeniden render etmek yerine sadece bekleyen listeyi tazeler:
  // böylece #detail-panel'deki başarı mesajı kullanıcı okumadan silinmez ve router'ın render
  // kuşağı (generation) korumasının dışına çıkılmaz.
  async function refreshPendingList() {
    const records = await listPendingQuality();
    fillList(records);
  }

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

    const msg = panel.querySelector('#detail-msg');

    // Son bilinen (veritabanına yazıldığı doğrulanmış) değerler: yazma başarısız olursa kontrolü
    // buraya geri alıyoruz, yoksa ekranda yazılmamış bir değer duruyormuş gibi görünür.
    const lastGood = new Map();
    items.forEach((item) => {
      lastGood.set(item.id, { uygunluk: item.uygunluk, note: item.note || '' });
    });

    // Satır bazlı yazmalar önceden "fire and forget" idi: ağ hatası veya RLS reddi sessizce
    // kayboluyordu (unhandled rejection) ve kullanıcı kaydedildiğini sanıyordu.
    async function saveItem(itemId, uygunluk, note) {
      msg.textContent = '';
      try {
        await updateItemUygunluk(itemId, uygunluk, note);
        lastGood.set(itemId, { uygunluk, note });
        msg.style.color = 'green';
        msg.textContent = 'Kaydedildi.';
      } catch (err) {
        const prev = lastGood.get(itemId) || { uygunluk: 'beklemede', note: '' };
        const sel = panel.querySelector(`select[data-item="${CSS.escape(itemId)}"][data-field="uygunluk"]`);
        const input = panel.querySelector(`input[data-item="${CSS.escape(itemId)}"][data-field="note"]`);
        if (sel) sel.value = prev.uygunluk;
        if (input) input.value = prev.note;
        msg.style.color = '#b00020';
        msg.textContent = 'Hata: ' + err.message;
      }
    }

    panel.querySelectorAll('select[data-field="uygunluk"]').forEach((sel) => {
      sel.addEventListener('change', () => saveItem(sel.dataset.item, sel.value, currentNote(sel.dataset.item)));
    });
    panel.querySelectorAll('input[data-field="note"]').forEach((input) => {
      input.addEventListener('change', () => saveItem(input.dataset.item, currentUygunluk(input.dataset.item), input.value));
    });

    function currentNote(itemId) {
      return panel.querySelector(`input[data-item="${CSS.escape(itemId)}"][data-field="note"]`).value;
    }
    function currentUygunluk(itemId) {
      return panel.querySelector(`select[data-item="${CSS.escape(itemId)}"][data-field="uygunluk"]`).value;
    }

    async function finalize(decision) {
      try {
        await finalizeQuality(receiptId, {
          decision,
          qualityBy: profile.id,
          qualityNote: panel.querySelector('#quality-note').value
        });
        msg.style.color = 'green';
        msg.textContent = decision === 'onaylandi' ? 'Kayıt onaylandı.' : 'Kayıt reddedildi.';
      } catch (err) {
        msg.style.color = '#b00020';
        msg.textContent = 'Hata: ' + err.message;
        return;
      }
      // Buraya kadar geldiysek finalize başarılı; listenin tazelenememesi ölümcül değil.
      try {
        await refreshPendingList();
      } catch (err) {
        const listMsg = container.querySelector('#list-msg');
        listMsg.textContent = 'Liste yenilenemedi: ' + err.message;
      }
    }

    panel.querySelector('#approve-btn').addEventListener('click', () => finalize('onaylandi'));
    panel.querySelector('#reject-btn').addEventListener('click', () => finalize('reddedildi'));
  }
}
