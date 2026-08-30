import { describe, it, expect, vi, beforeEach } from 'vitest';

const { listUsers, updateUserRole, createUser, getCurrentProfile } = vi.hoisted(() => ({
  listUsers: vi.fn(),
  updateUserRole: vi.fn(),
  createUser: vi.fn(),
  getCurrentProfile: vi.fn()
}));

vi.mock('../src/lib/users.js', () => ({ listUsers, updateUserRole, createUser }));
vi.mock('../src/lib/auth.js', () => ({ getCurrentProfile }));

import { renderKullanicilar } from '../src/pages/kullanicilar.js';

async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('kullanicilar sayfası', () => {
  let container;

  beforeEach(async () => {
    vi.clearAllMocks();
    listUsers.mockResolvedValue([
      { id: 'u1', full_name: 'Depo Kişisi', role: 'depo_yonetici' },
      { id: 'u2', full_name: 'Kalite Kişisi', role: 'kalite_ekibi' }
    ]);
    getCurrentProfile.mockResolvedValue({ id: 'u1', full_name: 'Depo Kişisi', role: 'depo_yonetici' });
    container = document.createElement('div');
    document.body.appendChild(container);
    await renderKullanicilar(container);
  });

  it('mevcut kullanıcının kendi satırında rol select\'i gösterilmez, diğer kullanıcılarda gösterilir', () => {
    expect(container.querySelector('[data-role-select="u1"]')).toBeNull();
    expect(container.querySelector('[data-role-select="u2"]')).not.toBeNull();
  });

  it('kullanıcı listesini ad-soyad ve rolüyle gösterir', () => {
    const rows = container.querySelectorAll('#users-body tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Depo Kişisi');
  });

  it('rol değiştirildiğinde updateUserRole doğru kullanıcı id ve yeni rolle çağrılır', async () => {
    // u1, mevcut kullanıcı (getCurrentProfile mock'u) olduğu için artık kendi satırında select
    // yok (bkz. yukarıdaki test) — bu yüzden burada u2 üzerinden test ediliyor.
    const select = container.querySelector('[data-role-select="u2"]');
    select.value = 'admin';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();
    expect(updateUserRole).toHaveBeenCalledWith('u2', 'admin');
  });

  it('yeni kullanıcı formu gönderildiğinde createUser doğru alanlarla çağrılır', async () => {
    container.querySelector('#new-user-username').value = 'yeniuser';
    container.querySelector('#new-user-password').value = 'sifre123';
    container.querySelector('#new-user-fullname').value = 'Yeni Kullanıcı';
    container.querySelector('#new-user-role').value = 'kalite_ekibi';
    container.querySelector('#new-user-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAsync();
    expect(createUser).toHaveBeenCalledWith({
      username: 'yeniuser', password: 'sifre123', fullName: 'Yeni Kullanıcı', role: 'kalite_ekibi'
    });
  });

  it('createUser hata fırlatırsa okunur bir hata mesajı gösterir', async () => {
    createUser.mockRejectedValueOnce(new Error('Bu kullanıcı adı zaten kayıtlı'));
    container.querySelector('#new-user-username').value = 'varolan';
    container.querySelector('#new-user-password').value = 'sifre123';
    container.querySelector('#new-user-fullname').value = 'Var Olan';
    container.querySelector('#new-user-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAsync();
    const msg = container.querySelector('#new-user-msg');
    expect(msg.textContent).toBe('Hata: Bu kullanıcı adı zaten kayıtlı');
  });
});
