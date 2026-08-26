import { signIn } from '../lib/auth.js';

export function renderLogin(container, onSuccess) {
  container.innerHTML = `
    <form id="login-form" style="max-width:320px;margin:4rem auto;display:flex;flex-direction:column;gap:0.75rem;">
      <h1>Mal Kabul Formu</h1>
      <input type="email" id="login-email" placeholder="E-posta" required />
      <input type="password" id="login-password" placeholder="Şifre" required />
      <button type="submit">Giriş Yap</button>
      <p id="login-error" style="color:#b00020;"></p>
    </form>
  `;

  container.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = container.querySelector('#login-email').value.trim();
    const password = container.querySelector('#login-password').value;
    const errorEl = container.querySelector('#login-error');
    errorEl.textContent = '';
    try {
      await signIn(email, password);
      onSuccess();
    } catch (err) {
      errorEl.textContent = 'Giriş başarısız: ' + err.message;
    }
  });
}
