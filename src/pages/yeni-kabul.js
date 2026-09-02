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

  function emptyItem() {
    return {
      productId: null, code: '', name: '', unit: '', marka: '', lotNo: '', skt: '',
      quantity: 0, urunSicakligi: '', yariOmurGecti: false, uygunluk: 'beklemede', note: '',
      dereceMin: null, dereceMax: null
    };
  }

  const state = { companyId: null, items: [emptyItem()] };

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
        <button type="button" id="urun-ekle-btn" class="btn-accent">+ Ürün Ekle</button>
      </div>
      <div id="urun-kartlari"></div>
    </div>

    <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button id="save-btn">Kaydet</button>
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

  function updateUygunlukButtons(wrap, idx) {
    wrap.querySelectorAll(`[data-uygunluk][data-index="${idx}"]`).forEach((b) => {
      const isActive = b.dataset.uygunluk === state.items[idx].uygunluk;
      b.className = isActive ? (b.dataset.uygunluk === 'uygun' ? 'btn-success' : 'btn-danger') : 'btn-ghost';
    });
  }

  // Ürünün tanımlı bir sıcaklık referans aralığı (dereceMin/dereceMax) varsa, mevcut
  // urunSicakligi değerine göre Uygunluk'u yeniden hesaplar. Hem ürün seçildiğinde hem de
  // Sıcaklık alanı değiştiğinde çağrılır ki iki alan hangi sırayla doldurulursa doldurulsun
  // (veya ürün karttaki mevcut değer korunarak değiştirilsin) öneri güncel kalsın — bu bir
  // varsayılan, kullanıcı Uygun/Uygunsuz butonlarına elle tıklayarak her zaman değiştirebilir
  // (kilit değil, bu yüzden manuel tıklama handler'ından ÇAĞRILMAZ).
  function applyDereceSuggestion(item) {
    if (item.dereceMin == null || item.dereceMax == null) return;
    if (item.urunSicakligi === '' || item.urunSicakligi == null) {
      item.uygunluk = 'beklemede';
      return;
    }
    const sicaklik = Number(item.urunSicakligi);
    if (Number.isNaN(sicaklik)) return;
    item.uygunluk = sicaklik >= item.dereceMin && sicaklik <= item.dereceMax ? 'uygun' : 'uygun_degil';
  }

  function renderUrunKartlari() {
    const wrap = container.querySelector('#urun-kartlari');
    wrap.innerHTML = state.items
      .map(
        (item, i) => `
      <div class="card" style="margin-bottom:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
          <strong>${item.productId ? escapeHtml(item.code) + ' — ' + escapeHtml(item.name) : 'Ürün ' + (i + 1)}</strong>
          <button type="button" data-remove-card="${i}" class="btn-ghost">Kartı Sil</button>
        </div>
        <div class="field">
          <label class="field-label">Ürün Adı</label>
          <div class="urun-arama" data-index="${i}"></div>
        </div>
        <div class="field-grid">
          <div class="field"><label class="field-label">Miktar</label><input type="number" min="0" step="0.01" data-field="quantity" data-index="${i}" value="${escapeHtml(item.quantity)}" /></div>
          <div class="field"><label class="field-label">Birim</label><input type="text" value="${escapeHtml(item.unit || '-')}" disabled /></div>
          <div class="field"><label class="field-label">SKT</label><input type="date" data-field="skt" data-index="${i}" value="${escapeHtml(item.skt)}" /></div>
          <div class="field"><label class="field-label">Sıcaklık (°C)</label><input type="number" step="0.1" data-field="urunSicakligi" data-index="${i}" value="${escapeHtml(item.urunSicakligi)}" /></div>
          <div class="field"><label class="field-label">Seri/Lot No</label><input type="text" data-field="lotNo" data-index="${i}" value="${escapeHtml(item.lotNo)}" /></div>
          <div class="field"><label class="field-label">Marka</label><input type="text" data-field="marka" data-index="${i}" value="${escapeHtml(item.marka)}" placeholder="Opsiyonel" /></div>
        </div>
        <div class="field">
          <label class="field-label" style="display:flex;flex-direction:row;align-items:center;gap:0.4rem;">
            <input type="checkbox" data-field="yariOmurGecti" data-index="${i}" ${item.yariOmurGecti ? 'checked' : ''} /> Yarı Ömrünü Geçti mi
          </label>
        </div>
        <div class="field">
          <label class="field-label">Uygunluk</label>
          <div style="display:flex;gap:0.5rem;">
            <button type="button" data-uygunluk="uygun" data-index="${i}" class="${item.uygunluk === 'uygun' ? 'btn-success' : 'btn-ghost'}" style="flex:1;">✓ Uygun</button>
            <button type="button" data-uygunluk="uygun_degil" data-index="${i}" class="${item.uygunluk === 'uygun_degil' ? 'btn-danger' : 'btn-ghost'}" style="flex:1;">✗ Uygunsuz</button>
          </div>
        </div>
        <div class="field"><label class="field-label">Not</label><input type="text" data-field="note" data-index="${i}" value="${escapeHtml(item.note)}" /></div>
      </div>`
      )
      .join('');

    state.items.forEach((item, i) => {
      renderSearchList(wrap.querySelector(`.urun-arama[data-index="${i}"]`), {
        items: products,
        getLabel: (p) => `[${p.category}] ${p.code} — ${p.name} (${p.unit})`,
        getKey: (p) => p.id,
        placeholder: 'Ürün ara...',
        onSelect: (p) => {
          state.items[i] = {
            ...state.items[i], productId: p.id, code: p.code, name: p.name, unit: p.unit,
            dereceMin: p.derece_min ?? null, dereceMax: p.derece_max ?? null
          };
          // Ürün değiştiğinde (veya sıcaklık üründen ÖNCE girilmişse) önceki ürünün stale
          // Uygunluk değerinin sürüklenmesini engellemek için öneriyi burada yeniden hesapla.
          // renderUrunKartlari() zaten tam bir yeniden çizim yapıp butonları state'ten
          // boyayacağı için ayrıca updateUygunlukButtons çağrısına gerek yok.
          applyDereceSuggestion(state.items[i]);
          renderUrunKartlari();
        }
      });
    });

    wrap.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      if (!input.dataset.field) return;
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.index);
        state.items[idx][input.dataset.field] = input.checked;
      });
    });
    wrap.querySelectorAll('input:not([type="checkbox"])').forEach((input) => {
      if (!input.dataset.field) return; // Birim alanı: disabled, salt-okunur, state'e yazılmıyor
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.index);
        const field = input.dataset.field;
        state.items[idx][field] = field === 'quantity' ? Number(input.value) : input.value;

        // Sıcaklık girildiğinde (veya temizlendiğinde), üründe bir referans aralık
        // tanımlıysa Uygunluk'u otomatik öner — bu bir varsayılan, kullanıcı Uygun/Uygunsuz
        // butonlarına elle tıklayarak her zaman değiştirebilir (kilit değil).
        if (field === 'urunSicakligi') {
          applyDereceSuggestion(state.items[idx]);
          updateUygunlukButtons(wrap, idx);
        }
      });
    });
    wrap.querySelectorAll('[data-uygunluk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        state.items[idx].uygunluk = btn.dataset.uygunluk;
        updateUygunlukButtons(wrap, idx);
      });
    });
    wrap.querySelectorAll('[data-remove-card]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.items.splice(Number(btn.dataset.removeCard), 1);
        renderUrunKartlari();
      });
    });
  }

  container.querySelector('#urun-ekle-btn').addEventListener('click', () => {
    state.items.push(emptyItem());
    renderUrunKartlari();
  });

  renderUrunKartlari();

  async function save() {
    const msg = container.querySelector('#kabul-msg');
    const buttons = [container.querySelector('#save-btn')];
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
    // false döner, yani "en az bir kart var mı" hiç ayrıca kontrol edilmiyordu — RPC'nin kendi
    // 'En az bir ürün satırı gerekli' hatası createReceiptWithItems çağrılmadan, tamamen YEREL
    // olarak (src/lib/receipts.js:26) fırlatılıyordu. Bu, yukarıdaki try/catch'in İÇİNDEYDİ, bu
    // yüzden çevrimdışıyken isNetworkError bunu "ağ hatası" sanıp kuyruğa yazıyordu — kayıt her
    // retry'da AYNI yerel hatayla sunucuya hiç ulaşmadan başarısız oluyordu (final review'ın 2
    // numaralı bulgusunun gözden kaçan üçüncü kontrolü).
    if (state.items.length === 0) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: En az bir ürün kartı gerekli';
      return;
    }
    if (state.items.some((item) => !item.productId)) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: Tüm kartlarda bir ürün seçilmeli (boş kartı silin veya ürün seçin)';
      return;
    }
    if (state.items.some((item) => !(item.quantity > 0))) {
      msg.style.color = '#b00020';
      msg.textContent = "Hata: Tüm kartların miktarı 0'dan büyük olmalı";
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
    // Aynı aile: kayıt veritabanı tarafında da check_receipt_approval tetikleyicisiyle (0007)
    // reddediliyor — burada erken ve anlaşılır bir hata için tekrarlanıyor. Çevrimdışıyken bu da
    // RPC'ye hiç gitmeden yerel olarak yakalanmalı (yukarıdaki diğer yerel kontrollerle aynı
    // gerekçe). Taslak kaydetme kaldırıldığı için artık koşulsuz: her kayıt tamamlanmış olarak
    // yazılır, dolayısıyla her kartın uygunluğu işaretlenmiş olmalı.
    if (state.items.some((item) => item.uygunluk === 'beklemede')) {
      msg.style.color = '#b00020';
      msg.textContent = "Hata: Tüm kartların uygunluğu (Uygun / Uygun Değil) işaretlenmeden kaydedilemez";
      return;
    }

    // Çift gönderim engeli: yavaş bir kayıt sırasında ikinci bir tıklama ikinci bir kayıt yaratmasın.
    buttons.forEach((btn) => { btn.disabled = true; });
    try {
      // RPC tek çağrıda hem kaydı hem satırları oluşturur ve aynı transaction içinde kaydı
      // tamamlanmış duruma taşır (öksüz taslak kalmaz).
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
        // kullanıcı kartlarda başka bir kartı düzenlerse (input change event'i state.items'ı
        // doğrudan mutasyona uğratıyor), kuyruğa zaten yazılmış olan payload'ın sessizce
        // değişmesini engeller — kuyruktaki kayıt, "Kaydet"e basıldığı andaki değerleri
        // donuk (immutable) olarak saklamalı.
        items: state.items.map((item) => ({ ...item })),
        faturaNo: container.querySelector('#kabul-fatura').value,
        aracHijyenUygun: aracHijyenValue === '' ? null : aracHijyenValue === 'true',
        aracSicaklik: aracSicaklikValue ? Number(aracSicaklikValue) : null
      };
      try {
        await createReceiptWithItems({ ...payload, clientUuid, submitToQuality: true });
        msg.style.color = 'var(--color-success-text)';
        msg.textContent = 'Kayıt tamamlandı.';
      } catch (err) {
        // Sadece GERÇEK ağ hataları kuyruğa alınır (bkz. offline-cache.js/isNetworkError).
        // RLS reddi, validasyon hatası gibi uygulama seviyesi hatalar burada yeniden fırlatılıp
        // dıştaki catch'e düşer — aksi halde asla senkronize olamayacak bozuk bir kayıt kuyrukta
        // sonsuza kadar bekler (Global Constraint, plan dokümanı).
        if (!isNetworkError(err)) throw err;
        await enqueueReceipt({ clientUuid, payload, sendToQuality: true });
        await refreshOfflineBanner();
        msg.style.color = '#a15c00';
        msg.textContent = 'Çevrimdışısınız — kayıt cihazda bekletildi, bağlantı gelince otomatik gönderilecek.';
      }
      state.items = [emptyItem()];
      state.companyId = null;
      container.querySelector('#firma-selected').textContent = '';
      renderUrunKartlari();
    } catch (err) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: ' + err.message;
    } finally {
      buttons.forEach((btn) => { btn.disabled = false; });
    }
  }

  container.querySelector('#save-btn').addEventListener('click', () => save());
}
