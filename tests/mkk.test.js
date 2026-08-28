import { describe, it, expect } from 'vitest';
import { mkkSembolu, MKK_ACIKLAMA_METNI } from '../src/lib/mkk.js';

describe('mkkSembolu', () => {
  it('uygun için + döner', () => {
    expect(mkkSembolu('uygun')).toBe('+');
  });

  it('uygun_degil için en-dash döner (açıklama metni DEĞİL)', () => {
    expect(mkkSembolu('uygun_degil')).toBe('–');
  });

  it('beklemede için boş string döner', () => {
    expect(mkkSembolu('beklemede')).toBe('');
  });

  it('bilinmeyen değer için boş string döner', () => {
    expect(mkkSembolu('gecersiz')).toBe('');
  });
});

describe('MKK_ACIKLAMA_METNI', () => {
  it('gerçek şablonun A20 hücresindeki metinle birebir eşleşir', () => {
    expect(MKK_ACIKLAMA_METNI).toBe(
      'Denetim sırasında UYGUN OLMADIĞI görülen durumlar için – yazılacaktır. Açıklama kısmında ise uygunsuzluğun tanımı yapılacak.'
    );
  });
});
