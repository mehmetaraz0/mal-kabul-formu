import { listUsers, updateUserRole, createUser } from '../lib/users.js';
import { getCurrentProfile } from '../lib/auth.js';
import { escapeHtml } from '../lib/html.js';

const ROLE_LABELS = {
  admin: 'Admin',
  depo_yonetici: 'Depo',
  kalite_ekibi: 'Kalite Ekibi'
};

export async function renderKullanicilar(container) {
  const users = await listUsers();
  const currentProfile = await getCurrentProfile();

  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">👥 Kullanıcılar</div></div>
      <div style="overflow-x:auto;">
      <table class="card-table">
        <thead><tr><th>Ad Soyad</th><th>Rol</th></tr></thead>
        <tbody id="users-body">
          ${users
            .map(
              (u) => `
            <tr>
              <td>${escapeHtml(u.full_name)}</td>
              <td>
                ${
                  u.id === currentProfile.id
                    ? escapeHtml('Kendi hesabınız — rolünüzü buradan değiştiremezsiniz')
                    : `<select data-role-select="${escapeHtml(u.id)}">
                        ${Object.entries(ROLE_LABELS)
                          .map(([value, label]) => `<option value="${value}" ${u.role === value ? 'selected' : ''}>${label}</option>`)
                          .join('')}
                      </select>`
                }
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
      </div>
      <p id="users-msg"></p>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-header-title">➕ Yeni Kullanıcı</div></div>
      <form id="new-user-form" style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <input type="text" id="new-user-username" placeholder="Kullanıcı adı" required style="flex:1;min-width:150px;" />
        <input type="password" id="new-user-password" placeholder="Şifre" required style="flex:1;min-width:150px;" />
        <input type="text" id="new-user-fullname" placeholder="Ad Soyad" required style="flex:1;min-width:150px;" />
        <select id="new-user-role">
          ${Object.entries(ROLE_LABELS)
            .map(([value, label]) => `<option value="${value}">${label}</option>`)
            .join('')}
        </select>
        <button type="submit" class="btn-accent">Oluştur</button>
      </form>
      <p id="new-user-msg"></p>
    </div>
  `;

  container.querySelectorAll('[data-role-select]').forEach((select) => {
    select.addEventListener('change', async () => {
      const msg = container.querySelector('#users-msg');
      msg.textContent = '';
      try {
        await updateUserRole(select.dataset.roleSelect, select.value);
        msg.style.color = 'var(--color-success-text)';
        msg.textContent = 'Rol güncellendi.';
      } catch (err) {
        msg.style.color = 'var(--color-danger-text)';
        msg.textContent = 'Hata: ' + err.message;
      }
    });
  });

  container.querySelector('#new-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = container.querySelector('#new-user-msg');
    msg.textContent = '';
    const username = container.querySelector('#new-user-username').value.trim();
    const password = container.querySelector('#new-user-password').value;
    const fullName = container.querySelector('#new-user-fullname').value.trim();
    const role = container.querySelector('#new-user-role').value;
    try {
      await createUser({ username, password, fullName, role });
      msg.style.color = 'var(--color-success-text)';
      msg.textContent = 'Kullanıcı oluşturuldu.';
      await renderKullanicilar(container);
    } catch (err) {
      msg.style.color = 'var(--color-danger-text)';
      msg.textContent = 'Hata: ' + err.message;
    }
  });
}
