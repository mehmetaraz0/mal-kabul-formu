import ExcelJS from 'exceljs';
import { paginateRows, ROWS_PER_PAGE } from './pagination.js';
import { mkkSembolu, evetHayirYokBilgi } from './mkk.js';

// Şablondaki (public/sablonlar/mal-kabul-formu-sablonu.xlsx) sabit yerleşim:
// satır 1-2 logo/başlık, 3-4 sütun başlıkları, 5-17 veri (tam 13 satır = ROWS_PER_PAGE),
// 19-27 not/lejant metni, 29 doküman kontrol satırı.
const VERI_BASLANGIC_SATIRI = 5;
const SABLON_SAYFA_ADI = 'Mal Kabul Formu';

// ExcelJS'in altındaki JSZip girdi tipini `instanceof` ile belirler; farklı bir realm'den
// gelen (ör. jsdom test ortamı, ya da bir Worker) ArrayBuffer bu kontrolü geçemez ve
// "Can't read the data of 'the loaded zip file'" hatası alınır. Girdiyi bu modülün kendi
// realm'inde bir Uint8Array'e sarmak hem ArrayBuffer hem Buffer/TypedArray girdilerini
// güvenle destekler.
function sablonBaytlari(template) {
  if (ArrayBuffer.isView(template)) {
    return new Uint8Array(template.buffer, template.byteOffset, template.byteLength);
  }
  return new Uint8Array(template);
}

/**
 * Şablonun birebir kopyası olan, her ROWS_PER_PAGE (13) SATIR için bir worksheet
 * ("Sayfa 1", "Sayfa 2", ...) içeren bir ExcelJS Workbook üretir.
 *
 * `receiptsWithItems`: `Array<{ receipt, items }>` — birden fazla kayıt verildiğinde
 * (Kayıt Ara'nın tarih aralığı toplu Excel çıktısı) TÜM kayıtların satırları TEK bir
 * akışa düzleştirilip 13'erli sayfalara bölünür — sayfalama KAYIT sınırında değil
 * SATIR SAYISINDA gerçekleşir (kullanıcı isteği: "her ürün için bir sayfa değil, 13
 * satır dolana kadar tek sayfa, 14. satırda yeni sayfa"). Yani farklı kayıtların
 * satırları aynı sayfada yan yana gelebilir; her satır KENDİ kaydına (receipt) ait
 * tarih/firma/fatura/irsaliye/araç bilgisini taşıdığı için (aşağıda satır bazlı
 * yazılıyor) bu bir karışıklığa yol açmaz. Tek kayıtlık çağrı
 * `buildMalKabulWorkbook([{ receipt, items }], sablon)` şeklinde, eski tek-kayıt
 * davranışıyla birebir aynı çıktıyı üretir.
 *
 * Yaklaşım: ExcelJS'in aynı workbook içinde stil/birleştirme koruyarak worksheet
 * kopyalayan bir API'si yok. Bu yüzden her sayfa için şablon TEMİZ olarak ayrı bir
 * geçici workbook'a yüklenir (böylece kenarlık/dolgu/font/birleştirilmiş hücreler/
 * sütun genişlikleri/sayfa düzeni birebir gelir), veriler yazılır ve worksheet
 * hedef workbook'a taşınır.
 *
 * Taşıma sırasında worksheet'e BENZERSİZ bir `id` verilmesi şart: `Workbook._worksheets`
 * dizisi worksheet id'siyle indekslenir (1'den başlar — `get worksheets()` `.slice(1)`
 * yapar, yani 0. indeks hiçbir zaman okunmaz) ve şablondan yüklenen her sayfa id=1
 * ile gelir. Benzersiz id/orderNo atanmazsa sayfalar birbirinin üzerine yazar.
 */
