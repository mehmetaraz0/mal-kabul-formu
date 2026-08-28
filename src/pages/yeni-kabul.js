import { listCompanies } from '../lib/companies.js';
import { listProducts } from '../lib/products.js';
import { renderSearchList } from '../components/search-list.js';
import { createReceiptWithItems } from '../lib/receipts.js';
import { getCurrentProfile, hasRole } from '../lib/auth.js';
import { escapeHtml } from '../lib/html.js';
import { isNetworkError } from '../lib/offline-cache.js';
import { enqueueReceipt } from '../lib/offline-queue.js';
import { refreshOfflineBanner } from '../components/offline-banner.js';

export async function renderYeniKabul(container) {
  const profile = await getCurrentProfile();
  if (!hasRole(profile, 'depo_yonetici')) {
    container.innerHTML = '<p>Bu sayfa sadece depo yöneticisi rolüne açıktır.</p>';
    return;
  }

  const [companies, products] = await Promise.all([listCompanies(), listProducts()]);

  const state = { companyId: null, items: [] };

  container.innerHTML = `
    <h2>Yeni Mal Kabul</h2>
    <div style="display:flex;flex-direction:column;gap:0.75rem;max-width:520px;">
      <label>Firma
        <div id="firma-picker"></div>
        <div id="firma-selected" style="font-weight:bold;"></div>
      </label>
      <label>Tarih <input type="date" id="kabul-tarih" value="${new Date().toISOString().slice(0, 10)}" /></label>
      <label>İrsaliye No <input type="text" id="kabul-irsaliye" /></label>
      <label>Sipariş No <input type="text" id="kabul-siparis" /></label>
      <label>Fatura No <input type="text" id="kabul-fatura" placeholder="Fatura No" /></label>
      <label>Araç Hijyeni
        <select id="kabul-arac-hijyen">
          <option value="">Araç Hijyeni —</option>
          <option value="true">Uygun</option>
          <option value="false">Uygun Değil</option>
        </select>
      </label>
      <label>Araç Sıcaklığı (°C) <input type="number" step="0.1" id="kabul-arac-sicaklik" placeholder="Araç Sıcaklığı (°C)" /></label>
    </div>

    <h3>Ürün Ekle</h3>
    <div id="urun-picker" style="max-width:520px;"></div>

    <table id="items-table" style="width:100%;border-collapse:collapse;margin-top:1rem;">
      <thead>
        <tr style="text-align:left;border-bottom:2px solid #333;">
          <th>Ürün</th><th>Lot No</th><th>SKT</th><th>Miktar</th><th>Birim</th><th>Ürün Sıcaklığı</th><th>Yarı Ömür Geçti mi</th><th></th>
        </tr>
      </thead>
      <tbody id="items-body"></tbody>
    </table>

    <div style="margin-top:1rem;display:flex;gap:0.5rem;">
      <button id="save-draft-btn">Taslak Kaydet</button>
      <button id="submit-quality-btn">Kaydet ve Kalite Onayına Gönder</button>
    </div>
    <p id="kabul-msg"></p>
  `;

  renderSearchList(container.querySelector('#firma-picker'), {
    items: companies,
    getLabel: (c) => c.name,
    getKey: (c) => c.id,
    placeholder: 'Firma ara...',
    onSelect: (c) => {
      state.companyId = c.id;
      container.querySelector('#firma-selected').textContent = 'Seçili: ' + c.name;
    }
  });

  function renderItemsBody() {
    const tbody = container.querySelector('#items-body');
    tbody.innerHTML = state.items
      .map(
        (item, i) => `
      <tr>
        <td>${escapeHtml(item.code)} — ${escapeHtml(item.name)}</td>
        <td><input type="text" data-field="lotNo" data-index="${i}" value="${escapeHtml(item.lotNo)}" /></td>
        <td><input type="date" data-field="skt" data-index="${i}" value="${escapeHtml(item.skt)}" /></td>
        <td><input type="number" min="0" step="0.01" data-field="quantity" data-index="${i}" value="${escapeHtml(item.quantity)}" style="width:80px;" /></td>
        <td>${escapeHtml(item.unit)}</td>
        <td><input type="number" step="0.1" data-field="urunSicakligi" data-index="${i}" value="${escapeHtml(item.urunSicakligi)}" style="width:90px;" /></td>
        <td><input type="checkbox" data-field="yariOmurGecti" data-index="${i}" ${item.yariOmurGecti ? 'checked' : ''} /></td>
        <td><button data-remove="${i}">Sil</button></td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.index);
        const field = input.dataset.field;
        state.items[idx][field] = input.checked;
      });
    });
    tbody.querySelectorAll('input:not([type="checkbox"])').forEach((input) => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.index);
        const field = input.dataset.field;
        state.items[idx][field] = field === 'quantity' ? Number(input.value) : input.value;
      });
    });
    tbody.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.items.splice(Number(btn.dataset.remove), 1);
        renderItemsBody();
      });
    });
  }

  renderSearchList(container.querySelector('#urun-picker'), {
    items: products,
    getLabel: (p) => `[${p.category}] ${p.code} — ${p.name} (${p.unit})`,
    getKey: (p) => p.id,
    placeholder: 'Eklenecek ürünü ara...',
    onSelect: (p) => {
      state.items.push({ productId: p.id, code: p.code, name: p.name, unit: p.unit, lotNo: '', skt: '', quantity: 0, urunSicakligi: '', yariOmurGecti: false });
      renderItemsBody();
    }
  });

  async function save(sendToQuality) {
    const msg = container.querySelector('#kabul-msg');
    const buttons = [container.querySelector('#save-draft-btn'), container.querySelector('#submit-quality-btn')];
    msg.textContent = '';

    // Yerel doğrulamalar SENKRON ve try/catch'in DIŞINDA çalışır — bilerek. `isNetworkError`,
    // `!navigator.onLine` iken hatanın gerçek türüne BAKMADAN true döner (bkz. offline-cache.js).
    // Bu kontroller aşağıdaki ağ-hatası-yakalayan try/catch'in İÇİNDE olsaydı, kullanıcı
    // çevrimdışıyken tetiklenen bir yerel doğrulama hatası (firma seçilmemiş, miktar<=0) "ağ
    // hatası" sanılıp kuyruğa yazılırdı — ve o kayıt senkronize edilmeye çalışıldığında AYNI
    // yerel hatayla sonsuza dek başarısız kalırdı (asla düzeltilemeyen "zehirli" bir kuyruk
    // kaydı). Bu yüzden burada erken dönüyoruz; kuyruğa yazma yolu hiç açılmıyor.
    if (!state.companyId) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: Lütfen bir firma seçin';
      return;
    }
    if (state.items.some((item) => !(item.quantity > 0))) {
      msg.style.color = '#b00020';
      msg.textContent = "Hata: Tüm satırların miktarı 0'dan büyük olmalı";
      return;
    }

    // Çift gönderim engeli: yavaş bir kayıt sırasında ikinci bir tıklama ikinci bir kayıt yaratmasın.
    buttons.forEach((btn) => { btn.disabled = true; });
    try {
      // RPC tek çağrıda hem kaydı hem satırları oluşturur, sendToQuality ise aynı transaction
      // içinde kalite onayına gönderir (öksüz taslak kalmaz).
      const aracHijyenValue = container.querySelector('#kabul-arac-hijyen').value;
      const aracSicaklikValue = container.querySelector('#kabul-arac-sicaklik').value;
      // clientUuid burada üretiliyor (RPC'nin kendi varsayılanına bırakmak yerine) çünkü ağ
      // hatası durumunda enqueueReceipt'e AYNI uuid'yi vermemiz gerekiyor — aksi halde kuyruktaki
      // kayıt senkronize olduğunda sunucu tarafında farklı bir client_uuid ile ikinci bir kayıt
      // oluşur (idempotency anahtarı eşleşmez).
      const clientUuid = crypto.randomUUID();
      const payload = {
        companyId: state.companyId,
        receiptDate: container.querySelector('#kabul-tarih').value,
        irsaliyeNo: container.querySelector('#kabul-irsaliye').value,
        siparisNo: container.querySelector('#kabul-siparis').value,
        receivedBy: profile.id,
        // Derin kopya (öğe başına yeni nesne): aşağıdaki `await enqueueReceipt(...)` sırasında
        // kullanıcı tabloda başka bir satırı düzenlerse (input change event'i state.items'ı
        // doğrudan mutasyona uğratıyor), kuyruğa zaten yazılmış olan payload'ın sessizce
        // değişmesini engeller — kuyruktaki kayıt, "Taslak Kaydet"e basıldığı andaki değerleri
        // donuk (immutable) olarak saklamalı.
        items: state.items.map((item) => ({ ...item })),
        faturaNo: container.querySelector('#kabul-fatura').value,
        aracHijyenUygun: aracHijyenValue === '' ? null : aracHijyenValue === 'true',
        aracSicaklik: aracSicaklikValue ? Number(aracSicaklikValue) : null
      };
      try {
        await createReceiptWithItems({ ...payload, clientUuid, submitToQuality: sendToQuality });
        msg.style.color = 'green';
        msg.textContent = sendToQuality ? 'Kaydedildi ve kalite onayına gönderildi.' : 'Taslak olarak kaydedildi.';
      } catch (err) {
        // Sadece GERÇEK ağ hataları kuyruğa alınır (bkz. offline-cache.js/isNetworkError).
        // RLS reddi, validasyon hatası gibi uygulama seviyesi hatalar burada yeniden fırlatılıp
        // dıştaki catch'e düşer — aksi halde asla senkronize olamayacak bozuk bir kayıt kuyrukta
        // sonsuza kadar bekler (Global Constraint, plan dokümanı).
        if (!isNetworkError(err)) throw err;
        await enqueueReceipt({ clientUuid, payload, sendToQuality });
        await refreshOfflineBanner();
        msg.style.color = '#a15c00';
        msg.textContent = 'Çevrimdışısınız — kayıt cihazda bekletildi, bağlantı gelince otomatik gönderilecek.';
      }
      state.items = [];
      state.companyId = null;
      container.querySelector('#firma-selected').textContent = '';
      renderItemsBody();
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    } finally {
      buttons.forEach((btn) => { btn.disabled = false; });
    }
  }

  container.querySelector('#save-draft-btn').addEventListener('click', () => save(false));
  container.querySelector('#submit-quality-btn').addEventListener('click', () => save(true));
}
