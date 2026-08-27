import { listProducts, addProduct } from '../lib/products.js';
import { renderSearchList } from '../components/search-list.js';
import { getCurrentProfile, hasRole } from '../lib/auth.js';

export async function renderUrunler(container) {
  container.innerHTML = `
    <h2>Ürünler</h2>
    <div id="urun-search"></div>
    <div id="urun-add"></div>
    <p id="urun-msg"></p>
  `;
  const profile = await getCurrentProfile();
  const isManager = hasRole(profile, 'depo_yonetici');

  const products = await listProducts();
  renderSearchList(container.querySelector('#urun-search'), {
    items: products,
    getLabel: (p) => `[${p.category}] ${p.code} — ${p.name} (${p.unit})`,
    getKey: (p) => p.id,
    onSelect: () => {},
    placeholder: 'Ürün ara (kod veya isim)...'
  });

  const addBox = container.querySelector('#urun-add');
  addBox.innerHTML = `
    <h3>Yeni Ürün Ekle</h3>
    <form id="urun-add-form" style="display:flex;flex-direction:column;gap:0.5rem;max-width:360px;">
      <input type="text" id="new-urun-code" placeholder="Ürün kodu (örn. YIY01000999)" required />
      <input type="text" id="new-urun-name" placeholder="Ürün adı" required />
      <select id="new-urun-unit">
        <option value="kg">kg</option>
        <option value="ad">ad</option>
      </select>
      <select id="new-urun-category">
        <option value="ET">ET</option>
        <option value="BALIK">BALIK</option>
      </select>
      <button type="submit">Ekle</button>
    </form>
  `;
  addBox.querySelector('#urun-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await addProduct({
        code: addBox.querySelector('#new-urun-code').value,
        name: addBox.querySelector('#new-urun-name').value,
        unit: addBox.querySelector('#new-urun-unit').value,
        category: addBox.querySelector('#new-urun-category').value
      });
      await renderUrunler(container);
      const msg = container.querySelector('#urun-msg');
      msg.style.color = 'green';
      msg.textContent = 'Ürün eklendi.';
    } catch (err) {
      const msg = container.querySelector('#urun-msg');
      msg.style.color = '#b00020';
      msg.textContent = err.code === '23505' ? 'Hata: Bu ürün kodu zaten kayıtlı.' : 'Hata: ' + err.message;
    }
  });

  if (!isManager) {
    container.querySelector('h2').insertAdjacentHTML(
      'afterend',
      '<p style="color:#666;font-size:0.9rem;">Not: Ürün düzenleme/silme yetkisi sadece depo yöneticisindedir.</p>'
    );
  }
}
