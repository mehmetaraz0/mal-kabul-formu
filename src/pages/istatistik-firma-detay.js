import { getCompanyDetail } from '../lib/statistics.js';
import { getQueryParam, navigate } from '../router.js';
import { escapeHtml } from '../lib/html.js';

export async function renderIstatistikFirmaDetay(container) {
  const id = getQueryParam('id');
  const name = getQueryParam('name') || '-';
  if (!id) {
    container.innerHTML = '<p>Firma bulunamadı.</p>';
    return;
  }

  container.innerHTML = `
    <button class="btn-ghost" id="back-btn">← İstatistiklere Dön</button>
    <div class="card">
      <div class="card-header"><div class="card-header-title">🏢 ${escapeHtml(name)} — Detay</div></div>
      <p id="detay-msg"></p>
      <div id="detay-table"></div>
    </div>
  `;
  container.querySelector('#back-btn').addEventListener('click', () => navigate('/istatistik'));

  const msg = container.querySelector('#detay-msg');
  try {
    const { rows, truncated } = await getCompanyDetail(id);
    const table = container.querySelector('#detay-table');
    if (rows.length === 0) {
      table.innerHTML = '<p>Kayıt bulunamadı.</p>';
    } else {
      table.innerHTML = `
        <div style="overflow-x:auto;">
          <table class="card-table">
            <thead><tr><th>Ürün</th><th>Marka</th><th>Toplam Kg</th><th>Toplam Adet</th><th>Red Sayısı</th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td>${escapeHtml(r.productName)}</td>
                  <td>${escapeHtml(r.marka)}</td>
                  <td>${r.totalKg > 0 ? Math.round(r.totalKg * 100) / 100 : '-'}</td>
                  <td>${r.totalAdet > 0 ? Math.round(r.totalAdet * 100) / 100 : '-'}</td>
                  <td>${r.rejectedCount > 0 ? r.rejectedCount : '-'}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    if (truncated) {
      msg.style.color = '#a15c00';
      msg.textContent = 'Çok fazla kayıt var, sonuçlar eksik olabilir.';
    }
  } catch (err) {
    msg.style.color = '#b00020';
    msg.textContent = 'Hata: ' + err.message;
  }
}
