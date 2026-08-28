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

  // Final review bulgusu 2: önbelleğe YAZMA best-effort olmalı — kota aşımı (QuotaExceededError)
  // ya da Safari gizli modu (storage tamamen kapalı) BAŞARIYLA çekilmiş veriyi hataya
  // çevirmemeli. Eski hali setItem'ı fetch ile aynı try bloğunda tutuyordu.
  it('setItem hata firlatirsa bile fetch sonucunu doner (yazma best-effort)', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    try {
      const result = await cacheAside('test-key', () => Promise.resolve([{ id: 1 }]));
      expect(result).toEqual([{ id: 1 }]);
    } finally {
      spy.mockRestore();
    }
  });

  // Eski (tek try bloğu) halinde bu senaryo daha da sinsiydi: çevrimdışıyken setItem patlarsa
  // isNetworkError(quotaError) `!navigator.onLine` yüzünden true dönüyor ve TAZE veri atılıp
  // BAYAT önbellek değeri döndürülüyordu.
  it('cevrimdisi gorunurken setItem patlarsa bile BAYAT onbellek degil TAZE veri doner', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 99 }]));
    // jsdom'da navigator.onLine Navigator.prototype üzerinde bir getter'dır; örnek üzerinde kendi
    // (configurable) getter'ımızı tanımlayıp sonra siliyoruz.
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    try {
      const result = await cacheAside('test-key', () => Promise.resolve([{ id: 1 }]));
      expect(result).toEqual([{ id: 1 }]);
    } finally {
      setSpy.mockRestore();
      delete window.navigator.onLine;
    }
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
