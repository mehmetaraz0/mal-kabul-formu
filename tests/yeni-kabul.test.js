import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock çağrıları dosyanın en tepesine "hoist" edilir; factory içinde referans verilen bir
// değişken vitest 2.x'te ya "mock" ile başlamalı ya da vi.hoisted() ile tanımlanmalı (bkz.
// offline-queue.test.js'teki aynı gerekçe).
const { getCurrentProfile, hasRole, createReceiptWithItems, enqueueReceipt, refreshOfflineBanner, listCompanies, listProducts } = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  hasRole: vi.fn(),
  createReceiptWithItems: vi.fn(),
  enqueueReceipt: vi.fn(),
  refreshOfflineBanner: vi.fn(() => Promise.resolve()),
  listCompanies: vi.fn(),
  listProducts: vi.fn()
}));

vi.mock('../src/lib/auth.js', () => ({ getCurrentProfile, hasRole }));
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

function addFirstProductRow(container) {
  selectFirstFromSearchList(container, 'urun-picker');
  const qtyInput = container.querySelector('#items-body input[data-field="quantity"][data-index="0"]');
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
    hasRole.mockReturnValue(true);
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

  it('firma seçili + SIFIR ürün satırı + çevrimdışıyken: kuyruğa YAZMAZ, doğrudan yerel hata gösterir', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    // items eklenmedi -> state.items.length === 0

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    container.querySelector('#save-draft-btn').click();
    await flushAsync();

    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toBe('Hata: En az bir ürün satırı gerekli');
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
    container.querySelector('#save-draft-btn').click();
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

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    // Gerçek supabase-js şekli: instanceof TypeError DEĞİL, code:'' olan düz nesne.
    createReceiptWithItems.mockRejectedValue({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' });

    container.querySelector('#save-draft-btn').click();
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
    container.querySelector('#save-draft-btn').click();
    await flushAsync();

    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toBe('Hata: Lütfen bir firma seçin');
    expect(createReceiptWithItems).not.toHaveBeenCalled();
    expect(enqueueReceipt).not.toHaveBeenCalled();
  });

  it('regresyon: miktar<=0 varken (mevcut kontrol) hâlâ kuyruğa yazmadan hata gösterir', async () => {
    selectFirstFromSearchList(container, 'firma-picker');
    selectFirstFromSearchList(container, 'urun-picker');
    // quantity varsayılan olarak 0 bırakılıyor (addFirstProductRow kullanılmadı)

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    container.querySelector('#save-draft-btn').click();
    await flushAsync();

    const msg = container.querySelector('#kabul-msg');
    expect(msg.textContent).toBe("Hata: Tüm satırların miktarı 0'dan büyük olmalı");
    expect(createReceiptWithItems).not.toHaveBeenCalled();
    expect(enqueueReceipt).not.toHaveBeenCalled();
  });
});
