const routes = new Map();
let rootContainer = null;
// navigate() render'ı senkron tetikler VE hashchange olayı da (asenkron) aynı render'ı
// tekrar tetikler; bu guard olmadan her navigate() çağrısı render fonksiyonunu iki kez
// çalıştırır. Bugün için zararsız (route handler'ları idempotent) ama Plan 3/4'te route
// handler'ları veri çekmeye (fetch) başlayınca çift render = çift istek anlamına gelir.
let lastRenderedPath = null;

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

export function _resetRoutes() {
  routes.clear();
  lastRenderedPath = null;
}

export function navigate(path) {
  window.location.hash = path;
  // hashchange olayı tarayıcılarda (ve jsdom/happy-dom'da) asenkron tetiklenir;
  // navigate() çağıranın hemen ardından güncel içeriği görmesi için burada da render ediyoruz.
  // Kullanıcının geri/ileri tuşlarıyla tetiklediği hash değişiklikleri hashchange listener'ı ile yakalanmaya devam eder.
  renderCurrent();
}

function renderCurrent() {
  if (!rootContainer) return;
  const path = window.location.hash.slice(1) || '/';
  // navigate()'in senkron çağrısı zaten bu path'i render ettiyse, hashchange olayı geldiğinde
  // (veya başka bir nedenle renderCurrent tekrar çağrıldığında) aynı path için render fonksiyonunu
  // ikinci kez çalıştırmayı atla — bkz. yukarıdaki lastRenderedPath yorumu.
  if (path === lastRenderedPath) return;
  lastRenderedPath = path;
  const renderFn = routes.get(path) || routes.get('/');
  if (renderFn) renderFn(rootContainer);
}

export function startRouter(container) {
  rootContainer = container;
  window.addEventListener('hashchange', renderCurrent);
  renderCurrent();
}
