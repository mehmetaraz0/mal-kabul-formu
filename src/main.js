import './style-print.css';
import { getCurrentProfile, onAuthStateChange, signOut } from './lib/auth.js';
import { hasAnyRole } from './lib/role.js';
import { renderLogin } from './pages/login.js';
import { renderFirmalar } from './pages/firmalar.js';
import { renderKullanicilar } from './pages/kullanicilar.js';
import { renderUrunler } from './pages/urunler.js';
import { renderYeniKabul } from './pages/yeni-kabul.js';
import { renderArama } from './pages/arama.js';
import { renderIstatistik } from './pages/istatistik.js';
import { renderMalKabulCiktisi } from './pages/mal-kabul-ciktisi.js';
import { escapeHtml } from './lib/html.js';
import { registerRoute, startRouter, navigate, resetRoutes } from './router.js';
import { renderOfflineBanner, refreshOfflineBanner } from './components/offline-banner.js';
import { syncQueuedReceipts } from './lib/offline-queue.js';
import { registerSW } from 'virtual:pwa-register';

const app = document.querySelector('#app');

// Aktif nav pill'ini `location.hash`e göre işaretler. Modül seviyesinde TEK bir fonksiyon
// referansı olduğu için `window.addEventListener('hashchange', updateActiveNav)` her
// renderApp() çağrısında tekrar eklense bile tarayıcı aynı referansı dedup eder (router.js'in
// kendi hashchange dinleyicisiyle aynı, kanıtlanmış desen) — biriken dinleyici riski yok.
function updateActiveNav() {
  const current = window.location.hash.slice(1) || '/';
  app.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === current);
  });
}
window.addEventListener('hashchange', updateActiveNav);

// Yeni bir sürüm yayına alındığında kullanıcıya gösterilen güncelleme çubuğu.
// `#app` yerine doğrudan `document.body`'ye ekleniyor: renderApp() her çalıştığında
// `app.innerHTML`'i tamamen değiştiriyor ve içine eklenmiş her şeyi koparıyor (offline-banner'ın
// her render'da yeniden prepend edilmesinin sebebi de bu) — güncelleme çubuğu ise service worker
// olayına bağlı, render döngüsünden bağımsız yaşamalı.
function showUpdatePrompt(onAccept) {
  if (document.getElementById('sw-update-prompt')) return;
  const bar = document.createElement('div');
  bar.id = 'sw-update-prompt';
  bar.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#1e3a5f;color:white;' +
    'padding:0.6rem 1rem;display:flex;gap:0.75rem;align-items:center;justify-content:center;' +
    'flex-wrap:wrap;font-size:0.9rem;';

  const label = document.createElement('span');
  label.textContent = 'Yeni sürüm mevcut.';

  const refreshBtn = document.createElement('button');
  refreshBtn.id = 'sw-update-refresh';
  refreshBtn.textContent = 'Yenile';
  refreshBtn.addEventListener('click', () => {
    bar.remove();
    onAccept();
  });

  const laterBtn = document.createElement('button');
  laterBtn.id = 'sw-update-later';
  laterBtn.textContent = 'Daha sonra';
  laterBtn.addEventListener('click', () => bar.remove());

  bar.append(label, refreshBtn, laterBtn);
  document.body.appendChild(bar);
}

// registerType artık 'autoUpdate' değil 'prompt' (bkz. vite.config.js): 'autoUpdate' yeni bir
// deploy geldiğinde sayfayı HABERSİZCE yeniliyordu — mal kabul formunun taslak kalıcılığı
// olmadığı için, tabletinde formu doldurmakta olan bir depo yöneticisi girdiği tüm satırları
// kaybedebilirdi. Artık güncelleme kullanıcı "Yenile"ye basana kadar beklemede kalıyor.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    showUpdatePrompt(() => updateSW(true));
  }
});

// Çevrimdışı kuyruktaki (idb-keyval) bekleyen mal kabul kayıtlarını göndermeyi dener.
// syncQueuedReceipts kendi içinde her kayıt için ayrı ayrı try/catch yapar ve asla reject
// olmaz (bkz. offline-queue.js) — yine de idb-keyval'in kendisi (ör. IndexedDB devre dışıysa)
// hata fırlatabileceğinden burada da savunmacı bir catch var; bu senkron denemesi hiçbir zaman
// sayfa render'ını veya login akışını bozmamalı.
async function trySync() {
  if (!navigator.onLine) return;
  try {
    const { synced, failed, skipped, deferred } = await syncQueuedReceipts();
    if (synced > 0) console.info(`${synced} bekleyen mal kabul kaydı senkronize edildi.`);
    if (failed > 0) console.warn(`${failed} kayıt senkronize edilemedi, tekrar denenecek.`);
    if (skipped > 0) console.info(`${skipped} kayıt başka bir kullanıcıya ait olduğu için bu turda atlandı.`);
    if (deferred > 0) console.info(`${deferred} kayıt geri çekilme penceresi dolmadığı için bu turda ertelendi.`);
  } catch (err) {
    console.warn('Kuyruk senkronizasyonu sırasında beklenmeyen hata:', err.message);
  } finally {
    // Senkron denemesinin sonucu ne olursa olsun (0 senkron edilmiş olsa bile) banner'daki
    // bekleyen kayıt sayısının güncel kalması için (final review bulgusu 4).
    refreshOfflineBanner();
  }
}

