import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock çağrıları dosyanın tepesine "hoist" edilir; factory'de referans verilen değişken
// vi.hoisted() ile tanımlanmalı (offline-queue.test.js/yeni-kabul.test.js ile aynı desen).
const { listQueuedReceipts } = vi.hoisted(() => ({ listQueuedReceipts: vi.fn() }));
vi.mock('../src/lib/offline-queue.js', () => ({ listQueuedReceipts }));

import { renderOfflineBanner, refreshOfflineBanner } from '../src/components/offline-banner.js';

// jsdom'da navigator.onLine Navigator.prototype üzerinde salt-okunur bir getter'dır; testte
// kontrol edebilmek için navigator ÖRNEĞİ üzerinde kendi (configurable) getter'ımızı tanımlıyoruz.
function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

function entry(overrides = {}) {
  return {
    clientUuid: 'c1',
    payload: { companyId: 1, items: [] },
    sendToQuality: false,
    queuedAt: '2026-08-28T10:00:00.000Z',
    attempts: 0,
    lastError: null,
    lastErrorKind: null,
    nextAttemptAt: null,
    ...overrides
  };
}

describe('offline-banner', () => {
  let container;

  beforeEach(() => {
    vi.clearAllMocks();
    listQueuedReceipts.mockResolvedValue([]);
    setOnline(true);
    document.body.innerHTML = '<div id="app"></div>';
    container = document.querySelector('#app');
  });

  afterEach(() => {
    delete window.navigator.onLine;
    document.body.innerHTML = '';
  });

  async function render() {
    renderOfflineBanner(container);
    // renderOfflineBanner içindeki updateBanner async ve await edilmiyor (render'ı bloklamasın
    // diye) — testte metnin yazılmış olduğundan emin olmak için manuel olarak bir tur bekliyoruz.
    await refreshOfflineBanner();
    return container.querySelector('#offline-banner');
  }

  it('banner container in EN BASINA eklenir', async () => {
    container.innerHTML = '<p id="mevcut-icerik">x</p>';
    const el = await render();
    expect(container.firstElementChild).toBe(el);
  });

  it('cevrimici ve bekleyen kayit yokken gizlidir', async () => {
    const el = await render();
    expect(el.style.display).toBe('none');
  });

  it('cevrimdisi ve bekleyen kayit yokken bilgilendirme gosterir', async () => {
    setOnline(false);
    const el = await render();
    expect(el.style.display).toBe('block');
    expect(el.textContent).toContain('Çevrimdışısınız');
    expect(el.textContent).toContain('cihazda bekletilecek');
  });

  it('cevrimdisi ve bekleyen kayit varken sayiyi gosterir', async () => {
    setOnline(false);
    listQueuedReceipts.mockResolvedValue([entry({ clientUuid: 'c1' }), entry({ clientUuid: 'c2' })]);
    const el = await render();
    expect(el.textContent).toContain('2 kayıt senkronize edilecek');
  });

  it('cevrimici ama bekleyen kayit varken senkron bilgisi gosterir', async () => {
    listQueuedReceipts.mockResolvedValue([entry()]);
    const el = await render();
    expect(el.style.display).toBe('block');
    expect(el.textContent).toContain('1 kayıt senkronize edilecek');
  });

  // Final review bulgusu 4'ün asıl bar'ı: lastError Task 3'ten beri saklanıyordu ama hiçbir
  // yerde KULLANICIYA gösterilmiyordu.
  it('bekleyen kaydin lastError i banner da gorunur', async () => {
    listQueuedReceipts.mockResolvedValue([
      entry({ attempts: 2, lastError: 'TypeError: Failed to fetch', lastErrorKind: 'network' })
    ]);
    const el = await render();
    expect(el.textContent).toContain('son hata:');
    expect(el.textContent).toContain('Failed to fetch');
  });

  it('kalici (application) hatada uyari metni ve kirmizi zemin gosterir', async () => {
    listQueuedReceipts.mockResolvedValue([
      entry({
        attempts: 4,
        lastError: 'insert or update on table "receipt_items" violates foreign key constraint',
        lastErrorKind: 'application'
      })
    ]);
    const el = await render();
    expect(el.textContent).toContain('Bir kayıt gönderilemiyor');
    expect(el.textContent).toContain('4 deneme');
    expect(el.textContent).toContain('foreign key');
    expect(el.style.background).toContain('var(--color-danger-text)');
  });

  it('birden fazla hatali kayitta kalici (application) hatayi onceliklendirir', async () => {
    listQueuedReceipts.mockResolvedValue([
      entry({ clientUuid: 'c1', attempts: 1, lastError: 'FK ihlali', lastErrorKind: 'application' }),
      entry({ clientUuid: 'c2', attempts: 1, lastError: 'Failed to fetch', lastErrorKind: 'network' })
    ]);
    const el = await render();
    expect(el.textContent).toContain('FK ihlali');
    expect(el.textContent).not.toContain('Failed to fetch');
  });

  it('cok uzun hata mesajini kisaltir', async () => {
    listQueuedReceipts.mockResolvedValue([
      entry({ attempts: 1, lastError: 'x'.repeat(400), lastErrorKind: 'network' })
    ]);
    const el = await render();
    expect(el.textContent).toContain('…');
    expect(el.textContent.length).toBeLessThan(220);
  });

  it('hata mesaji HTML olarak degil duz metin olarak yazilir (XSS yok)', async () => {
    listQueuedReceipts.mockResolvedValue([
      entry({ attempts: 1, lastError: '<img src=x onerror=alert(1)>', lastErrorKind: 'application' })
    ]);
    const el = await render();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('listQueuedReceipts patlarsa banner cokmez (IndexedDB devre disi senaryosu)', async () => {
    setOnline(false);
    listQueuedReceipts.mockRejectedValue(new Error('IndexedDB kapalı'));
    const el = await render();
    expect(el.style.display).toBe('block');
    expect(el.textContent).toContain('Çevrimdışısınız');
  });

  it('tekrarlanan renderOfflineBanner cagrilari window listener larini cogaltmaz', async () => {
    // Not: listener'lar modül seviyesinde bir bayrakla YALNIZCA BİR KEZ kaydedilir; bu test
    // dosyasında daha önceki testler zaten en az bir render yaptığı için, buradaki yeni
    // render'ların HİÇ yeni listener eklememesi beklenir.
    const spy = vi.spyOn(window, 'addEventListener');
    await render();
    await render();
    const onlineListeners = spy.mock.calls.filter(([type]) => type === 'online' || type === 'offline');
    expect(onlineListeners).toHaveLength(0);
    spy.mockRestore();
  });

  it('yeniden render sonrasi refreshOfflineBanner EN GUNCEL elemente yazar', async () => {
    listQueuedReceipts.mockResolvedValue([entry()]);
    await render();
    // renderApp() gibi container'ı sıfırlayan bir yeniden render simülasyonu
    container.innerHTML = '';
    const el = await render();
    expect(el.textContent).toContain('1 kayıt senkronize edilecek');
    expect(container.querySelectorAll('#offline-banner')).toHaveLength(1);
  });
});
