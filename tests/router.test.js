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
});
