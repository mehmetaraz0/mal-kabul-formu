import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerRoute, navigate, startRouter, _resetRoutes } from '../src/router.js';

describe('router', () => {
  beforeEach(() => {
    _resetRoutes();
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
});
