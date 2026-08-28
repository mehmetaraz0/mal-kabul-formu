import { listProducts, addProduct } from '../lib/products.js';
import { renderSearchList } from '../components/search-list.js';
import { getCurrentProfile, hasRole } from '../lib/auth.js';

export async function renderUrunler(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">🔍 Ürün Ara</div></div>
      <div id="urun-search"></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-header-title">📦 Yeni Ürün Ekle</div></div>
      <div id="urun-add"></div>
      <p id="urun-msg"></p>
    </div>
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
    <form id="urun-add-form" class="field-grid" style="align-items:end;">
      <div class="field"><span class="field-label">Ürün Kodu</span><input type="text" id="new-urun-code" placeholder="örn. YIY01000999" required /></div>
      <div class="field"><span class="field-label">Ürün Adı</span><input type="text" id="new-urun-name" required /></div>
      <div class="field"><span class="field-label">Birim</span>
        <select id="new-urun-unit">
          <option value="kg">kg</option>
          <option value="ad">ad</option>
        </select>
      </div>
      <div class="field"><span class="field-label">Kategori</span>
        <select id="new-urun-category">
          <option value="ET">ET</option>
          <option value="BALIK">BALIK</option>
        </select>
      </div>
      <button type="submit" class="btn-accent" style="grid-column:1 / -1;justify-self:start;">Ekle</button>
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
      msg.style.color = 'var(--color-success-text)';
      msg.textContent = 'Ürün eklendi.';
    } catch (err) {
      const msg = container.querySelector('#urun-msg');
      msg.style.color = 'var(--color-danger-text)';
      msg.textContent = err.code === '23505' ? 'Hata: Bu ürün kodu zaten kayıtlı.' : 'Hata: ' + err.message;
    }
  });

  if (!isManager) {
    // NOT: container'da artık iki `.card-header-title` var (Ara / Ekle kartları) — bkz. firmalar.js
    // Step 2'deki aynı düzeltme. Notu container'ın en sonuna ekliyoruz.
    container.insertAdjacentHTML(
      'beforeend',
      '<p style="color:var(--color-label);font-size:0.85rem;">Not: Ürün düzenleme/silme yetkisi sadece depo yöneticisindedir.</p>'
    );
  }
}
