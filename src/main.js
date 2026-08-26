import { getCurrentProfile, onAuthStateChange, signOut } from './lib/auth.js';
import { renderLogin } from './pages/login.js';

const app = document.querySelector('#app');

async function renderApp() {
  const profile = await getCurrentProfile();
  if (!profile) {
    renderLogin(app, renderApp);
    return;
  }
  app.innerHTML = `
    <header style="display:flex;justify-content:space-between;padding:1rem;background:#1e3a5f;color:white;">
      <span>${profile.full_name} (${profile.role})</span>
      <button id="logout-btn">Çıkış</button>
    </header>
    <main style="padding:1rem;">Ana sayfa — sonraki planlarda doldurulacak.</main>
  `;
  app.querySelector('#logout-btn').addEventListener('click', async () => {
    await signOut();
    renderApp();
  });
}

onAuthStateChange(() => renderApp());
renderApp();
