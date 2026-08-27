import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { buildMalKabulWorkbook } from '../src/lib/mal-kabul-excel.js';

// jsdom ortamında `import.meta.url` bir http:// URL'i olduğu için dosya yolu
// proje köküne (vitest'in cwd'si) göre çözülüyor.
const TEMPLATE_PATH = resolve(process.cwd(), 'public/sablonlar/mal-kabul-formu-sablonu.xlsx');

async function sablon() {
  const buf = await readFile(TEMPLATE_PATH);
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
    const wb = await buildMalKabulWorkbook(ornekReceipt(), [ornekOge()], await sablon());
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Sayfa 1']);
  });

  it('14 öğe için iki worksheet üretir (13 + 1)', async () => {
    const items = Array.from({ length: 14 }, (_, i) => ornekOge({ lot_no: `LOT-${i}` }));
    const wb = await buildMalKabulWorkbook(ornekReceipt(), items, await sablon());
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Sayfa 1', 'Sayfa 2']);
    expect(wb.worksheets[0].getCell('D5').value).toContain('LOT-0');
    expect(wb.worksheets[1].getCell('D5').value).toContain('LOT-13');
  });

  it('doğru sütunlara doğru verileri yazar', async () => {
    const wb = await buildMalKabulWorkbook(ornekReceipt(), [ornekOge()], await sablon());
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
    const wb = await buildMalKabulWorkbook(ornekReceipt(), [oge], await sablon());
    const ws = wb.worksheets[0];
    expect(ws.getCell('M5').value).toBe('–');
    expect(ws.getCell('N5').value).toBe('SKT geçmiş');
  });

  it('birim ad ise Adet sütununa, kg ise Kg sütununa yazar', async () => {
    const oge = ornekOge({ quantity: 3, unit: 'ad' });
    const wb = await buildMalKabulWorkbook(ornekReceipt(), [oge], await sablon());
    const ws = wb.worksheets[0];
    expect(ws.getCell('K5').value).toBe('');
    expect(ws.getCell('L5').value).toBe(3);
  });

  it("boş satırlar 13'e tamamlanana kadar veri yazılmadan bırakılır", async () => {
    const wb = await buildMalKabulWorkbook(ornekReceipt(), [ornekOge()], await sablon());
    const ws = wb.worksheets[0];
    expect(ws.getCell('A6').value).toBeNull();
    expect(ws.getCell('A17').value).toBeNull();
  });

  it('şablonun başlık/lejant metnini ve birleştirilmiş hücrelerini her sayfada korur', async () => {
    const items = Array.from({ length: 14 }, (_, i) => ornekOge({ lot_no: `LOT-${i}` }));
    const wb = await buildMalKabulWorkbook(ornekReceipt(), items, await sablon());
    for (const ws of wb.worksheets) {
      expect(ws.getCell('C1').value).toBe('MAL KABUL FORMU');
      expect(ws.getCell('A3').value).toBe('Tarih');
      expect(ws.getCell('M3').value).toBe('MKK');
      expect(ws.getCell('A29').value).toBe('Doküman No:F.22');
      expect(String(ws.getCell('A19').value)).toContain('UYGUN');
      // Şablondaki 21 birleştirilmiş hücre aralığı korunmalı.
      expect(Object.keys(ws._merges)).toHaveLength(21);
      // Başlık dolgusu ve veri hücresi kenarlığı şablondan gelmeli.
      expect(ws.getCell('A3').fill.fgColor.argb).toBe('FFD6E5F3');
      expect(ws.getCell('A5').border.left.style).toBe('thin');
      expect(ws.getCell('A5').font.name).toBe('Times New Roman');
    }
  });

  it('yazılan dosya geçerli bir .xlsx olarak geri okunabilir (round-trip)', async () => {
    const items = Array.from({ length: 14 }, (_, i) => ornekOge({ lot_no: `LOT-${i}` }));
    const wb = await buildMalKabulWorkbook(ornekReceipt(), items, await sablon());
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
});
