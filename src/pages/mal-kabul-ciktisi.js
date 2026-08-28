import { getReceiptDetail } from '../lib/receipts.js';
import { getQueryParam } from '../router.js';
import { paginateRows, ROWS_PER_PAGE } from '../lib/pagination.js';
import { escapeHtml } from '../lib/html.js';
import { mkkSembolu, evetHayirYokBilgi, MKK_ACIKLAMA_METNI } from '../lib/mkk.js';

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
        <img src="${import.meta.env.BASE_URL}logo.png" alt="Logo" onerror="this.style.display='none'" />
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
              <td>${mkkSembolu(item.uygunluk)}</td>
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
              ${MKK_ACIKLAMA_METNI}
              Mal Kabul Kriterleri: Gıda malzemesinin uygunluğu için Hammadde Özellikleri Tablosu niteliklerine bakılır.
              ${RISK_LEGEND}
            </div>`
          : ''
      }
    </div>`
    )
    .join('');

  container.innerHTML = `
    <div class="no-print" style="margin-bottom:1rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button id="print-btn" class="btn-ghost">Yazdır</button>
      <button id="pdf-btn">PDF İndir</button>
      <button id="excel-btn" class="btn-accent">Excel İndir</button>
    </div>
    <p id="ciktisi-msg" class="no-print"></p>
    <div id="print-area">${pagesHtml}</div>
  `;

  container.querySelector('#print-btn').addEventListener('click', () => window.print());
  container.querySelector('#pdf-btn').addEventListener('click', async () => {
    const msg = container.querySelector('#ciktisi-msg');
    msg.textContent = '';
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf()
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
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    }
  });

  container.querySelector('#excel-btn').addEventListener('click', async () => {
    const msg = container.querySelector('#ciktisi-msg');
    msg.textContent = '';
    try {
      // exceljs büyük bir bağımlılık — sadece butona basıldığında yüklensin.
      const { buildMalKabulWorkbook } = await import('../lib/mal-kabul-excel.js');
      // GitHub Pages'te uygulama kök dizinde değil bir alt-yolda (`/mal-kabul-formu/`)
      // yayında; `import.meta.env.BASE_URL` Vite'ın `base` ayarına göre doğru öneki
      // (dev'de '/', prod'da '/mal-kabul-formu/') verir — sabit '/sablonlar/...' yolu
      // canlıda 404 veriyordu.
      const res = await fetch(`${import.meta.env.BASE_URL}sablonlar/mal-kabul-formu-sablonu.xlsx`);
      if (!res.ok) throw new Error(`Şablon indirilemedi (${res.status})`);
      const templateBuf = await res.arrayBuffer();
      const workbook = await buildMalKabulWorkbook(receipt, items, templateBuf);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mal-kabul-${receipt.receipt_date}-${receiptId.slice(0, 8)}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Excel oluşturulamadı: ' + err.message;
    }
  });
}
