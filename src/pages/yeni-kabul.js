import { listCompanies } from '../lib/companies.js';
import { listProducts } from '../lib/products.js';
import { renderSearchList } from '../components/search-list.js';
import { createReceiptWithItems } from '../lib/receipts.js';
import { getCurrentProfile } from '../lib/auth.js';
import { escapeHtml } from '../lib/html.js';
import { isNetworkError } from '../lib/offline-cache.js';
import { enqueueReceipt } from '../lib/offline-queue.js';
import { refreshOfflineBanner } from '../components/offline-banner.js';

export async function renderYeniKabul(container) {
  const profile = await getCurrentProfile();

  const [companies, products] = await Promise.all([listCompanies(), listProducts()]);

  const state = { companyId: null, items: [] };

  container.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-header-title">📋 Teslimat Bilgileri</div></div>
      <div class="field-grid">
        <div class="field">
          <label class="field-label">Firma *</label>
          <div id="firma-picker"></div>
          <div id="firma-selected" style="font-weight:bold;margin-top:0.3rem;"></div>
        </div>
        <div class="field"><label class="field-label" for="kabul-tarih">Tarih *</label><input type="date" id="kabul-tarih" value="${new Date().toISOString().slice(0, 10)}" /></div>
        <div class="field"><label class="field-label" for="kabul-irsaliye">İrsaliye No</label><input type="text" id="kabul-irsaliye" /></div>
        <div class="field"><label class="field-label" for="kabul-fatura">Fatura No</label><input type="text" id="kabul-fatura" placeholder="Fatura No" /></div>
        <div class="field">
          <label class="field-label" for="kabul-arac-hijyen">Araç Hijyeni</label>
          <div class="status-box" id="arac-hijyen-box">
            <select id="kabul-arac-hijyen">
              <option value="">Araç Hijyeni —</option>
              <option value="true">Uygun</option>
              <option value="false">Uygun Değil</option>
            </select>
          </div>
        </div>
        <div class="field"><label class="field-label" for="kabul-arac-sicaklik">Araç Sıcaklığı (°C)</label><input type="number" step="0.1" id="kabul-arac-sicaklik" placeholder="Örn: 4" /></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-header-title">📦 Ürünler</div>
      </div>
      <div id="urun-picker" style="margin-bottom:1rem;"></div>

      <div style="overflow-x:auto;">
        <table id="items-table" class="card-table">
          <thead>
            <tr><th>Ürün</th><th>Marka</th><th>Lot No</th><th>SKT</th><th>Miktar</th><th>Birim</th><th>Ürün Sıcaklığı</th><th>Yarı Ömür Geçti mi</th><th>Uygunluk</th><th>Not</th><th></th></tr>
          </thead>
          <tbody id="items-body"></tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button id="save-draft-btn" class="btn-ghost">Taslak Kaydet</button>
      <button id="submit-quality-btn">Kaydet</button>
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

  const aracHijyenBox = container.querySelector('#arac-hijyen-box');
  container.querySelector('#kabul-arac-hijyen').addEventListener('change', (e) => {
    aracHijyenBox.dataset.value = e.target.value;
  });

  function renderItemsBody() {
    const tbody = container.querySelector('#items-body');
    tbody.innerHTML = state.items
      .map(
        (item, i) => `
      <tr>
        <td>${escapeHtml(item.code)} — ${escapeHtml(item.name)}</td>
        <td><input type="text" data-field="marka" data-index="${i}" value="${escapeHtml(item.marka)}" style="width:100px;" placeholder="Marka" /></td>
        <td><input type="text" data-field="lotNo" data-index="${i}" value="${escapeHtml(item.lotNo)}" /></td>
        <td><input type="date" data-field="skt" data-index="${i}" value="${escapeHtml(item.skt)}" /></td>
        <td><input type="number" min="0" step="0.01" data-field="quantity" data-index="${i}" value="${escapeHtml(item.quantity)}" style="width:80px;" /></td>
        <td>${escapeHtml(item.unit)}</td>
        <td><input type="number" step="0.1" data-field="urunSicakligi" data-index="${i}" value="${escapeHtml(item.urunSicakligi)}" style="width:90px;" /></td>
        <td><input type="checkbox" data-field="yariOmurGecti" data-index="${i}" ${item.yariOmurGecti ? 'checked' : ''} /></td>
        <td>
          <select data-field="uygunluk" data-index="${i}">
            <option value="beklemede" ${item.uygunluk === 'beklemede' ? 'selected' : ''}>Beklemede</option>
            <option value="uygun" ${item.uygunluk === 'uygun' ? 'selected' : ''}>Uygun</option>
            <option value="uygun_degil" ${item.uygunluk === 'uygun_degil' ? 'selected' : ''}>Uygun Değil</option>
          </select>
        </td>
        <td><input type="text" data-field="note" data-index="${i}" value="${escapeHtml(item.note)}" style="width:120px;" placeholder="Not" /></td>
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
    tbody.querySelectorAll('select[data-field="uygunluk"]').forEach((select) => {
      select.addEventListener('change', () => {
        const idx = Number(select.dataset.index);
        state.items[idx].uygunluk = select.value;
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
      state.items.push({ productId: p.id, code: p.code, name: p.name, unit: p.unit, marka: '', lotNo: '', skt: '', quantity: 0, urunSicakligi: '', yariOmurGecti: false, uygunluk: 'beklemede', note: '' });
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
    // items.length===0: `state.items.some(...)` bir sonraki kontrolde boş dizide HER ZAMAN
    // false döner, yani "en az bir satır var mı" hiç ayrıca kontrol edilmiyordu — RPC'nin kendi
    // 'En az bir ürün satırı gerekli' hatası createReceiptWithItems çağrılmadan, tamamen YEREL
    // olarak (src/lib/receipts.js:26) fırlatılıyordu. Bu, yukarıdaki try/catch'in İÇİNDEYDİ, bu
    // yüzden çevrimdışıyken isNetworkError bunu "ağ hatası" sanıp kuyruğa yazıyordu — kayıt her
    // retry'da AYNI yerel hatayla sunucuya hiç ulaşmadan başarısız oluyordu (final review'ın 2
    // numaralı bulgusunun gözden kaçan üçüncü kontrolü).
    if (state.items.length === 0) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: En az bir ürün satırı gerekli';
      return;
    }
    if (state.items.some((item) => !(item.quantity > 0))) {
      msg.style.color = '#b00020';
      msg.textContent = "Hata: Tüm satırların miktarı 0'dan büyük olmalı";
      return;
    }
    // Aynı aile: boş tarih de RPC'de sunucu tarafında date cast hatasıyla patlar (çevrimiçiyken
    // bu network hatası SAYILMAZ, doğru şekilde kırmızı gösterilir) — ama çevrimdışıyken bu kez
    // gerçek bir fetch denemesi (offline olduğu için) network hatası olarak sınıflandırılıp
    // kuyruğa yazılır, ve sync sırasında sunucu her seferinde AYNI cast hatasıyla reddeder.
    // Basit ve ucuz bir kontrol olduğu için burada da erkenden yakalıyoruz.
    if (!container.querySelector('#kabul-tarih').value) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: Tarih girilmeli';
      return;
    }
    // Aynı aile: nihai "Kaydet" (sendToQuality=true) veritabanı tarafında da
    // check_receipt_approval tetikleyicisiyle (0007) reddediliyor — burada erken ve anlaşılır
    // bir hata için tekrarlanıyor. Çevrimdışıyken bu da RPC'ye hiç gitmeden yerel olarak
    // yakalanmalı (yukarıdaki diğer yerel kontrollerle aynı gerekçe).
    if (sendToQuality && state.items.some((item) => item.uygunluk === 'beklemede')) {
      msg.style.color = '#b00020';
      msg.textContent = "Hata: Tüm satırların uygunluğu (Uygun / Uygun Değil) işaretlenmeden kaydedilemez";
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
        msg.style.color = 'var(--color-success-text)';
        msg.textContent = sendToQuality ? 'Kayıt tamamlandı.' : 'Taslak olarak kaydedildi.';
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
