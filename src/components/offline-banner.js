// `renderApp()` in main.js calls `renderOfflineBanner(app)` on every render (login branch,
// success branch, and the error-catch branch), and each of those renders replaces
// `app.innerHTML`, which detaches whatever banner element was previously prepended.
// So we must create a fresh <div> and re-prepend it on every call — but we must NOT
// re-register `window.addEventListener('online'/'offline', ...)` on every call, or repeated
// renderApp() runs (e.g. via onAuthStateChange firing more than once) would pile up duplicate
// listeners, each one live forever since `window` is never torn down. We solve this by keeping
// the "current" banner element in module state and only ever attaching the listeners once;
// they always operate on whichever banner element is currently in the DOM.
let currentBannerEl = null;
let listenersRegistered = false;

function updateBanner() {
  if (!currentBannerEl) return;
  const offline = !navigator.onLine;
  currentBannerEl.style.display = offline ? 'block' : 'none';
  currentBannerEl.textContent = 'Çevrimdışısınız — mal kabul kayıtları cihazda bekletilecek.';
}

export function renderOfflineBanner(container) {
  const el = document.createElement('div');
  el.id = 'offline-banner';
  el.style.cssText = 'display:none;background:#b00020;color:white;text-align:center;padding:0.4rem;font-size:0.9rem;';
  container.prepend(el);

  currentBannerEl = el;

  if (!listenersRegistered) {
    window.addEventListener('online', updateBanner);
    window.addEventListener('offline', updateBanner);
    listenersRegistered = true;
  }

  updateBanner();
}
