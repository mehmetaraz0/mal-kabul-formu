import './style-print.css';
import { getCurrentProfile, onAuthStateChange, signOut } from './lib/auth.js';
import { renderLogin } from './pages/login.js';
import { renderFirmalar } from './pages/firmalar.js';
import { renderUrunler } from './pages/urunler.js';
import { renderYeniKabul } from './pages/yeni-kabul.js';
import { renderKaliteOnay } from './pages/kalite-onay.js';
import { renderArama } from './pages/arama.js';
import { renderMalKabulCiktisi } from './pages/mal-kabul-ciktisi.js';
import { escapeHtml } from './lib/html.js';
import { registerRoute, startRouter, navigate } from './router.js';

const app = document.querySelector('#app');

async function renderApp() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      renderLogin(app, renderApp);
      return;
    }
    app.innerHTML = `
      <header style="display:flex;justify-content:space-between;padding:1rem;background:#1e3a5f;color:white;">
        <span>${escapeHtml(profile.full_name)} (${escapeHtml(profile.role)})</span>
        <button id="logout-btn">Çıkış</button>
      </header>
      <nav style="display:flex;gap:0.5rem;padding:0.5rem 1rem;background:#e9ecef;flex-wrap:wrap;">
        <button data-nav="/">Ana Sayfa</button>
        <button data-nav="/firmalar">Firmalar</button>
        <button data-nav="/urunler">Ürünler</button>
        ${profile.role === 'depo_yonetici' ? '<button data-nav="/yeni-kabul">Yeni Mal Kabul</button>' : ''}
        ${profile.role === 'kalite_ekibi' ? '<button data-nav="/kalite-onay">Kalite Onayı</button>' : ''}
        <button data-nav="/arama">Kayıt Ara</button>
      </nav>
      <main id="page-content" style="padding:1rem;"></main>
    `;
    app.querySelector('#logout-btn').addEventListener('click', async () => {
      await signOut();
      renderApp();
    });
    app.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.nav));
    });

    const pageContent = app.querySelector('#page-content');
    registerRoute('/', (c) => {
      // Ana sayfadaki kısayol da nav ile aynı role kuralına tabi.
      if (profile.role !== 'depo_yonetici') {
        c.innerHTML = '';
        return;
      }
      c.innerHTML = '<p><button data-nav="/yeni-kabul">+ Yeni Mal Kabul</button></p>';
      c.querySelector('[data-nav]').addEventListener('click', () => navigate('/yeni-kabul'));
    });
    registerRoute('/firmalar', renderFirmalar);
    registerRoute('/urunler', renderUrunler);
    registerRoute('/yeni-kabul', renderYeniKabul);
    registerRoute('/kalite-onay', renderKaliteOnay);
    registerRoute('/arama', renderArama);
    registerRoute('/mal-kabul-ciktisi', renderMalKabulCiktisi);
    startRouter(pageContent);
  } catch (err) {
    app.innerHTML = `<p style="color:#b00020;padding:1rem;">Bir hata oluştu: ${escapeHtml(err.message)}</p>`;
  }
}

onAuthStateChange(() => renderApp());
renderApp();
