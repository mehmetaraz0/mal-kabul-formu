import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock çağrıları dosyanın en tepesine "hoist" edilir; factory içinde referans verilen bir
// değişken vitest 2.x'te ya "mock" ile başlamalı ya da vi.hoisted() ile tanımlanmalı (bkz.
// offline-queue.test.js'teki aynı gerekçe).
const { getCurrentProfile, createReceiptWithItems, enqueueReceipt, refreshOfflineBanner, listCompanies, listProducts } = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  createReceiptWithItems: vi.fn(),
  enqueueReceipt: vi.fn(),
  refreshOfflineBanner: vi.fn(() => Promise.resolve()),
  listCompanies: vi.fn(),
  listProducts: vi.fn()
}));

vi.mock('../src/lib/auth.js', () => ({ getCurrentProfile }));
vi.mock('../src/lib/receipts.js', () => ({ createReceiptWithItems }));
vi.mock('../src/lib/offline-queue.js', () => ({ enqueueReceipt }));
vi.mock('../src/components/offline-banner.js', () => ({ refreshOfflineBanner }));
vi.mock('../src/lib/companies.js', () => ({ listCompanies }));
vi.mock('../src/lib/products.js', () => ({ listProducts }));
// isNetworkError'ı BİLEREK mock'lamıyoruz — gerçek offline-cache.js'i kullanıyoruz, çünkü bu
// testlerin bütün amacı, `!navigator.onLine` iken GERÇEK isNetworkError'ın yerel doğrulama
// hatalarını (items.length===0, boş tarih) "ağ hatası" sanıp sanmadığını doğrulamak — bunu
// mock'lamak testi anlamsızlaştırırdı.

import { renderYeniKabul } from '../src/pages/yeni-kabul.js';

