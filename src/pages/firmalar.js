import { listCompanies, addCompany } from '../lib/companies.js';
import { renderSearchList } from '../components/search-list.js';
import { getCurrentProfile, hasRole } from '../lib/auth.js';

export async function renderFirmalar(container) {
  container.innerHTML = '<h2>Firmalar</h2><div id="firma-search"></div><div id="firma-add"></div><p id="firma-msg"></p>';
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
    <h3>Yeni Firma Ekle</h3>
    <form id="firma-add-form" style="display:flex;gap:0.5rem;">
      <input type="text" id="new-firma-name" placeholder="Firma adı" required />
      <button type="submit">Ekle</button>
    </form>
  `;
  addBox.querySelector('#firma-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = addBox.querySelector('#new-firma-name');
    const msg = container.querySelector('#firma-msg');
    try {
      await addCompany(input.value);
      input.value = '';
      msg.style.color = 'green';
      msg.textContent = 'Firma eklendi.';
      renderFirmalar(container);
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    }
  });

  if (!isManager) {
    container.querySelector('h2').insertAdjacentHTML(
      'afterend',
      '<p style="color:#666;font-size:0.9rem;">Not: Firma düzenleme/silme yetkisi sadece depo yöneticisindedir.</p>'
    );
  }
}
