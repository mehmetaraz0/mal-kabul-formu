import { getReceiptDetail } from '../lib/receipts.js';
import { getQueryParam } from '../router.js';
import { paginateRows, ROWS_PER_PAGE } from '../lib/pagination.js';
import { escapeHtml } from '../lib/html.js';

// Kullanıcının paylaştığı gerçek forma ait doküman kontrol bilgileri (Doküman No:F.22,
// Yayın Tarihi:15.02.2026, Rev.Tarihi/No:/00). Form revize edilirse burası güncellenir.
const DOC_NO = 'F.22';
const DOC_YAYIN_TARIHI = '15.02.2026';
const DOC_REV = '/00';

const RISK_LEGEND = `
  <strong>1. Derece riskli ürünler:</strong> Tüm et ve et ürünleri, sakatat ürünleri, balık ve deniz hayvanları ürünleri, kümes hayvanları ürünleri, pasta kreması, yumurta.
  <strong>2. Derece riskli ürünler:</strong> Dondurulmuş meyve sebze, konserve, katı ve sıvı yağlar.
  <strong>3. Derece riskli ürünler:</strong> Turşular, kuru gıda, baharat, bal, corn flakes, marmelat, reçel, pekmez, zeytin, tahin, bakliyat.
  <strong>4. Derece riskli ürünler:</strong> Sebze, meyve.
  <br/><strong>Alerjen gıdalar:</strong> Gluten içeren tahıllar, kabuklular, yumurta, balık, kerevit, hardal, susam tohumu, kükürt dioksit, sülfitler, acı bakla, yumuşakçalar.
`;

function evetHayirYokBilgi(value) {
  if (value === null || value === undefined) return '-';
  return value ? 'Uygun' : 'Uygun Değil';
}

function mkkHucresi(item) {
  if (item.uygunluk === 'uygun') return '+';
  if (item.uygunluk === 'uygun_degil') return escapeHtml(item.note || 'Uygun Değil');
  return '-';
}

export async function renderMalKabulCiktisi(container) {
  const receiptId = getQueryParam('id');
  if (!receiptId) {
    container.innerHTML = '<p>Gösterilecek kayıt bulunamadı.</p>';
    return;
  }

  const { receipt, items } = await getReceiptDetail(receiptId);
  const pages = paginateRows(items, ROWS_PER_PAGE);

  const pagesHtml = pages
    .map(
      (pageItems, pageIndex) => `
    <div class="print-page">
      <div class="print-header">
        <img src="/logo.png" alt="Logo" onerror="this.style.display='none'" />
        <div class="print-title">MAL KABUL FORMU</div>
        <div>Sayfa ${pageIndex + 1} / ${pages.length}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Tarih</th><th>Firma Adı</th><th>Fatura No</th><th>İrsaliye No</th>
            <th>Seri No/<br/>Parti No</th><th>Araç<br/>Hijyen</th><th>Araç<br/>Sıcaklık</th>
            <th>Malzeme Adı</th><th>SKT</th><th>Yarı Ömrünü<br/>Geçmiş mi?</th>
            <th>Ürün<br/>Sıcaklığı</th><th>Kg.</th><th>Adet</th><th>MKK</th>
            <th>Açıklama</th><th>İmzalar</th>
          </tr>
        </thead>
        <tbody>
          ${pageItems
            .map(
              (item) => `
            <tr>
              <td>${escapeHtml(receipt.receipt_date)}</td>
              <td>${escapeHtml(receipt.companyName)}</td>
              <td>${escapeHtml(receipt.fatura_no || '-')}</td>
              <td>${escapeHtml(receipt.irsaliye_no || '-')}</td>
              <td>${escapeHtml(item.lot_no || '-')}</td>
              <td>${evetHayirYokBilgi(receipt.arac_hijyen_uygun)}</td>
              <td>${receipt.arac_sicaklik ?? '-'}</td>
              <td>${escapeHtml(item.products.name)}</td>
              <td>${escapeHtml(item.skt || '-')}</td>
              <td>${item.yari_omur_gecti ? 'Evet' : 'Hayır'}</td>
              <td>${item.urun_sicakligi ?? '-'}</td>
              <td>${item.unit === 'kg' ? item.quantity : ''}</td>
              <td>${item.unit === 'ad' ? item.quantity : ''}</td>
              <td>${mkkHucresi(item)}</td>
              <td>${escapeHtml(item.note || '-')}</td>
              <td></td>
            </tr>`
            )
            .join('')}
          ${Array.from({ length: ROWS_PER_PAGE - pageItems.length }, () => '<tr><td colspan="16">&nbsp;</td></tr>').join('')}
        </tbody>
      </table>
      <div class="print-doc-footer">
        <div>Doküman No:${DOC_NO}</div>
        <div>Yayın Tarihi:${DOC_YAYIN_TARIHI}</div>
        <div>Rev.Tarihi/No:${DOC_REV}</div>
      </div>
      ${
        pageIndex === pages.length - 1
          ? `<div class="print-signoff">
              <div>Teslim Alan: ${escapeHtml(receipt.receivedByName || '-')}</div>
              <div>Kalite Kontrol: ${escapeHtml(receipt.qualityByName || '-')}</div>
              <div>Durum: ${escapeHtml(receipt.status)}</div>
            </div>
            <div>Kalite Notu: ${escapeHtml(receipt.quality_note || '-')}</div>
            <div class="print-legend">
              <strong>Not:</strong> Denetim sırasında UYGUN görülen durumlar için ilgili kolona <strong>+</strong> yazılacaktır.
              Denetim sırasında UYGUN OLMADIĞI görülen durumlar için ise uygunsuzluğun tanımı yapılacaktır.
              Mal Kabul Kriterleri: Gıda malzemesinin uygunluğu için Hammadde Özellikleri Tablosu niteliklerine bakılır.
              ${RISK_LEGEND}
            </div>`
          : ''
      }
    </div>`
    )
    .join('');

  container.innerHTML = `
    <div class="no-print" style="margin-bottom:1rem;display:flex;gap:0.5rem;">
      <button id="print-btn">Yazdır</button>
      <button id="pdf-btn">PDF İndir</button>
    </div>
    <div id="print-area">${pagesHtml}</div>
  `;

  container.querySelector('#print-btn').addEventListener('click', () => window.print());
  container.querySelector('#pdf-btn').addEventListener('click', async () => {
    const html2pdf = (await import('html2pdf.js')).default;
    html2pdf()
      .set({
        filename: `mal-kabul-${receipt.receipt_date}-${receiptId.slice(0, 8)}.pdf`,
        margin: 5,
        jsPDF: { format: 'a4', orientation: 'landscape' },
        // .print-page bölümlerinin sayfa sınırlarıyla eşleşmesi için computed style'a
        // (page-break-after) ek olarak açıkça de belirtiyoruz.
        pagebreak: { mode: 'css', after: '.print-page' }
      })
      .from(container.querySelector('#print-area'))
      .save();
  });
}
