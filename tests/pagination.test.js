import { describe, it, expect } from 'vitest';
import { paginateRows } from '../src/lib/pagination.js';

describe('paginateRows', () => {
  it('13 veya daha az satırı tek sayfada döner', () => {
    const rows = Array.from({ length: 13 }, (_, i) => i);
    expect(paginateRows(rows)).toEqual([rows]);
  });

  it('14 satırı iki sayfaya böler (13 + 1)', () => {
    const rows = Array.from({ length: 14 }, (_, i) => i);
    const pages = paginateRows(rows);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(13);
    expect(pages[1]).toHaveLength(1);
  });

  it('boş listede tek boş sayfa döner (form yine de basılabilsin)', () => {
    expect(paginateRows([])).toEqual([[]]);
  });

  it('özel sayfa boyutu kabul eder', () => {
    const rows = [1, 2, 3, 4, 5];
    expect(paginateRows(rows, 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
