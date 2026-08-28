import { listCompanies, addCompany } from '../lib/companies.js';
import { renderSearchList } from '../components/search-list.js';
import { getCurrentProfile, hasRole } from '../lib/auth.js';

export async function renderFirmalar(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">🔍 Firma Ara</div></div>
      <div id="firma-search"></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-header-title">🏢 Yeni Firma Ekle</div></div>
      <div id="firma-add"></div>
      <p id="firma-msg"></p>
    </div>
  `;
  const profile = await getCurrentProfile();
  const isManager = hasRole(profile, 'depo_yonetici');

  const companies = await listCompanies();
  renderSearchList(container.querySelector('#firma-search'), {
    items: companies,
    getLabel: (c) => `${c.sira_no ?? ''} — ${c.name}`,
    getKey: (c) => c.id,
    onSelect: () => {},
    placeholder: 'Firma ara...'
  });

  const addBox = container.querySelector('#firma-add');
  addBox.innerHTML = `
    <form id="firma-add-form" style="display:flex;gap:0.5rem;flex-wrap:wrap;">
      <input type="text" id="new-firma-name" placeholder="Firma adı" required style="flex:1;min-width:200px;" />
      <button type="submit" class="btn-accent">Ekle</button>
    </form>
  `;
  addBox.querySelector('#firma-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = addBox.querySelector('#new-firma-name');
    const name = input.value;
    try {
      await addCompany(name);
      input.value = '';
      await renderFirmalar(container);
      const msg = container.querySelector('#firma-msg');
      msg.style.color = 'var(--color-success-text)';
      msg.textContent = 'Firma eklendi.';
    } catch (err) {
      const msg = container.querySelector('#firma-msg');
      msg.style.color = 'var(--color-danger-text)';
      msg.textContent = err.code === '23505' ? 'Hata: Bu firma zaten kayıtlı.' : 'Hata: ' + err.message;
    }
  });

  if (!isManager) {
    // NOT: container'da artık iki `.card-header-title` var (Ara / Ekle kartları), o yüzden
    // `container.querySelector('.card-header-title')` belirsiz olurdu (ilk eşleşeni, yanlış
    // kartı hedefler). Notu container'ın en sonuna (her iki kartın da altına) ekliyoruz.
    container.insertAdjacentHTML(
      'beforeend',
      '<p style="color:var(--color-label);font-size:0.85rem;">Not: Firma düzenleme/silme yetkisi sadece depo yöneticisindedir.</p>'
    );
  }
}
