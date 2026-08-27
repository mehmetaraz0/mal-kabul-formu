import { escapeHtml } from './lib/html.js';

const routes = new Map();
let rootContainer = null;
let suppressNextHashChange = false;
let renderGeneration = 0;

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

export function _resetRoutes() {
  routes.clear();
  suppressNextHashChange = false;
}

export function navigate(path) {
  const current = window.location.hash.slice(1) || '/';
  if (path !== current) suppressNextHashChange = true;
  window.location.hash = path;
  renderCurrent();
}

function onHashChange() {
  if (suppressNextHashChange) {
    suppressNextHashChange = false;
    return;
  }
  renderCurrent();
}

function renderCurrent() {
  if (!rootContainer) return;
  const path = window.location.hash.slice(1) || '/';
  const renderFn = routes.get(path) || routes.get('/');
  if (!renderFn) return;
  const container = rootContainer;
  const myGeneration = ++renderGeneration;
  Promise.resolve(renderFn(container)).catch((err) => {
    if (myGeneration !== renderGeneration) return; // bu render artık eski, ekrana yazma
    container.innerHTML = `<p style="color:#b00020;padding:1rem;">Bir hata oluştu: ${escapeHtml(err.message)}</p>`;
  });
}

export function startRouter(container) {
  rootContainer = container;
  window.addEventListener('hashchange', onHashChange);
  renderCurrent();
}
