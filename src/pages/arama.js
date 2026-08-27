import { listReceipts } from '../lib/receipts.js';
import { listCompanies } from '../lib/companies.js';
import { listProducts } from '../lib/products.js';
import { downloadCsv } from '../lib/csv.js';
import { escapeHtml } from '../lib/html.js';
import { navigate } from '../router.js';

const STATUS_LABELS = {
  taslak: 'Taslak',
  kalite_bekliyor: 'Kalite Bekliyor',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi'
};

export async function renderArama(container) {
  const [companies, products] = await Promise.all([listCompanies(), listProducts()]);

  container.innerHTML = `
    <h2>Mal Kabul Kayıtlarında Ara</h2>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:end;margin-bottom:1rem;">
      <label>Firma
        <select id="filter-company"><option value="">Tümü</option>${companies.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}</select>
      </label>
      <label>Ürün
        <select id="filter-product"><option value="">Tümü</option>${products.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.code)} — ${escapeHtml(p.name)}</option>`).join('')}</select>
      </label>
      <label>Başlangıç <input type="date" id="filter-start" /></label>
      <label>Bitiş <input type="date" id="filter-end" /></label>
      <label>Durum
        <select id="filter-status">
          <option value="">Tümü</option>
          <option value="taslak">Taslak</option>
          <option value="kalite_bekliyor">Kalite Bekliyor</option>
          <option value="onaylandi">Onaylandı</option>
          <option value="reddedildi">Reddedildi</option>
        </select>
      </label>
      <button id="search-btn">Ara</button>
      <button id="export-csv-btn">CSV İndir</button>
    </div>
    <p id="arama-msg"></p>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="text-align:left;border-bottom:2px solid #333;"><th>Tarih</th><th>Firma</th><th>İrsaliye No</th><th>Durum</th><th></th></tr></thead>
      <tbody id="results-body"></tbody>
    </table>
  `;

  let lastResults = [];

  function currentFilters() {
    return {
      companyId: container.querySelector('#filter-company').value || undefined,
      productId: container.querySelector('#filter-product').value || undefined,
      startDate: container.querySelector('#filter-start').value || undefined,
      endDate: container.querySelector('#filter-end').value || undefined,
      status: container.querySelector('#filter-status').value || undefined
    };
  }

  async function runSearch() {
    const msg = container.querySelector('#arama-msg');
    msg.textContent = '';
    try {
      lastResults = await listReceipts(currentFilters());
      const tbody = container.querySelector('#results-body');
      if (lastResults.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Sonuç bulunamadı.</td></tr>';
        return;
      }
      tbody.innerHTML = lastResults
        .map(
          (r) => `<tr>
            <td>${escapeHtml(r.receipt_date)}</td>
            <td>${escapeHtml(r.companies.name)}</td>
            <td>${escapeHtml(r.irsaliye_no || '-')}</td>
            <td>${escapeHtml(STATUS_LABELS[r.status] || r.status)}</td>
            <td><button data-view="${escapeHtml(r.id)}">Çıktı</button></td>
          </tr>`
        )
        .join('');
      tbody.querySelectorAll('[data-view]').forEach((btn) => {
        btn.addEventListener('click', () => navigate('/mal-kabul-ciktisi?id=' + btn.dataset.view));
      });
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    }
  }

  container.querySelector('#search-btn').addEventListener('click', runSearch);
  container.querySelector('#export-csv-btn').addEventListener('click', () => {
    const msg = container.querySelector('#arama-msg');
    msg.textContent = '';
    if (lastResults.length === 0) return;
    try {
      downloadCsv(
        `mal-kabul-${new Date().toISOString().slice(0, 10)}.csv`,
        lastResults.map((r) => ({ tarih: r.receipt_date, firma: r.companies.name, irsaliye_no: r.irsaliye_no, durum: STATUS_LABELS[r.status] || r.status })),
        [
          { key: 'tarih', label: 'Tarih' },
          { key: 'firma', label: 'Firma' },
          { key: 'irsaliye_no', label: 'İrsaliye No' },
          { key: 'durum', label: 'Durum' }
        ]
      );
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    }
  });

  await runSearch();
}
