function escapeCell(value) {
  const str = value === undefined || value === null ? '' : String(value);
  return str.includes(';') || str.includes('"') || str.includes('\n')
    ? '"' + str.replace(/"/g, '""') + '"'
    : str;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => c.label).join(';');
  const lines = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(';'));
  return [header, ...lines].join('\n');
}

export function downloadCsv(filename, rows, columns) {
  const csv = toCsv(rows, columns);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
