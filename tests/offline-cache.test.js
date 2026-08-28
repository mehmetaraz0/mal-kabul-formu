import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cacheAside, isNetworkError } from '../src/lib/offline-cache.js';

describe('cacheAside', () => {
  beforeEach(() => localStorage.clear());

  it('başarılı fetchFn sonucunu localStorage a yazar ve döner', async () => {
    const result = await cacheAside('test-key', () => Promise.resolve([{ id: 1 }]));
    expect(result).toEqual([{ id: 1 }]);
    expect(JSON.parse(localStorage.getItem('test-key'))).toEqual([{ id: 1 }]);
  });

  it('ağ hatasında önbellekteki değeri döner', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 99 }]));
    const netError = new TypeError('Failed to fetch');
    const result = await cacheAside('test-key', () => Promise.reject(netError));
    expect(result).toEqual([{ id: 99 }]);
  });

  it('önbellek de yoksa hatayı yeniden fırlatır', async () => {
    const netError = new TypeError('Failed to fetch');
    await expect(cacheAside('missing-key', () => Promise.reject(netError))).rejects.toThrow('Failed to fetch');
  });

  it('ağ dışı (uygulama) hatasında önbelleğe düşmez, hatayı fırlatır', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 99 }]));
    await expect(cacheAside('test-key', () => Promise.reject(new Error('RLS reddetti')))).rejects.toThrow('RLS reddetti');
  });

  // Gerçek supabase-js (postgrest-js) davranışı: fetch() başarısız olduğunda
  // ham bir TypeError fırlatmaz — onu yakalayıp PostgrestError şeklinde
  // (message/details/hint/code alanlarıyla, code:'' ile) bir düz nesneye
  // çevirir ve `{ data: null, error: {...} }` olarak döner. `listCompanies`/
  // `listProducts` bu `error`'ı `if (error) throw error` ile fırlatır — yani
  // `cacheAside`'a ulaşan gerçek nesne `instanceof TypeError` DEĞİLDİR.
  it('supabase-js in PostgrestError-şekilli ağ hatasında (code boş) önbelleğe düşer', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 99 }]));
    const supabaseWrappedNetworkError = {
      message: 'TypeError: Failed to fetch',
      details: 'TypeError: Failed to fetch\n    at fetch (...)',
      hint: '',
      code: ''
    };
    const result = await cacheAside('test-key', () => Promise.reject(supabaseWrappedNetworkError));
    expect(result).toEqual([{ id: 99 }]);
  });

  it('supabase in RLS/validasyon hatasında (code dolu) önbelleğe düşmez, fırlatır', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 99 }]));
    const supabaseRlsError = {
      message: 'new row violates row-level security policy',
      details: null,
      hint: null,
      code: '42501'
    };
    await expect(cacheAside('test-key', () => Promise.reject(supabaseRlsError))).rejects.toBe(supabaseRlsError);
  });
});

describe('isNetworkError', () => {
  it('TypeError Failed to fetch icin true doner', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });
  it('normal Error icin false doner', () => {
    expect(isNetworkError(new Error('RLS reddetti'))).toBe(false);
  });
  it('supabase-js in PostgrestError-şekilli ağ hatası (code boş) icin true doner', () => {
    expect(isNetworkError({ message: 'TypeError: Failed to fetch', details: '...', hint: '', code: '' })).toBe(true);
  });
  it('supabase in code dolu (gerçek uygulama) hatası icin false doner', () => {
    expect(isNetworkError({ message: 'new row violates row-level security policy', details: null, hint: null, code: '42501' })).toBe(false);
  });
});
