import { describe, it, expect } from 'vitest';
import { toCsv } from '../src/lib/csv.js';

describe('toCsv', () => {
  const columns = [
    { key: 'name', label: 'Firma' },
    { key: 'date', label: 'Tarih' }
  ];

  it('başlık satırını ve verileri noktalı virgülle ayırır', () => {
    const csv = toCsv([{ name: 'ANKA GRUP', date: '2026-08-26' }], columns);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Firma;Tarih');
    expect(lines[1]).toBe('ANKA GRUP;2026-08-26');
  });

  it('değer içinde noktalı virgül varsa tırnak içine alır', () => {
    const csv = toCsv([{ name: 'FIRMA; A.S.', date: '2026-08-26' }], columns);
    expect(csv.split('\n')[1]).toBe('"FIRMA; A.S.";2026-08-26');
  });

  it('boş/undefined değeri boş string yapar', () => {
    const csv = toCsv([{ name: 'FIRMA', date: undefined }], columns);
    expect(csv.split('\n')[1]).toBe('FIRMA;');
  });

  it('veri yoksa sadece başlık satırı döner', () => {
    const csv = toCsv([], columns);
    expect(csv).toBe('Firma;Tarih');
  });
});
