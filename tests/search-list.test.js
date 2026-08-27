import { describe, it, expect } from 'vitest';
import { filterItems, renderSearchList } from '../src/components/search-list.js';

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

describe('renderSearchList', () => {
  it('DB kaynaklı etiketleri innerHTML olarak eklemeden önce escapeHtml ile kaçışlar (XSS regresyon testi)', () => {
    const container = document.createElement('div');
    const dangerousName = '<img src=x onerror=alert(1)>';

    renderSearchList(container, {
      items: [{ id: 1, name: dangerousName }],
      getLabel: (i) => i.name,
      getKey: (i) => i.id,
      onSelect: () => {},
      placeholder: 'test'
    });

    const li = container.querySelector('li');
    expect(li).not.toBeNull();
    expect(li.innerHTML).not.toContain('<img');
    expect(li.textContent).toContain(dangerousName);
    expect(container.querySelector('img')).toBeNull();
  });
});