function selectFirstFromSearchList(container, pickerId) {
  const input = container.querySelector(`#${pickerId} .search-input`);
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const li = container.querySelector(`#${pickerId} .search-results li`);
  li.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// Ürün seçimi artık kart-içi bir popup (search-list.js) — sayfa açılışında zaten var olan İLK
// kartın (index 0) kendi arama kutusu kullanılıyor.
function selectFirstFromUrunKarti(container, cardIndex = 0) {
  const input = container.querySelector(`.urun-arama[data-index="${cardIndex}"] .search-input`);
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const li = container.querySelector(`.urun-arama[data-index="${cardIndex}"] .search-results li`);
  li.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function addFirstProductRow(container) {
  selectFirstFromUrunKarti(container, 0);
  const qtyInput = container.querySelector('#urun-kartlari input[data-field="quantity"][data-index="0"]');
  qtyInput.value = '5';
  qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
}

async function flushAsync() {
  // save() içindeki tüm await zincirinin (createReceiptWithItems/enqueueReceipt/
  // refreshOfflineBanner) mikro-task kuyruğunu tamamen boşaltması için: bir setTimeout(0) TÜM
  // bekleyen mikro-task'lardan SONRA çalışır (native Promise zincirleri ek bir makro-task
  // planlamadığı sürece), bu yüzden iç await sayısından bağımsız olarak yeterlidir.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('yeni-kabul save() - yerel doğrulama vs. çevrimdışı kuyruğa yazma', () => {
  let container;

  beforeEach(async () => {
    vi.clearAllMocks();
    getCurrentProfile.mockResolvedValue({ id: 'u1', full_name: 'Depo Yöneticisi', role: 'depo_yonetici' });
    listCompanies.mockResolvedValue([{ id: 1, name: 'TEST FIRMA' }]);
    listProducts.mockResolvedValue([{ id: 1, code: 'P1', name: 'URUN 1', unit: 'kg', category: 'ET' }]);

    container = document.createElement('div');
    document.body.appendChild(container);
    await renderYeniKabul(container);
  });

  afterEach(() => {
    container.remove();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('firma seçili + ürün seçilmemiş varsayılan kart + çevrimdışıyken: kuyruğa YAZMAZ, doğrudan yerel hata gösterir', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    // Sayfa açılışında zaten var olan tek kart (index 0) ürün seçilmeden bırakılıyor. Kart tabanlı
    // tasarımda state.items her zaman en az bir eleman içerir (emptyItem()) — bu yüzden burada
    // artık "0 satır" değil, "seçilmemiş ürün" yerel doğrulaması devreye giriyor.

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    container.querySelector('#save-btn').click();
    await flushAsync();

    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toContain('ürün seçilmeli');
    expect(msg.style.color).toBe('rgb(176, 0, 32)'); // #b00020 kırmızı, turuncu (offline) DEĞİL
    // RPC'ye hiç gidilmediği ve dolayısıyla enqueueReceipt'in de hiç çağrılmadığı — bu, ana
    // regresyonun kanıtı: eskiden bu senaryoda createReceiptWithItems'ın YEREL throw'u
    // isNetworkError tarafından "ağ hatası" sanılıp enqueueReceipt çağrılırdı.
    expect(createReceiptWithItems).not.toHaveBeenCalled();
    expect(enqueueReceipt).not.toHaveBeenCalled();
  });

  it('firma seçili + ürün var + BOŞ tarih + çevrimdışıyken: kuyruğa YAZMAZ, doğrudan yerel hata gösterir', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    addFirstProductRow(container);
    const tarihInput = container.querySelector('#kabul-tarih');
    tarihInput.value = '';
    tarihInput.dispatchEvent(new Event('input', { bubbles: true }));

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    container.querySelector('#save-btn').click();
    await flushAsync();

    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toBe('Hata: Tarih girilmeli');
    expect(createReceiptWithItems).not.toHaveBeenCalled();
    expect(enqueueReceipt).not.toHaveBeenCalled();
  });

  it("regresyon: GEÇERLİ bir kayıt çevrimdışıyken hâlâ kuyruğa yazılır (yeni guard'lar geçerli kayıtları yanlışlıkla engellemiyor)", async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    addFirstProductRow(container);
    // #kabul-tarih zaten renderYeniKabul tarafından bugünün tarihiyle önceden dolduruluyor.
    // Taslak kaydetme kaldırıldığından her kaydın uygunluğu işaretli olmalı.
    container.querySelector('[data-uygunluk="uygun"][data-index="0"]').click();

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    // Gerçek supabase-js şekli: instanceof TypeError DEĞİL, code:'' olan düz nesne.
    createReceiptWithItems.mockRejectedValue({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' });

    container.querySelector('#save-btn').click();
    await flushAsync();

    expect(createReceiptWithItems).toHaveBeenCalledTimes(1);
    expect(enqueueReceipt).toHaveBeenCalledTimes(1);
    const enqueuedArg = enqueueReceipt.mock.calls[0][0];
    expect(enqueuedArg.payload.items).toHaveLength(1);
    expect(enqueuedArg.payload.receiptDate).not.toBe('');
    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toContain('Çevrimdışısınız');
    expect(msg.style.color).toBe('rgb(161, 92, 0)'); // #a15c00 turuncu
  });

  it('regresyon: firma seçilmemişken (mevcut kontrol) hâlâ kuyruğa yazmadan hata gösterir', async () => {
    // state.companyId hiç set edilmedi
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    container.querySelector('#save-btn').click();
    await flushAsync();

    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toBe('Hata: Lütfen bir firma seçin');
    expect(createReceiptWithItems).not.toHaveBeenCalled();
    expect(enqueueReceipt).not.toHaveBeenCalled();
  });

  it('regresyon: miktar<=0 varken (mevcut kontrol) hâlâ kuyruğa yazmadan hata gösterir', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    selectFirstFromUrunKarti(container, 0);
    // quantity varsayılan olarak 0 bırakılıyor (addFirstProductRow kullanılmadı)

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    container.querySelector('#save-btn').click();
    await flushAsync();

    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toBe("Hata: Tüm kartların miktarı 0'dan büyük olmalı");
    expect(createReceiptWithItems).not.toHaveBeenCalled();
    expect(enqueueReceipt).not.toHaveBeenCalled();
  });

  it('herhangi bir satır beklemede iken "Kaydet" (final) tıklanırsa hata gösterir ve enqueueReceipt/createReceiptWithItems çağrılmaz', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    addFirstProductRow(container);
    // uygunluk hiç değiştirilmedi, varsayılan 'beklemede' kaldı.

    container.querySelector('#save-btn').click();
    await flushAsync();

    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toContain('Uygun / Uygun Değil');
    expect(createReceiptWithItems).not.toHaveBeenCalled();
    expect(enqueueReceipt).not.toHaveBeenCalled();
  });
});

