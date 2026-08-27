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

  it('formül olabilecek değerleri kesme işaretiyle etkisizleştirir', () => {
    // Not: değer ayrıca '"' de içerdiği için (mevcut tırnak-içine-alma kuralı gereği) hücre
    // tırnak içine alınır ve iç tırnaklar '""' olarak katlanır — kesme işareti eklemek bu
    // kuralı atlamaz, sadece formül olarak yorumlanmayı engeller.
    const csv = toCsv([{ name: '=HYPERLINK("http://kotu")', date: '2026-08-26' }], columns);
    expect(csv.split('\n')[1]).toBe('"\'=HYPERLINK(""http://kotu"")";2026-08-26');
  });

  it('formül olabilecek ama tırnak içermeyen değeri katlamadan kesme işaretiyle etkisizleştirir', () => {
    const csv = toCsv([{ name: '+1 234', date: '2026-08-26' }], columns);
    expect(csv.split('\n')[1]).toBe("'+1 234;2026-08-26");
  });
});
