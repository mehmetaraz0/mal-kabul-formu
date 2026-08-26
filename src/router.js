const routes = new Map();
let rootContainer = null;

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

export function _resetRoutes() {
  routes.clear();
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
  const renderFn = routes.get(path) || routes.get('/');
  if (renderFn) renderFn(rootContainer);
}

export function startRouter(container) {
  rootContainer = container;
  window.addEventListener('hashchange', renderCurrent);
  renderCurrent();
}
