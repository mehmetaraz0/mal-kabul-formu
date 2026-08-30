import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hasRole, hasAnyRole } from '../src/lib/role.js';

const { mockGetSession, mockSingle } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSingle: vi.fn()
}));

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: mockSingle }))
      }))
    }))
  }
}));

// isNetworkError/cacheAside BİLEREK mock'lanmıyor: bu testlerin amacı getCurrentProfile'ın
// GERÇEK cacheAside davranışıyla (çevrimdışı fallback dahil) çalıştığını doğrulamak.
import { getCurrentProfile } from '../src/lib/auth.js';

const PROFILE = { id: 'u1', full_name: 'Depo Yöneticisi', role: 'depo_yonetici' };
const NETWORK_ERROR = { message: 'TypeError: Failed to fetch', details: '...', hint: '', code: '' };

describe('hasRole', () => {
  it('profil rolü eşleşince true döner', () => {
    expect(hasRole({ role: 'kalite_ekibi' }, 'kalite_ekibi')).toBe(true);
  });

  it('profil rolü eşleşmeyince false döner', () => {
    expect(hasRole({ role: 'depo_yonetici' }, 'kalite_ekibi')).toBe(false);
  });

  it('profil null ise false döner', () => {
    expect(hasRole(null, 'kalite_ekibi')).toBe(false);
  });
});

describe('hasAnyRole', () => {
  it('profil rolü listede varsa true döner', () => {
    expect(hasAnyRole({ role: 'admin' }, ['admin', 'depo_yonetici'])).toBe(true);
  });

  it('profil rolü listede yoksa false döner', () => {
    expect(hasAnyRole({ role: 'kalite_ekibi' }, ['admin', 'depo_yonetici'])).toBe(false);
  });

  it('profil null ise false döner', () => {
    expect(hasAnyRole(null, ['admin'])).toBe(false);
  });

  it('boş rol listesiyle her zaman false döner', () => {
    expect(hasAnyRole({ role: 'admin' }, [])).toBe(false);
  });
});

// Final review bulgusu 1 (KRİTİK): getCurrentProfile önbelleksizken, çevrimdışı bir soğuk açılış
// ya da HERHANGİ bir sayfa geçişi (her route handler ayrı ayrı çağırıyor) doğrudan main.js'in
// "Bir hata oluştu" ekranına düşüyordu — yani çevrimdışı kuyruk pratikte erişilemezdi.
describe('getCurrentProfile', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetSession.mockReset();
    mockSingle.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  });

  afterEach(() => {
    delete window.navigator.onLine;
  });

  it('oturum yoksa null doner (ag istegi yapmadan)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(getCurrentProfile()).resolves.toBeNull();
    expect(mockSingle).not.toHaveBeenCalled();
  });

  it('basarili sorguda profili doner ve kullaniciya ozel anahtarla onbellege yazar', async () => {
    mockSingle.mockResolvedValue({ data: PROFILE, error: null });
    await expect(getCurrentProfile()).resolves.toEqual(PROFILE);
    expect(JSON.parse(localStorage.getItem('cache:profile:u1'))).toEqual(PROFILE);
  });

  it('cevrimdisi (ag hatasi) durumunda onbellekteki profili doner', async () => {
    mockSingle.mockResolvedValue({ data: PROFILE, error: null });
    await getCurrentProfile(); // önce çevrimiçi bir kez yüklenmiş olsun

    mockSingle.mockResolvedValue({ data: null, error: NETWORK_ERROR });
    await expect(getCurrentProfile()).resolves.toEqual(PROFILE);
  });

  it('onbellek yokken ag hatasi firlatilir (sahte profil uydurulmaz)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: NETWORK_ERROR });
    await expect(getCurrentProfile()).rejects.toBe(NETWORK_ERROR);
  });

  it('baska kullanicinin onbellegi kullanilmaz (anahtar kullaniciya ozel)', async () => {
    localStorage.setItem('cache:profile:baska-kullanici', JSON.stringify({ id: 'x', full_name: 'X', role: 'kalite_ekibi' }));
    mockSingle.mockResolvedValue({ data: null, error: NETWORK_ERROR });
    await expect(getCurrentProfile()).rejects.toBe(NETWORK_ERROR);
  });

  it('gercek uygulama hatasinda (code dolu) onbellege dusmez, hatayi firlatir', async () => {
    mockSingle.mockResolvedValue({ data: PROFILE, error: null });
    await getCurrentProfile();

    const rlsError = { message: 'permission denied for table profiles', details: null, hint: null, code: '42501' };
    mockSingle.mockResolvedValue({ data: null, error: rlsError });
    await expect(getCurrentProfile()).rejects.toBe(rlsError);
  });
});