export async function buildMalKabulWorkbook(receiptsWithItems, templateArrayBuffer) {
  const sablon = sablonBaytlari(templateArrayBuffer);
  const workbook = new ExcelJS.Workbook();

  // Tüm kayıtların satırlarını, hangi kayda (receipt) ait olduklarını taşıyarak
  // tek bir akışa düzleştir — sayfalama bu akış üzerinde, kayıt sınırlarını
  // gözetmeden 13'erli yapılır.
  const flatRows = [];
  for (const { receipt, items } of receiptsWithItems) {
    for (const item of items) {
      flatRows.push({ receipt, item });
    }
  }
  const pages = paginateRows(flatRows, ROWS_PER_PAGE);

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageWorkbook = new ExcelJS.Workbook();
    await pageWorkbook.xlsx.load(sablon);
    const sheet = pageWorkbook.getWorksheet(SABLON_SAYFA_ADI);
    if (!sheet) throw new Error(`Şablonda "${SABLON_SAYFA_ADI}" sayfası bulunamadı`);
    sheet.name = `Sayfa ${pageIndex + 1}`;

    pages[pageIndex].forEach(({ receipt, item }, i) => {
      const row = VERI_BASLANGIC_SATIRI + i;
      sheet.getCell(`A${row}`).value = receipt.receipt_date;
      sheet.getCell(`B${row}`).value = receipt.companyName;
      // C sütunu TEK sütun ama iki satırlı başlık (Fatura no / İrsaliye no) —
      // veri hücresinde de iki değer alt alta yazılır.
      sheet.getCell(`C${row}`).value = `${receipt.fatura_no || '-'}\n${receipt.irsaliye_no || '-'}`;
      sheet.getCell(`D${row}`).value = item.lot_no || '-';
      sheet.getCell(`E${row}`).value = evetHayirYokBilgi(receipt.arac_hijyen_uygun);
      sheet.getCell(`F${row}`).value = receipt.arac_sicaklik ?? '-';
      sheet.getCell(`G${row}`).value = item.products?.name || '-';
      sheet.getCell(`H${row}`).value = item.skt || '-';
      sheet.getCell(`I${row}`).value = item.yari_omur_gecti ? 'Evet' : 'Hayır';
      sheet.getCell(`J${row}`).value = item.urun_sicakligi ?? '-';
      sheet.getCell(`K${row}`).value = item.unit === 'kg' ? item.quantity : '';
      sheet.getCell(`L${row}`).value = item.unit === 'ad' ? item.quantity : '';
      sheet.getCell(`M${row}`).value = mkkSembolu(item.uygunluk);
      // Not sütunu koşulsuz gösterilir — PDF/print çıktısıyla aynı (kalite ekibi
      // uygun/beklemede satırına da not girebiliyor, kalite-onay.js'te bir kısıt yok).
      sheet.getCell(`N${row}`).value = item.note || '-';
      // O{row}:P{row} (İmzalar) bilerek boş bırakılıyor — ıslak imza için.
    });

    // Şablonun workbook seviyesindeki görsel ayarlarını (tema, görünüm, özellikler)
    // dosyanın İLK sayfasından hedef workbook'a taşı (tek seferlik, tüm dosya için).
    if (pageIndex === 0) {
      workbook._themes = pageWorkbook._themes;
      workbook.views = pageWorkbook.views;
      workbook.properties = pageWorkbook.properties;
      workbook.calcProperties = pageWorkbook.calcProperties;
      // Resimler workbook seviyesinde (`workbook.media`) tutulur; worksheet ise onlara
      // `_media[].imageId` ile INDEKS üzerinden atıf yapar. Media taşınmazsa şablona
      // gerçek (anchor'lı) bir logo eklendiği anda writeBuffer() doğrudan çöker:
      // "Cannot read properties of undefined (reading 'name')" (worksheet-xform.js).
      workbook.media = pageWorkbook.media;
      // `definedNames` BİLEREK kopyalanmıyor. Yazdırma alanı zaten worksheet'in
      // `pageSetup.printArea`'sında taşınır ve ExcelJS onu yazarken sayfanın GÜNCEL
      // adıyla yeniden üretir ('Sayfa 1'!$A$1:$P$29) — doğrulandı. Geriye kalan
      // kullanıcı tanımlı adlar ise şablon sayfasına adıyla atıf yapar
      // ("'Mal Kabul Formu'!$A$5:$P$17"); sayfaları "Sayfa N" olarak yeniden
      // adlandırdığımız için bunları olduğu gibi kopyalamak, olmayan bir sayfayı
      // gösteren (#REF!) bozuk bir ad üretir. Workbook kapsamlı adlar benzersiz
      // olmak zorunda olduğundan N sayfa için doğru tek bir hedef de yoktur.
    }

    const id = pageIndex + 1;
    sheet.id = id;
    sheet.orderNo = pageIndex;
    sheet._workbook = workbook;
    workbook._worksheets[id] = sheet;
  }

  return workbook;
}
