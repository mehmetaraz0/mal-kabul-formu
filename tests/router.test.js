import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerRoute, navigate, startRouter, resetRoutes, getQueryParam } from '../src/router.js';

describe('router', () => {
  beforeEach(() => {
    resetRoutes();
    window.location.hash = '';
  });

  it('kayıtlı rota render fonksiyonunu çağırır', () => {
    const container = document.createElement('div');
    const renderFn = vi.fn();
    registerRoute('/test', renderFn);
    startRouter(container);
    navigate('/test');
    expect(renderFn).toHaveBeenCalledWith(container);
  });

  it('bilinmeyen rota için varsayılan rotaya döner', () => {
    const container = document.createElement('div');
    const homeFn = vi.fn();
    registerRoute('/', homeFn);
    startRouter(container);
    navigate('/olmayan-rota');
    expect(homeFn).toHaveBeenCalled();
  });

  it('navigate() sonrası aynı path için render fonksiyonu ikinci kez çağrılmaz', () => {
    // navigate() render'ı senkron tetikler; gerçek tarayıcıda (ve jsdom/happy-dom'da) hashchange
    // olayı aynı değişiklik için ayrıca asenkron tetiklenir. Bu test, o olay geldiğinde
    // render fonksiyonunun tekrar çağrılmadığını doğrular (bkz. router.js lastRenderedPath guard).
    const container = document.createElement('div');
    const renderFn = vi.fn();
    registerRoute('/test', renderFn);
    startRouter(container);
    navigate('/test');
    expect(renderFn).toHaveBeenCalledTimes(1);
    // Tarayıcının navigate()'ten sonra sırayla göndereceği asenkron hashchange olayını simüle et.
    window.dispatchEvent(new Event('hashchange'));
    expect(renderFn).toHaveBeenCalledTimes(1);
  });

  it('startRouter farklı bir container ile tekrar çağrıldığında yeniden render eder (çıkış/tekrar giriş senaryosu)', () => {
    const container1 = document.createElement('div');
    const container2 = document.createElement('div');
    const renderFn = vi.fn();
    registerRoute('/firmalar', renderFn);
    window.location.hash = '/firmalar';

    startRouter(container1);
    expect(renderFn).toHaveBeenCalledTimes(1);
    expect(renderFn).toHaveBeenLastCalledWith(container1);

    startRouter(container2);
    expect(renderFn).toHaveBeenCalledTimes(2);
    expect(renderFn).toHaveBeenLastCalledWith(container2);
  });

  it('navigate("/") location.hash zaten boşken (ilk yükleme) render fonksiyonunu iki kez çağırmaz', () => {
    // location.hash === '' iken navigate('/') çağrıldığında normalize edilmiş path karşılaştırması
    // ('/' === '/') bir değişiklik göremez, ama window.location.hash = '/' ataması gerçek hash'i
    // '' -> '#/' olarak DEĞİŞTİRİR ve gerçek bir hashchange olayı fırlatır. navigate() artık
    // atamadan önce/sonra GÖZLEMLENEN hash değerini karşılaştırıyor, path string'i tahmin etmiyor.
    const container = document.createElement('div');
    const homeFn = vi.fn();
    // Rota, startRouter()'dan SONRA kaydediliyor ki startRouter'ın kendi ilk renderCurrent()
    // çağrısı (hash boşken varsayılan '/' rotasına düşer) henüz eşleşen bir renderFn bulamasın —
    // böylece aşağıdaki sayaç sadece navigate('/') çağrısının etkisini ölçer.
    startRouter(container);
    registerRoute('/', homeFn);
    navigate('/');
    expect(homeFn).toHaveBeenCalledTimes(1);
    // Tarayıcının navigate()'ten sonra sırayla göndereceği asenkron hashchange olayını simüle et.
    window.dispatchEvent(new Event('hashchange'));
    expect(homeFn).toHaveBeenCalledTimes(1);
  });

  it('query string içeren bir path\'e navigate edildiğinde kayıtlı rota yine de eşleşir ve render fonksiyonu çağrılır', () => {
    // renderCurrent artık route lookup için sadece path kısmını kullanıyor (query değil),
    // bu yüzden '/some-route?foo=bar' hâlâ '/some-route' rotasına eşleşmeli.
    const container = document.createElement('div');
    const renderFn = vi.fn();
    registerRoute('/some-route', renderFn);
    startRouter(container);
    navigate('/some-route?foo=bar');
    expect(renderFn).toHaveBeenCalledWith(container);
  });

  it('resetRoutes() sonrası eski (rol bazlı) rotalar artık erişilemez, ana rotaya düşer', () => {
    const container = document.createElement('div');
    const adminOnlyFn = vi.fn();
    const homeFn = vi.fn();
    registerRoute('/', homeFn);
    registerRoute('/kullanicilar', adminOnlyFn);
    startRouter(container);

    resetRoutes();
    registerRoute('/', homeFn);
    // '/kullanicilar' bilerek tekrar kaydedilmiyor — bir önceki kullanıcı admin'di,
    // yenisi değil (main.js'teki role-koşullu registerRoute çağrısının simülasyonu).

    navigate('/kullanicilar');
    expect(homeFn).toHaveBeenCalled();
    expect(adminOnlyFn).not.toHaveBeenCalled();
  });
});

describe('getQueryParam', () => {
  beforeEach(() => {
    resetRoutes();
    window.location.hash = '';
  });

  it('hash içindeki query stringden değeri okur', () => {
    window.location.hash = '/mal-kabul-ciktisi?id=abc-123';
    expect(getQueryParam('id')).toBe('abc-123');
  });

  it('query string yoksa null döner', () => {
    window.location.hash = '/mal-kabul-ciktisi';
    expect(getQueryParam('id')).toBeNull();
  });
});
