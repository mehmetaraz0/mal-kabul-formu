// `renderApp()` in main.js calls `renderOfflineBanner(app)` on every render (login branch,
// success branch, and the error-catch branch), and each of those renders replaces
// `app.innerHTML`, which detaches whatever banner element was previously prepended.
// So we must create a fresh <div> and re-prepend it on every call — but we must NOT
// re-register `window.addEventListener('online'/'offline', ...)` on every call, or repeated
// renderApp() runs (e.g. via onAuthStateChange firing more than once) would pile up duplicate
// listeners, each one live forever since `window` is never torn down. We solve this by keeping
// the "current" banner element in module state and only ever attaching the listeners once;
// they always operate on whichever banner element is currently in the DOM.
import { listQueuedReceipts } from '../lib/offline-queue.js';

let currentBannerEl = null;
let listenersRegistered = false;

async function updateBanner() {
  if (!currentBannerEl) return;
  const offline = !navigator.onLine;

  // Bekleyen kayıt sayısı — final review bulgusu 4: bu banner'ın "N kayıt senkronize
  // edilecek" göstermesi planın orijinal dosya-yapısı yorumunda vardı ama hiç uygulanmamıştı.
  // listQueuedReceipts idb-keyval'den okur; IndexedDB erişilemezse (ör. bazı gizli/özel
  // tarayıcı modları) banner'ın kendisi çökmesin diye savunmacı bir catch var.
  let pending = 0;
  try {
    pending = (await listQueuedReceipts()).length;
  } catch {
    pending = 0;
  }

  // Elden kaçırdığımız bir render sırasında currentBannerEl başka bir renderOfflineBanner
  // çağrısıyla değişmiş olabilir (bu fonksiyon async, await sırasında araya girebilir) —
  // güncel elemente yazdığımızdan emin olmak için tekrar kontrol ediyoruz.
  if (!currentBannerEl) return;

  if (!offline && pending === 0) {
    currentBannerEl.style.display = 'none';
    return;
  }

  currentBannerEl.style.display = 'block';
  currentBannerEl.style.background = offline ? '#b00020' : '#a15c00';
  if (offline) {
    currentBannerEl.textContent = pending > 0
      ? `Çevrimdışısınız — ${pending} kayıt senkronize edilecek.`
      : 'Çevrimdışısınız — mal kabul kayıtları cihazda bekletilecek.';
  } else {
    currentBannerEl.textContent = `${pending} kayıt senkronize edilecek...`;
  }
}

export function renderOfflineBanner(container) {
  const el = document.createElement('div');
  el.id = 'offline-banner';
  el.style.cssText = 'display:none;color:white;text-align:center;padding:0.4rem;font-size:0.9rem;';
  container.prepend(el);

  currentBannerEl = el;

  if (!listenersRegistered) {
    window.addEventListener('online', updateBanner);
    window.addEventListener('offline', updateBanner);
    listenersRegistered = true;
  }

  updateBanner();
}

// main.js'in senkron denemesinden (trySync) sonra çağırdığı, ve yeni-kabul.js'in bir kaydı
// kuyruğa yazdıktan hemen sonra çağırdığı manuel yenileme — aksi halde kullanıcı, banner'daki
// "N kayıt senkronize edilecek" sayısının IndexedDB'nin güncel haliyle eşleşmesi için bir
// sonraki `online`/`offline` event'ine kadar beklemek zorunda kalırdı.
export function refreshOfflineBanner() {
  return updateBanner();
}
