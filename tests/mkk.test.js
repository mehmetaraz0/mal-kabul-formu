import { describe, it, expect } from 'vitest';
import { mkkSembolu } from '../src/lib/mkk.js';

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
