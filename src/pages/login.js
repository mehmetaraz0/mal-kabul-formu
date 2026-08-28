import { signIn } from '../lib/auth.js';

const EMAIL_DOMAIN = '@malkabul.local';

export function renderLogin(container, onSuccess) {
  container.innerHTML = `
    <form id="login-form" class="card" style="max-width:340px;margin:4rem auto;display:flex;flex-direction:column;gap:0.9rem;">
      <h1 style="text-align:center;">Mal Kabul Formu</h1>
      <input type="text" id="login-username" placeholder="Kullanıcı Adı" required autocomplete="username" />
      <input type="password" id="login-password" placeholder="Şifre" required autocomplete="current-password" />
      <button type="submit">Giriş Yap</button>
      <p id="login-error" style="color:var(--color-danger-text);margin:0;"></p>
    </form>
  `;

  container.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = container.querySelector('#login-username').value.trim().toLowerCase();
    const password = container.querySelector('#login-password').value;
    const errorEl = container.querySelector('#login-error');
    errorEl.textContent = '';
    try {
      await signIn(username + EMAIL_DOMAIN, password);
      onSuccess();
    } catch (err) {
      errorEl.textContent = 'Giriş başarısız: ' + err.message;
    }
  });
}
