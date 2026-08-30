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

  const items = [
    { id: 1, name: 'ANKA GRUP GIDA' },
    { id: 2, name: 'BAHAR GIDA' }
  ];

  function setup(onSelect = () => {}) {
    const container = document.createElement('div');
    renderSearchList(container, {
      items,
      getLabel: (i) => i.name,
      getKey: (i) => i.id,
      onSelect,
      placeholder: 'Ara...'
    });
    return {
      container,
      input: container.querySelector('.search-input'),
      list: container.querySelector('.search-results')
    };
  }

  it('kutu boşken dropdown gizli başlar (popup davranışı)', () => {
    const { list } = setup();
    expect(list.style.display).toBe('none');
  });

  it('yazınca dropdown açılır ve eşleşenleri gösterir', () => {
    const { input, list } = setup();
    input.value = 'anka';
    input.dispatchEvent(new Event('input'));
    expect(list.style.display).not.toBe('none');
    expect(list.querySelectorAll('li')).toHaveLength(1);
  });

  it('kutu tekrar boşalınca dropdown kapanır', () => {
    const { input, list } = setup();
    input.value = 'anka';
    input.dispatchEvent(new Event('input'));
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(list.style.display).toBe('none');
  });

  it('eşleşme yoksa "Sonuç bulunamadı" mesajı gösterir', () => {
    const { input, list } = setup();
    input.value = 'olmayan bir firma';
    input.dispatchEvent(new Event('input'));
    expect(list.style.display).not.toBe('none');
    expect(list.textContent).toContain('Sonuç bulunamadı');
    expect(list.querySelectorAll('li[data-key]')).toHaveLength(0);
  });

  it('bir öğeye tıklanınca onSelect çağrılır, kutu temizlenir ve dropdown kapanır', () => {
    let selected = null;
    const { input, list } = setup((item) => { selected = item; });
    input.value = 'anka';
    input.dispatchEvent(new Event('input'));
    list.querySelector('li[data-key]').click();
    expect(selected).toEqual(items[0]);
    expect(input.value).toBe('');
    expect(list.style.display).toBe('none');
  });

  it('Escape tuşu dropdown u kapatır', () => {
    const { input, list } = setup();
    input.value = 'anka';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(list.style.display).toBe('none');
  });

  it('kutu dışına tıklanınca dropdown kapanır', () => {
    const { container, input, list } = setup();
    document.body.appendChild(container);
    input.value = 'anka';
    input.dispatchEvent(new Event('input'));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(list.style.display).toBe('none');
    container.remove();
  });
});

describe('renderSearchList — dokunmatik seçim', () => {
  function setup() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const selected = [];
    renderSearchList(container, {
      items: [{ id: 1, name: 'DANA KIYMA' }, { id: 2, name: 'KUZU PIRZOLA' }],
      getLabel: (i) => i.name,
      getKey: (i) => i.id,
      onSelect: (item) => selected.push(item),
      placeholder: 'Ürün ara...'
    });
    return { container, selected };
  }

  function pointer(li, type, x, y, cancelable = true) {
    const evt = new PointerEvent(type, { bubbles: true, cancelable, clientX: x, clientY: y });
    li.dispatchEvent(evt);
    return evt;
  }

  // Kök neden: seçim `click`'te yapılırsa, dokunmatik cihazda sıra
  // touchstart → touchend → blur → (sanal klavye kapanır, sayfa yeniden akar) → click olduğu
  // için `click` parmağın bıraktığı KOORDİNATA kaymış başka bir elemana gider. Seçim,
  // düzen değişmeden önce gelen `pointerup`'ta kesinleşmeli.
  it('yerinde dokunma (pointerdown + pointerup) seçim yapar', () => {
    const { container, selected } = setup();
    const li = container.querySelector('li[data-key="1"]');

    pointer(li, 'pointerdown', 100, 200);
    pointer(li, 'pointerup', 100, 202);

    expect(selected).toHaveLength(1);
    expect(selected[0].name).toBe('DANA KIYMA');
  });

  // 65 ürünlük dropdown kaydırılabilir (max-height:260px). Kaydırma hareketi seçim SAYILMAMALI.
  it('kaydırma hareketi (parmak kayarak kalkarsa) seçim yapmaz', () => {
    const { container, selected } = setup();
    const li = container.querySelector('li[data-key="1"]');

    pointer(li, 'pointerdown', 100, 200);
    pointer(li, 'pointerup', 100, 260);

    expect(selected).toHaveLength(0);
  });

  it('pointerup varsayılanı engellenir (takip eden hayalet click zincirini kırar)', () => {
    const { container } = setup();
    const li = container.querySelector('li[data-key="1"]');

    pointer(li, 'pointerdown', 100, 200);
    const up = pointer(li, 'pointerup', 100, 200);

    expect(up.defaultPrevented).toBe(true);
  });

  it('pointer ile seçimden sonra gelen click ikinci kez seçim yapmaz', () => {
    const { container, selected } = setup();
    const li = container.querySelector('li[data-key="1"]');

    pointer(li, 'pointerdown', 100, 200);
    pointer(li, 'pointerup', 100, 200);
    li.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(selected).toHaveLength(1);
  });

  it('pointer olayı olmayan ortamda click hâlâ seçim yapar (geri uyumluluk)', () => {
    const { container, selected } = setup();
    const li = container.querySelector('li[data-key="2"]');

    li.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(selected).toHaveLength(1);
    expect(selected[0].name).toBe('KUZU PIRZOLA');
  });
});
