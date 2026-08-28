import { describe, it, expect } from 'vitest';
import { buildReceiptsListWorkbook } from '../src/lib/receipts-list-excel.js';

const columns = [
  { key: 'tarih', label: 'Tarih' },
  { key: 'firma', label: 'Firma' },
  { key: 'irsaliye_no', label: 'İrsaliye No' },
  { key: 'durum', label: 'Durum' }
];

describe('buildReceiptsListWorkbook', () => {
  it('başlık satırını sütun etiketleriyle doldurur', async () => {
    const workbook = await buildReceiptsListWorkbook([], columns);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).getCell(1).value).toBe('Tarih');
    expect(sheet.getRow(1).getCell(2).value).toBe('Firma');
    expect(sheet.getRow(1).getCell(3).value).toBe('İrsaliye No');
    expect(sheet.getRow(1).getCell(4).value).toBe('Durum');
  });

  it('veri satırlarını doğru sırada ve doğru hücrelere yazar', async () => {
    const rows = [
      { tarih: '2026-08-27', firma: 'ANKA GRUP GIDA', irsaliye_no: 'IRS-1', durum: 'Onaylandı' },
      { tarih: '2026-08-26', firma: 'BAHAR GIDA', irsaliye_no: null, durum: 'Taslak' }
    ];
    const workbook = await buildReceiptsListWorkbook(rows, columns);
    const sheet = workbook.worksheets[0];

    expect(sheet.getRow(2).getCell(1).value).toBe('2026-08-27');
    expect(sheet.getRow(2).getCell(2).value).toBe('ANKA GRUP GIDA');
    expect(sheet.getRow(2).getCell(3).value).toBe('IRS-1');
    expect(sheet.getRow(2).getCell(4).value).toBe('Onaylandı');

    expect(sheet.getRow(3).getCell(1).value).toBe('2026-08-26');
    // null değer boş hücre olmalı, "null" metni değil.
    expect(sheet.getRow(3).getCell(3).value).toBe('');
  });

  it('başlık satırı kalın (bold) olur', async () => {
    const workbook = await buildReceiptsListWorkbook([], columns);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).font.bold).toBe(true);
  });

  it('gerçek bir .xlsx buffer üretebilir (writeBuffer hatasız çalışır)', async () => {
    const workbook = await buildReceiptsListWorkbook(
      [{ tarih: '2026-08-27', firma: 'TEST', irsaliye_no: 'X', durum: 'Taslak' }],
      columns
    );
    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
