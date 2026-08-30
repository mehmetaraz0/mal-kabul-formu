import { getStatistics } from '../lib/statistics.js';
import { escapeHtml } from '../lib/html.js';

function renderTable(rows, nameLabel) {
  if (rows.length === 0) return '<p>Kayıt bulunamadı.</p>';
  return `
    <div style="overflow-x:auto;">
    <table class="card-table">
      <thead><tr><th>${nameLabel}</th><th>Toplam Kg</th><th>Toplam Adet</th><th>Red Sayısı</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(r.name)}</td>
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

export async function renderIstatistik(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">📊 İstatistik</div></div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:end;">
        <div class="field"><label class="field-label" for="istatistik-start">Başlangıç</label><input type="date" id="istatistik-start" /></div>
        <div class="field"><label class="field-label" for="istatistik-end">Bitiş</label><input type="date" id="istatistik-end" /></div>
        <div class="field" style="justify-content:end;"><button id="istatistik-filter-btn">Filtrele</button></div>
      </div>
    </div>
    <p id="istatistik-msg"></p>
    <div class="card">
      <div class="card-header"><div class="card-header-title">Ürün Bazlı</div></div>
      <div id="istatistik-products"></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-header-title">Firma Bazlı</div></div>
      <div id="istatistik-companies"></div>
    </div>
  `;

  async function load() {
    const msg = container.querySelector('#istatistik-msg');
    msg.textContent = '';
    try {
      const startDate = container.querySelector('#istatistik-start').value || undefined;
      const endDate = container.querySelector('#istatistik-end').value || undefined;
      const { products, companies, truncated } = await getStatistics({ startDate, endDate });
      container.querySelector('#istatistik-products').innerHTML = renderTable(products, 'Ürün Adı');
      container.querySelector('#istatistik-companies').innerHTML = renderTable(companies, 'Firma Adı');
      if (truncated) {
        msg.style.color = '#a15c00';
        msg.textContent = 'Çok fazla kayıt var, sonuçlar eksik olabilir — tarih aralığını daraltın.';
      }
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    }
  }

  container.querySelector('#istatistik-filter-btn').addEventListener('click', load);
  await load();
}
