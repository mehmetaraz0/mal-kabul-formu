import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { buildMalKabulWorkbook } from '../src/lib/mal-kabul-excel.js';

// jsdom ortamında `import.meta.url` bir http:// URL'i olduğu için dosya yolu
// proje köküne (vitest'in cwd'si) göre çözülüyor.
const TEMPLATE_PATH = resolve(process.cwd(), 'public/sablonlar/mal-kabul-formu-sablonu.xlsx');

// Ham ArrayBuffer döner — buildMalKabulWorkbook'un realm normalizasyonunu da kapsar.
async function sablon() {
  const buf = await readFile(TEMPLATE_PATH);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// Şablonu doğrudan ExcelJS'e yüklemek isteyen testler için. ExcelJS'in altındaki JSZip
// `instanceof` ile tip belirlediğinden, node realm'inden gelen ham ArrayBuffer jsdom
// ortamında reddedilir; bu yüzden testin kendi realm'inde Uint8Array'e sarılır.
async function sablonBytes() {
  return new Uint8Array(await sablon());
}

const LOGO_PATH = resolve(process.cwd(), 'public/logo.png');
async function logo() {
  const buf = await readFile(LOGO_PATH);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function ornekReceipt(overrides = {}) {
  return {
    receipt_date: '2026-08-27',
    companyName: 'TEST FIRMA A.S.',
    fatura_no: 'FTR-1',
    irsaliye_no: 'IRS-1',
    arac_hijyen_uygun: true,
    arac_sicaklik: 4.5,
    ...overrides
  };
}

function ornekOge(overrides = {}) {
  return {
    lot_no: 'LOT-1',
    skt: '2026-09-01',
    products: { name: 'DANA ANTRIKOT (205)' },
    yari_omur_gecti: false,
    urun_sicakligi: 2.1,
    quantity: 10,
    unit: 'kg',
    uygunluk: 'uygun',
    note: null,
    ...overrides
  };
}

describe('buildMalKabulWorkbook', () => {
  it('13 veya daha az öğe için tek "Sayfa 1" worksheet üretir', async () => {
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items: [ornekOge()] }], await sablon());
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Sayfa 1']);
  });

  it('14 öğe için iki worksheet üretir (13 + 1)', async () => {
    const items = Array.from({ length: 14 }, (_, i) => ornekOge({ lot_no: `LOT-${i}` }));
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items }], await sablon());
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Sayfa 1', 'Sayfa 2']);
    expect(wb.worksheets[0].getCell('D5').value).toContain('LOT-0');
    expect(wb.worksheets[1].getCell('D5').value).toContain('LOT-13');
  });

  it('doğru sütunlara doğru verileri yazar', async () => {
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items: [ornekOge()] }], await sablon());
    const ws = wb.worksheets[0];
    expect(ws.getCell('A5').value).toBe('2026-08-27');
    expect(ws.getCell('B5').value).toBe('TEST FIRMA A.S.');
    expect(ws.getCell('C5').value).toBe('FTR-1\nIRS-1');
    expect(ws.getCell('D5').value).toBe('LOT-1');
    expect(ws.getCell('E5').value).toBe('Uygun');
    expect(ws.getCell('F5').value).toBe(4.5);
    expect(ws.getCell('G5').value).toBe('DANA ANTRIKOT (205)');
    expect(ws.getCell('H5').value).toBe('2026-09-01');
    expect(ws.getCell('I5').value).toBe('Hayır');
    expect(ws.getCell('J5').value).toBe(2.1);
    expect(ws.getCell('K5').value).toBe(10);
    expect(ws.getCell('L5').value).toBe('');
    expect(ws.getCell('M5').value).toBe('+');
    expect(ws.getCell('N5').value).toBe('-');
  });

  it('uygun_degil satırında MKK en-dash, Açıklama not metnini gösterir', async () => {
    const oge = ornekOge({ uygunluk: 'uygun_degil', note: 'SKT geçmiş' });
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items: [oge] }], await sablon());
    const ws = wb.worksheets[0];
    expect(ws.getCell('M5').value).toBe('–');
    expect(ws.getCell('N5').value).toBe('SKT geçmiş');
  });

  it('uygun (ve beklemede) satırında da not girilmişse Açıklama sütunu koşulsuz gösterir (PDF çıktısıyla aynı davranış)', async () => {
    const ogeUygun = ornekOge({ uygunluk: 'uygun', note: 'Kutu hafif ezik, ürün etkilenmemiş' });
    const wbUygun = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items: [ogeUygun] }], await sablon());
    expect(wbUygun.worksheets[0].getCell('N5').value).toBe('Kutu hafif ezik, ürün etkilenmemiş');

    const ogeBeklemede = ornekOge({ uygunluk: 'beklemede', note: 'Kalite ekibi inceliyor' });
    const wbBeklemede = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items: [ogeBeklemede] }], await sablon());
    expect(wbBeklemede.worksheets[0].getCell('N5').value).toBe('Kalite ekibi inceliyor');
  });

  it('birim ad ise Adet sütununa, kg ise Kg sütununa yazar', async () => {
    const oge = ornekOge({ quantity: 3, unit: 'ad' });
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items: [oge] }], await sablon());
    const ws = wb.worksheets[0];
    expect(ws.getCell('K5').value).toBe('');
    expect(ws.getCell('L5').value).toBe(3);
  });

  it("boş satırlar 13'e tamamlanana kadar veri yazılmadan bırakılır", async () => {
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items: [ornekOge()] }], await sablon());
    const ws = wb.worksheets[0];
    expect(ws.getCell('A6').value).toBeNull();
    expect(ws.getCell('A17').value).toBeNull();
  });

  it('şablonun başlık/lejant metnini ve birleştirilmiş hücrelerini her sayfada korur', async () => {
    const items = Array.from({ length: 14 }, (_, i) => ornekOge({ lot_no: `LOT-${i}` }));
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items }], await sablon());
    // Sayfa 1: 13 dolu veri satırı (tam dolu), Sayfa 2: 1 dolu veri satırı (14. öğe taştı) —
    // her dolu satır için İmzalar (O:P) ayrıca birleştirildiğinden şablondaki 21 sabit
    // birleştirmeye eklenen dolu-satır sayısı kadar merge daha bekleniyor.
    const doluSatirSayisi = [13, 1];
    wb.worksheets.forEach((ws, i) => {
      expect(ws.getCell('C1').value).toBe('MAL KABUL FORMU');
      expect(ws.getCell('A3').value).toBe('Tarih');
      expect(ws.getCell('M3').value).toBe('MKK');
      expect(ws.getCell('A29').value).toBe('Doküman No:F.22');
      expect(String(ws.getCell('A19').value)).toContain('UYGUN');
      // Şablondaki 21 birleştirilmiş hücre aralığı + her dolu satırın İmzalar (O:P)
      // birleştirmesi korunmalı.
      expect(Object.keys(ws._merges)).toHaveLength(21 + doluSatirSayisi[i]);
      // Başlık dolgusu ve veri hücresi kenarlığı şablondan gelmeli.
      expect(ws.getCell('A3').fill.fgColor.argb).toBe('FFD6E5F3');
      expect(ws.getCell('A5').border.left.style).toBe('thin');
      expect(ws.getCell('A5').font.name).toBe('Times New Roman');
    });
  });

  it('şablonun workbook seviyesindeki media koleksiyonunu korur', async () => {
    const tpl = new ExcelJS.Workbook();
    await tpl.xlsx.load(await sablonBytes());
    expect(tpl.media.length).toBe(1); // şablondaki logo PNG'si

    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items: [ornekOge()] }], await sablon());
    expect(wb.media.length).toBe(tpl.media.length);
  });

  it('şablona gerçek (anchor\'lı) bir resim eklenirse yazma çökmeden çalışır', async () => {
    // Şablona ileride worksheet.addImage() ile bir logo eklenirse, workbook.media
    // taşınmadığı sürece writeBuffer() "Cannot read properties of undefined
    // (reading 'name')" ile çökerdi. Bu test o regresyonu yakalar.
    const tpl = new ExcelJS.Workbook();
    await tpl.xlsx.load(await sablonBytes());
    const tws = tpl.getWorksheet('Mal Kabul Formu');
    const imageId = tpl.addImage({ buffer: tpl.media[0].buffer, extension: 'png' });
    tws.addImage(imageId, 'A1:B2');
    const zenginSablon = await tpl.xlsx.writeBuffer();

    const items = Array.from({ length: 14 }, (_, i) => ornekOge({ lot_no: `LOT-${i}` }));
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items }], zenginSablon);
    const buffer = await wb.xlsx.writeBuffer();

    const tekrar = new ExcelJS.Workbook();
    await tekrar.xlsx.load(buffer);
    expect(tekrar.worksheets.map((s) => s.name)).toEqual(['Sayfa 1', 'Sayfa 2']);
    // Her iki sayfa da anchor'lı resmini korumalı.
    for (const ws of tekrar.worksheets) {
      expect(ws.getImages()).toHaveLength(1);
    }
  });

  it('yazdırma alanı her sayfada GÜNCEL sayfa adıyla korunur', async () => {
    const tpl = new ExcelJS.Workbook();
    await tpl.xlsx.load(await sablonBytes());
    tpl.getWorksheet('Mal Kabul Formu').pageSetup.printArea = 'A1:P29';
    const zenginSablon = await tpl.xlsx.writeBuffer();

    const items = Array.from({ length: 14 }, (_, i) => ornekOge({ lot_no: `LOT-${i}` }));
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items }], zenginSablon);
    const tekrar = new ExcelJS.Workbook();
    await tekrar.xlsx.load(await wb.xlsx.writeBuffer());
    for (const ws of tekrar.worksheets) {
      expect(ws.pageSetup.printArea).toBe('A1:P29');
    }
  });

  it('birden fazla kayıt verildiğinde satırlar KAYIT SINIRINI GÖZETMEDEN 13\'erli sayfalara bölünür (sayfa değil satır sayısı sınırlar)', async () => {
    // A: 14 satır (tek başına 13'ü aşıyor), B: 1 satır. Toplam 15 satır -> 2 sayfa
    // (13 + 2). A'nın 14. satırı ile B'nin 1. satırı AYNI (2.) sayfada yan yana
    // gelmeli — kullanıcı isteği: "her ürün/kayıt için bir sayfa değil, 13 satır
    // dolana kadar tek sayfa, 14. satırda yeni sayfa".
    const receiptA = ornekReceipt({ companyName: 'FIRMA A', irsaliye_no: 'IRS-A' });
    const itemsA = Array.from({ length: 14 }, (_, i) => ornekOge({ lot_no: `A-LOT-${i}` }));
    const receiptB = ornekReceipt({ companyName: 'FIRMA B', irsaliye_no: 'IRS-B' });
    const itemsB = [ornekOge({ lot_no: 'B-LOT-0' })];

    const wb = await buildMalKabulWorkbook(
      [
        { receipt: receiptA, items: itemsA },
        { receipt: receiptB, items: itemsB }
      ],
      await sablon()
    );

    expect(wb.worksheets.map((s) => s.name)).toEqual(['Sayfa 1', 'Sayfa 2']);

    // Sayfa 1: A'nın ilk 13 satırı (A-LOT-0..A-LOT-12), tamamı FIRMA A.
    const s1 = wb.worksheets[0];
    expect(s1.getCell('B5').value).toBe('FIRMA A');
    expect(s1.getCell('D5').value).toContain('A-LOT-0');
    expect(s1.getCell('B17').value).toBe('FIRMA A');
    expect(s1.getCell('D17').value).toContain('A-LOT-12');

    // Sayfa 2: 1. satır A'nın taşan (14.) satırı, 2. satır B'nin satırı — İKİ FARKLI
    // KAYIT AYNI SAYFADA. Her satır KENDİ kaydının firma/irsaliye bilgisini taşımalı.
    const s2 = wb.worksheets[1];
    expect(s2.getCell('B5').value).toBe('FIRMA A');
    expect(s2.getCell('D5').value).toContain('A-LOT-13');
    expect(s2.getCell('C5').value).toContain('IRS-A');
    expect(s2.getCell('B6').value).toBe('FIRMA B');
    expect(s2.getCell('D6').value).toBe('B-LOT-0');
    expect(s2.getCell('C6').value).toContain('IRS-B');
    // Sayfa 2'de sadece 2 veri satırı var, 3.'sü boş.
    expect(s2.getCell('A7').value).toBeNull();
  });

  it('logoArrayBuffer verilmezse hiçbir sayfaya resim eklenmez (eski davranış korunur)', async () => {
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items: [ornekOge()] }], await sablon());
    expect(wb.worksheets[0].getImages()).toHaveLength(0);
  });

  it('logoArrayBuffer verildiğinde HER sayfaya tam olarak A1:B2 aralığına anchor\'lanmış tek resim eklenir', async () => {
    const items = Array.from({ length: 14 }, (_, i) => ornekOge({ lot_no: `LOT-${i}` }));
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items }], await sablon(), await logo());
    expect(wb.worksheets).toHaveLength(2);
    for (const ws of wb.worksheets) {
      const images = ws.getImages();
      expect(images).toHaveLength(1);
      expect(images[0].range.tl.nativeCol).toBe(0); // A
      expect(images[0].range.tl.nativeRow).toBe(0); // 1
    }
    // Logo tek bir resim olarak workbook.media'da bir kez yer almalı (her sayfada
    // aynı imageId'ye referans verilir, resim baytları N kez kopyalanmaz).
    expect(wb.media.filter((m) => m.type === 'image')).toHaveLength(2); // şablonun kendi logosu + eklenen logo
  });

  it('logo eklenmesi şablonun kendi (varsa) media koleksiyonunu bozmadan yazma çökmeden çalışır', async () => {
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items: [ornekOge()] }], await sablon(), await logo());
    const buffer = await wb.xlsx.writeBuffer();
    const tekrar = new ExcelJS.Workbook();
    await tekrar.xlsx.load(buffer);
    expect(tekrar.worksheets[0].getImages()).toHaveLength(1);
  });

  it('yazılan dosya geçerli bir .xlsx olarak geri okunabilir (round-trip)', async () => {
    const items = Array.from({ length: 14 }, (_, i) => ornekOge({ lot_no: `LOT-${i}` }));
    const wb = await buildMalKabulWorkbook([{ receipt: ornekReceipt(), items }], await sablon());
    const buffer = await wb.xlsx.writeBuffer();

    const tekrar = new ExcelJS.Workbook();
    await tekrar.xlsx.load(buffer);
    expect(tekrar.worksheets.map((s) => s.name)).toEqual(['Sayfa 1', 'Sayfa 2']);
    expect(tekrar.worksheets[0].getCell('D5').value).toBe('LOT-0');
    expect(tekrar.worksheets[1].getCell('D5').value).toBe('LOT-13');
    expect(tekrar.worksheets[1].getCell('A3').value).toBe('Tarih');
    expect(tekrar.worksheets[1].getCell('A3').fill.fgColor.argb).toBe('FFD6E5F3');
    expect(tekrar.worksheets[1].pageSetup.orientation).toBe('landscape');
  });

  it('İmzalar hücresine (O:P birleştirilmiş) kaydı oluşturanın adını yazar', async () => {
    const wb = await buildMalKabulWorkbook(
      [{ receipt: ornekReceipt({ receivedByName: 'Depo Kişisi' }), items: [ornekOge()] }],
      await sablon()
    );
    const sheet = wb.worksheets[0];
    expect(sheet.getCell('O5').value).toBe('Depo Kişisi');
    expect(sheet.model.merges).toContain('O5:P5');
  });

  it('receivedByName yoksa İmzalar hücresine "-" yazar', async () => {
    const wb = await buildMalKabulWorkbook(
      [{ receipt: ornekReceipt({ receivedByName: undefined }), items: [ornekOge()] }],
      await sablon()
    );
    expect(wb.worksheets[0].getCell('O5').value).toBe('-');
  });
});
