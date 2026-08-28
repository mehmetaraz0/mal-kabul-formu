import ExcelJS from 'exceljs';

// Arama sonuç listesini (birden fazla farklı mal kabul kaydının özeti) tek bir düz
// tabloya yazan basit bir .xlsx üretici. Tek bir kaydın gerçek kağıt forma birebir uyan
// detaylı çıktısı için `mal-kabul-excel.js`'e bakın — bu ikisi farklı amaçlara hizmet eder.
export async function buildReceiptsListWorkbook(rows, columns) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Mal Kabul Kayıtları');

  sheet.columns = columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.max(c.label.length + 4, 16)
  }));
  sheet.getRow(1).font = { bold: true };

  rows.forEach((row) => {
    sheet.addRow(
      columns.reduce((acc, c) => {
        acc[c.key] = row[c.key] ?? '';
        return acc;
      }, {})
    );
  });

  return workbook;
}