describe('yeni-kabul ürün kartları', () => {
  let container;

  beforeEach(async () => {
    vi.clearAllMocks();
    getCurrentProfile.mockResolvedValue({ id: 'u1', full_name: 'Depo Yöneticisi', role: 'depo_yonetici' });
    listCompanies.mockResolvedValue([{ id: 1, name: 'TEST FIRMA' }]);
    listProducts.mockResolvedValue([
      { id: 1, code: 'P1', name: 'DANA KUŞBAŞI', unit: 'kg', category: 'ET', derece_min: -22, derece_max: -16 },
      { id: 2, code: 'P2', name: 'TAVUK BUT', unit: 'kg', category: 'ET', derece_min: null, derece_max: null }
    ]);

    container = document.createElement('div');
    document.body.appendChild(container);
    await renderYeniKabul(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('sayfa açıldığında bir boş kart hazır bekler', () => {
    const cards = container.querySelectorAll('#urun-kartlari > .card');
    expect(cards).toHaveLength(1);
  });

  it('"+ Ürün Ekle" yeni bir boş kart daha ekler', () => {
    container.querySelector('#urun-ekle-btn').click();
    const cards = container.querySelectorAll('#urun-kartlari > .card');
    expect(cards).toHaveLength(2);
  });

  it('bir karttaki arama kutusundan ürün seçilince o kartın Birim alanı otomatik dolar', () => {
    const input = container.querySelector('.urun-arama[data-index="0"] .search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const li = container.querySelector('.urun-arama[data-index="0"] .search-results li');
    li.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const birimInput = container.querySelectorAll('#urun-kartlari > .card')[0].querySelector('input[disabled]');
    expect(birimInput.value).toBe('kg');
  });

  it('Uygun butonuna basınca o buton vurgulu, Uygunsuz nötr olur; hiçbiri basılmadan önce ikisi de nötrdür', () => {
    const uygunBtn = container.querySelector('[data-uygunluk="uygun"][data-index="0"]');
    const uygunsuzBtn = container.querySelector('[data-uygunluk="uygun_degil"][data-index="0"]');
    expect(uygunBtn.className).not.toContain('btn-success');
    expect(uygunsuzBtn.className).not.toContain('btn-danger');

    uygunBtn.click();
    expect(uygunBtn.className).toContain('btn-success');
    expect(uygunsuzBtn.className).not.toContain('btn-danger');
  });

  it('"Kartı Sil" o kartı kaldırır', () => {
    container.querySelector('#urun-ekle-btn').click(); // artık 2 kart var
    expect(container.querySelectorAll('#urun-kartlari > .card')).toHaveLength(2);

    container.querySelector('[data-remove-card="0"]').click();
    expect(container.querySelectorAll('#urun-kartlari > .card')).toHaveLength(1);
  });

  it('ürün seçilmemiş bir kartla "Kaydet"e basılırsa yerel hata gösterir, RPC\'ye gitmez', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    // İlk kart (index 0) ürün seçilmeden bırakılıyor.
    const tarihInput = container.querySelector('#kabul-tarih');
    tarihInput.value = tarihInput.value || new Date().toISOString().slice(0, 10);

    container.querySelector('#save-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toContain('ürün seçilmeli');
    expect(createReceiptWithItems).not.toHaveBeenCalled();
  });

  it('varsayılan tek kart "Kartı Sil" ile kaldırılıp 0 kart kalırsa "Kaydet" "en az bir ürün kartı" yerel hatasını gösterir, RPC\'ye gitmez', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    // Sayfa açılışında zaten var olan tek (varsayılan) kart siliniyor -> state.items === [].
    container.querySelector('[data-remove-card="0"]').click();
    expect(container.querySelectorAll('#urun-kartlari > .card')).toHaveLength(0);

    container.querySelector('#save-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toBe('Hata: En az bir ürün kartı gerekli');
    expect(createReceiptWithItems).not.toHaveBeenCalled();
  });

  it('kart içindeki ürün arama popup\'u varsayılan olarak gizlidir', () => {
    const results = container.querySelector('.urun-arama[data-index="0"] .search-results');
    expect(results.style.display).toBe('none');
  });

  it('kart içindeki Marka alanı createReceiptWithItems çağrısına geçer', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    addFirstProductRow(container);
    const markaInput = container.querySelector('#urun-kartlari input[data-field="marka"][data-index="0"]');
    markaInput.value = 'Dardanel';
    markaInput.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('[data-uygunluk="uygun"][data-index="0"]').click();

    container.querySelector('#save-btn').click();
    await flushAsync();

    expect(createReceiptWithItems).toHaveBeenCalledTimes(1);
    const payload = createReceiptWithItems.mock.calls[0][0];
    expect(payload.items[0].marka).toBe('Dardanel');
  });

  it('referans aralığı olan bir üründe, aralık İÇİNDE bir sıcaklık girilince Uygunluk otomatik "uygun" olur', () => {
    const input = container.querySelector('.urun-arama[data-index="0"] .search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('.urun-arama[data-index="0"] .search-results li').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const sicaklikInput = container.querySelector('input[data-field="urunSicakligi"][data-index="0"]');
    sicaklikInput.value = '-18';
    sicaklikInput.dispatchEvent(new Event('input', { bubbles: true }));

    const uygunBtn = container.querySelector('[data-uygunluk="uygun"][data-index="0"]');
    expect(uygunBtn.className).toContain('btn-success');
  });

  it('referans aralığı olan bir üründe, aralık DIŞINDA bir sıcaklık girilince Uygunluk otomatik "uygun_degil" olur', () => {
    const input = container.querySelector('.urun-arama[data-index="0"] .search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('.urun-arama[data-index="0"] .search-results li').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const sicaklikInput = container.querySelector('input[data-field="urunSicakligi"][data-index="0"]');
    sicaklikInput.value = '-10';
    sicaklikInput.dispatchEvent(new Event('input', { bubbles: true }));

    const uygunsuzBtn = container.querySelector('[data-uygunluk="uygun_degil"][data-index="0"]');
    expect(uygunsuzBtn.className).toContain('btn-danger');
  });

  it('referans aralığının TAM ALT SINIRINDA (dereceMin) bir sıcaklık girilince Uygunluk "uygun" olur', () => {
    const input = container.querySelector('.urun-arama[data-index="0"] .search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('.urun-arama[data-index="0"] .search-results li').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const sicaklikInput = container.querySelector('input[data-field="urunSicakligi"][data-index="0"]');
    sicaklikInput.value = '-22'; // dereceMin ile tam eşit
    sicaklikInput.dispatchEvent(new Event('input', { bubbles: true }));

    const uygunBtn = container.querySelector('[data-uygunluk="uygun"][data-index="0"]');
    expect(uygunBtn.className).toContain('btn-success');
  });

  it('referans aralığının TAM ÜST SINIRINDA (dereceMax) bir sıcaklık girilince Uygunluk "uygun" olur', () => {
    const input = container.querySelector('.urun-arama[data-index="0"] .search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('.urun-arama[data-index="0"] .search-results li').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const sicaklikInput = container.querySelector('input[data-field="urunSicakligi"][data-index="0"]');
    sicaklikInput.value = '-16'; // dereceMax ile tam eşit
    sicaklikInput.dispatchEvent(new Event('input', { bubbles: true }));

    const uygunBtn = container.querySelector('[data-uygunluk="uygun"][data-index="0"]');
    expect(uygunBtn.className).toContain('btn-success');
  });

  it('otomatik seçim sonrası kullanıcı elle farklı bir Uygunluk seçebilir', () => {
    const input = container.querySelector('.urun-arama[data-index="0"] .search-input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('.urun-arama[data-index="0"] .search-results li').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const sicaklikInput = container.querySelector('input[data-field="urunSicakligi"][data-index="0"]');
    sicaklikInput.value = '-10'; // aralık dışı -> otomatik uygun_degil olur
    sicaklikInput.dispatchEvent(new Event('input', { bubbles: true }));

    const uygunBtn = container.querySelector('[data-uygunluk="uygun"][data-index="0"]');
    uygunBtn.click(); // kullanıcı elle Uygun'a basıyor

    expect(uygunBtn.className).toContain('btn-success');
    const uygunsuzBtn = container.querySelector('[data-uygunluk="uygun_degil"][data-index="0"]');
    expect(uygunsuzBtn.className).not.toContain('btn-danger');
  });

  it('referans aralığı olmayan (derece_min/max null) bir üründe sıcaklık girilince Uygunluk değişmez', () => {
    // İki ürünlü listede TAVUK BUT (id:2) derece_min/max=null taşıyor.
    container.querySelector('#urun-ekle-btn').click(); // 2. kart
    const input = container.querySelector('.urun-arama[data-index="1"] .search-input');
    input.value = 'tavuk';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    container.querySelector('.urun-arama[data-index="1"] .search-results li').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const sicaklikInput = container.querySelector('input[data-field="urunSicakligi"][data-index="1"]');
    sicaklikInput.value = '-10';
    sicaklikInput.dispatchEvent(new Event('input', { bubbles: true }));

    const uygunBtn = container.querySelector('[data-uygunluk="uygun"][data-index="1"]');
    const uygunsuzBtn = container.querySelector('[data-uygunluk="uygun_degil"][data-index="1"]');
    expect(uygunBtn.className).not.toContain('btn-success');
    expect(uygunsuzBtn.className).not.toContain('btn-danger');
  });
});

describe('yeni-kabul — taslak kaydetme kaldırıldı', () => {
  let container;

  beforeEach(async () => {
    vi.clearAllMocks();
    getCurrentProfile.mockResolvedValue({ id: 'u1', full_name: 'Depo Yöneticisi', role: 'depo_yonetici' });
    listCompanies.mockResolvedValue([{ id: 1, name: 'TEST FIRMA' }]);
    listProducts.mockResolvedValue([{ id: 1, code: 'P1', name: 'URUN 1', unit: 'kg', category: 'ET' }]);
    container = document.createElement('div');
    document.body.appendChild(container);
    await renderYeniKabul(container);
  });

  afterEach(() => {
    container.remove();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('"Taslak Kaydet" butonu render edilmez', () => {
    expect(container.querySelector('#save-draft-btn')).toBeNull();
    expect(container.textContent).not.toContain('Taslak Kaydet');
  });

  it('tek bir kaydet butonu vardır', () => {
    expect(container.querySelector('#save-btn')).not.toBeNull();
  });

  it('kaydetme her zaman tamamlanmış kayıt olarak gönderilir (submitToQuality: true)', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    addFirstProductRow(container);
    container.querySelector('[data-uygunluk="uygun"][data-index="0"]').click();
    createReceiptWithItems.mockResolvedValue('r1');

    container.querySelector('#save-btn').click();
    await flushAsync();

    expect(createReceiptWithItems).toHaveBeenCalledTimes(1);
    expect(createReceiptWithItems.mock.calls[0][0]).toMatchObject({ submitToQuality: true });
    expect(container.querySelector('#kabul-msg').textContent).toBe('Kayıt tamamlandı.');
  });

  it('çevrimdışı kuyruğa yazılan kayıt da tamamlanmış olarak işaretlenir', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    addFirstProductRow(container);
    container.querySelector('[data-uygunluk="uygun"][data-index="0"]').click();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    createReceiptWithItems.mockRejectedValue({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' });

    container.querySelector('#save-btn').click();
    await flushAsync();

    expect(enqueueReceipt).toHaveBeenCalledTimes(1);
    expect(enqueueReceipt.mock.calls[0][0].sendToQuality).toBe(true);
  });

  it('uygunluk işaretlenmemişse kaydetmez (taslak kaçış yolu kalmadı)', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    addFirstProductRow(container);

    container.querySelector('#save-btn').click();
    await flushAsync();

    expect(container.querySelector('#kabul-msg').textContent).toContain('Uygun / Uygun Değil');
    expect(createReceiptWithItems).not.toHaveBeenCalled();
    expect(enqueueReceipt).not.toHaveBeenCalled();
  });
});
