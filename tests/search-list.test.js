import { describe, it, expect } from 'vitest';
import { filterItems } from '../src/components/search-list.js';

describe('filterItems', () => {
  const items = [
    { name: 'ANKA GRUP GIDA' },
    { name: 'BAHAR GIDA' },
    { name: 'BALHAN GRUP GIDA' }
  ];

  it('boş sorguda tüm öğeleri döner', () => {
    expect(filterItems(items, '', (i) => i.name)).toHaveLength(3);
  });

  it('büyük/küçük harf duyarsız kısmi eşleşme yapar', () => {
    const result = filterItems(items, 'grup', (i) => i.name);
    expect(result.map((r) => r.name)).toEqual(['ANKA GRUP GIDA', 'BALHAN GRUP GIDA']);
  });

  it('Türkçe karakter normalize eder (İ/I, Ğ, Ş vb. göz ardı edilir)', () => {
    const result = filterItems([{ name: 'BAHAR HINDI ENTEGRE' }], 'hındı', (i) => i.name);
    expect(result).toHaveLength(1);
  });
});