// 'online' event'i giriş yapılmamışken de tetiklenebilir (ör. login ekranındayken bağlantı
// geri gelirse) — bu durumda syncQueuedReceipts'in RPC çağrısı auth olmadığı için başarısız
// olur, kayıt kuyrukta kalır ve bir sonraki denemede (login sonrası renderApp veya bir sonraki
// online event'i) tekrar denenir. Zararsız, sadece gecikmeli bir retry.
window.addEventListener('online', trySync);

// PERİYODİK YEDEK TETİKLEYİCİ (final review bulgusu 3). `navigator.onLine` yalnızca ağ
// ARAYÜZÜNÜN "yukarıda" olduğunu söyler, karşı tarafa GERÇEKTEN erişilebildiğini değil: depo
// wifi'sine bağlı ama internet/Supabase'e ulaşamayan bir tablette fetch başarısız olur, kayıt
// kuyruğa girer — ama arayüz hiç düşmediği için `offline`/`online` event çifti HİÇ tetiklenmez ve
// kayıt asla yeniden denenmezdi. 30 saniyelik bu periyot o boşluğu kapatıyor. Yığılma riski yok:
// trySync çevrimdışıyken hemen dönüyor, syncQueuedReceipts'in in-flight bayrağı eşzamanlı ikinci
// bir turu no-op yapıyor ve kalıcı uygulama hataları offline-queue.js'teki üstel geri çekilmeye
// takılıyor (yani aynı bozuk kayıt 30 saniyede bir sunucuya gitmiyor).
const SYNC_INTERVAL_MS = 30_000;
setInterval(trySync, SYNC_INTERVAL_MS);

async function renderApp() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      renderLogin(app, renderApp);
      renderOfflineBanner(app);
      return;
    }
    const canManageCatalog = hasAnyRole(profile, ['admin', 'depo_yonetici']);
    const canCreateReceipt = hasAnyRole(profile, ['depo_yonetici']);
    const isAdmin = hasAnyRole(profile, ['admin']);

    app.innerHTML = `
      <header class="app-topbar">
        <span class="app-topbar-title">Mal Kabul Formu</span>
        <span>
          <span class="app-topbar-user">${escapeHtml(profile.full_name)} (${escapeHtml(profile.role)})</span>
          <button id="logout-btn" class="btn-ghost">Çıkış</button>
        </span>
      </header>
      <nav class="app-subnav">
        <button class="pill-tab" data-nav="/">Ana Sayfa</button>
        ${canManageCatalog ? '<button class="pill-tab" data-nav="/firmalar">Firmalar</button>' : ''}
        ${canManageCatalog ? '<button class="pill-tab" data-nav="/urunler">Ürünler</button>' : ''}
        ${canCreateReceipt ? '<button class="pill-tab" data-nav="/yeni-kabul">Yeni Mal Kabul</button>' : ''}
        <button class="pill-tab" data-nav="/arama">Kayıt Ara</button>
        <button class="pill-tab" data-nav="/istatistik">İstatistik</button>
        ${isAdmin ? '<button class="pill-tab" data-nav="/kullanicilar">Kullanıcılar</button>' : ''}
      </nav>
      <main id="page-content" style="padding:1.25rem;"></main>
    `;
    renderOfflineBanner(app);
    // Uygulama açılışında (ve her başarılı auth state değişiminde, ör. login sonrası) kuyrukta
    // bekleyen kayıt var mı diye bir kez dene — render'ı bloklamasın diye await edilmiyor.
    trySync();
    app.querySelector('#logout-btn').addEventListener('click', async () => {
      await signOut();
      renderApp();
    });
    app.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.nav));
    });

    const pageContent = app.querySelector('#page-content');
    resetRoutes();
    registerRoute('/', (c) => {
      c.innerHTML = canCreateReceipt
        ? '<p><button class="btn-accent" data-nav="/yeni-kabul">+ Yeni Mal Kabul</button></p>'
        : '<p>Hoş geldiniz.</p>';
      const btn = c.querySelector('[data-nav]');
      if (btn) btn.addEventListener('click', () => navigate('/yeni-kabul'));
    });
    if (canManageCatalog) registerRoute('/firmalar', renderFirmalar);
    if (canManageCatalog) registerRoute('/urunler', renderUrunler);
    if (canCreateReceipt) registerRoute('/yeni-kabul', renderYeniKabul);
    registerRoute('/arama', renderArama);
    registerRoute('/istatistik', renderIstatistik);
    registerRoute('/mal-kabul-ciktisi', renderMalKabulCiktisi);
    if (isAdmin) registerRoute('/kullanicilar', renderKullanicilar);
    startRouter(pageContent);
    updateActiveNav();
  } catch (err) {
    app.innerHTML = `<p style="color:#b00020;padding:1rem;">Bir hata oluştu: ${escapeHtml(err.message)}</p>`;
    // renderApp() en çok tam da çevrimdışıyken hata verebilir (ör. profil sorgusu ağ
    // hatasıyla patlarsa) — bu yüzden hata ekranında da banner'ın kaybolmaması önemli.
    renderOfflineBanner(app);
  }
}

onAuthStateChange(() => renderApp());
renderApp();
