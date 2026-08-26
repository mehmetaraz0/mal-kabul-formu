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
});
