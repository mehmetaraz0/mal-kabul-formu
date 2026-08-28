# PWA Offline Çalışma ve Senkronizasyon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uygulamayı gerçek bir PWA'ya dönüştürmek (ana ekrana eklenebilir, mobil uyumlu) ve depo içinde internet bağlantısı zayıf/yok olsa bile mal kabul kaydı girilebilmesini, bağlantı geri geldiğinde bu kayıtların otomatik olarak Supabase'e senkronize olmasını sağlamak.

**Architecture:** Üç bağımsız çevrimdışı katmanı: (1) firma/ürün listeleri her başarılı yüklemede `localStorage`'a yedeklenir, ağ hatasında oradan okunur; (2) yeni mal kabul kayıtları, ağ hatası durumunda `idb-keyval` ile IndexedDB'ye bir kuyruğa yazılır; (3) `online` event'i veya periyodik kontrol tetiklendiğinde kuyruktaki kayıtlar sırayla Supabase'e gönderilir, her kayıt kendi `client_uuid`'i ile idempotent olarak (aynı kayıt iki kez oluşturulmadan) senkronize edilir. `vite-plugin-pwa`'nın Workbox entegrasyonu service worker'ı ve app-shell caching'i üretir.

**Tech Stack:** Plan 1-4'ün üzerine inşa edilir. Yeni bağımlılık: `idb-keyval` (küçük, sıfır bağımlılıklı IndexedDB sarmalayıcı).

## Global Constraints

- Offline senkron sadece **mal kabul kaydı oluşturma** (Plan 3 Task 2, `yeni-kabul.js`) için uygulanır. Kalite onay akışı (Plan 3 Task 3) ve firma/ürün ekleme (Plan 2) bu planın kapsamında offline'a alınmaz — kullanıcı özellikle "internet olmadan da veri girilebilsin" derken mal kabul girişini kastetti; kalite onayı doğası gereği zaten depo içinde, çevrimiçi bir kontrol noktasıdır. Kapsam genişletilmek istenirse ayrı bir görev olarak eklenir.
- Ağ hatası tespiti: `!navigator.onLine` **veya** fetch işleminin `TypeError: Failed to fetch` / `NetworkError` fırlatması. Supabase'in döndürdüğü **uygulama seviyesi hatalar** (örn. RLS reddi, validasyon hatası) offline kuyruğa **alınmaz**, kullanıcıya doğrudan hata olarak gösterilir — aksi halde asla senkronize olamayacak bozuk kayıtlar kuyrukta sonsuza kadar bekler.
- `receipts.client_uuid` (Plan 1'de zaten tanımlı, `unique` kısıtlı) senkron idempotency anahtarı olarak kullanılır: aynı `client_uuid` ile ikinci bir gönderim denemesi, "zaten var" olarak algılanıp hata fırlatmadan başarılı sayılır.
- Offline kuyruktaki bir kayıt sadece "Taslak Kaydet" veya "Kalite Onayına Gönder" seçeneğini hatırlayacak şekilde saklanır (`sendToQuality: boolean`); bağlantı gelince aynı seçime göre senkronize edilir.
- **GERÇEKLİK NOTU (bu plan yazıldıktan sonra Plan 3/4'ün final review'ları kodu önemli ölçüde değiştirdi — aşağıdaki kod blokları GÜNCEL DEĞİL, sadece niyeti anlatıyor):**
  - `src/lib/products.js`'teki `listProducts()` artık `.order('category')` + istemci tarafı Türkçe-duyarlı isim sıralaması yapıyor (bkz. dosyanın kendi yorumu) — Task 1'in `cacheAside` sarmalaması bu GERÇEK gövdeyi sarmalı, plandaki basit `.order('category').order('name')` halini değil.
  - `src/lib/receipts.js`'teki `createReceiptWithItems` artık İKİ ayrı Supabase çağrısı değil, **tek bir atomik `create_receipt_with_items` RPC çağrısı**; ayrıca `clientUuid`, `submitToQuality`, `faturaNo`, `aracHijyenUygun`, `aracSicaklik` parametrelerini de alıyor (Plan 3/4'ün final review'larında eklendi). Ayrı bir `submitForQuality` çağrısına gerek yok — `submitToQuality: true` aynı atomik RPC çağrısı içinde durumu `kalite_bekliyor`'a taşıyor. Task 3'ün kuyruk senkronu (`syncQueuedReceipts`) tek bir `createReceiptWithItems({...payload, clientUuid, submitToQuality})` çağrısı yapmalı, plandaki iki adımlı (`createReceiptWithItems` + ayrı `submitForQuality`) akışı DEĞİL.
  - **Kritik eksik — RPC şu an gerçekten idempotent değil:** `create_receipt_with_items` RPC'sindeki `insert into receipts (...)` ifadesinde `on conflict` yok. Aynı `client_uuid` ile ikinci bir çağrı (örn. ilk senkron isteği sunucuda başarılı oldu ama yanıt istemciye ulaşmadan bağlantı koptu, kuyruk aynı kaydı tekrar dener) `receipts.client_uuid` `unique` kısıtını ihlal eder ve RPC transaction'ı tamamen geri alınıp hata fırlatır — kayıt sonsuza kadar kuyrukta "başarısız" olarak kalır, hiç senkronize olamaz. **Task 3'ün bir parçası olarak yeni bir migration (`0011_receipt_rpc_idempotent.sql`) ile RPC'yi gerçekten idempotent hale getirmek gerekiyor:**
    - `receipts` insert'ine `on conflict (client_uuid) do update set client_uuid = excluded.client_uuid returning id into v_receipt_id` eklenmeli (kendi kendine no-op bir güncelleme — sadece var olan satırın id'sini `returning` ile almak için; `lock_receipt_core_fields` trigger'ı `is distinct from` kontrolü yaptığından bu no-op güncelleme trigger'ı tetiklemez).
    - `receipt_items` insert'ine `on conflict (receipt_id, line_no) do nothing` eklenmeli (bu kısıt zaten `0004_receipt_items_ve_receipts_sikilastirma.sql`'de tam bu senaryo için eklenmişti — `receipt_items_receipt_line_unique`). `do nothing` seçildi (`do update` değil) ki bir retry, kalite ekibinin o satır için o ana kadar girmiş olabileceği `uygunluk`/`note` değerini asla ezmesin.
    - `p_submit_to_quality` bloğundaki `update` ifadesine `and status = 'taslak'` eklenmeli (retry sırasında kayıt zaten `kalite_bekliyor`/`onaylandi` olmuşsa geri almasın).
  - `src/pages/yeni-kabul.js`'teki `save()` fonksiyonu artık farklı — Fatura No/Araç Hijyeni/Araç Sıcaklığı alanları ve satır başı Ürün Sıcaklığı/Yarı Ömür Geçti alanları var, çift-gönderim engeli (`buttons.forEach(b => b.disabled = true)`) ve miktar>0 kontrolü zaten mevcut. Task 3'ün `save()` değişikliği bu GERÇEK fonksiyonun üzerine, `payload`'a artık formdaki tüm yeni alanları da (faturaNo, aracHijyenUygun, aracSicaklik, ve her item'ın urunSicakligi/yariOmurGecti) dahil ederek uygulanmalı.
  - `src/main.js` artık `try/catch` ile sarılı, `escapeHtml` kullanıyor, nav rol bazlı koşullu — Task 2/3'ün `main.js` değişiklikleri bu GERÇEK yapının içine, mevcut hata yönetimini bozmadan eklenmeli.
  - Yukarıdakiler dışında planın mimari niyeti (localStorage cache-aside, idb-keyval kuyruk, `online` event senkronu) değişmedi — sadece somut kod, üzerine inşa edildiği dosyaların gerçek güncel hâliyle uyumlu olmalı.
- **Task 3 final review bulguları — düzeltme turu:**
  1. **KRİTİK — Migration 0011'in `on conflict (client_uuid) do update ... returning id` yaklaşımı yanlış.** `INSERT ... ON CONFLICT DO UPDATE`, çakışan satıra karşı UPDATE RLS politikasının (`receipts_update_manager_draft`) `USING` ifadesini de kontrol eder (Postgres, `WCO_RLS_CONFLICT_CHECK`). Bu politika sadece `status = 'taslak'` (aynı depo_yonetici) veya `status = 'kalite_bekliyor'` (kalite_ekibi) durumlarını kapsıyor. Kayıt ilk denemede zaten `kalite_bekliyor`/`onaylandi`/`reddedildi`'ye taşınmışsa (yani "Kaydet ve Kalite Onayına Gönder" ile kaydedilmiş bir kayıt tekrar denendiğinde), retry `42501 RLS ihlali` hatasıyla PATLAR — kayıt sonsuza kadar kuyrukta kilitli kalır, tam da bu migration'ın önlemesi gereken senaryo. **Doğru yaklaşım:** `on conflict (client_uuid) do nothing returning id into v_receipt_id;` sonra `if v_receipt_id is null then` (çakışma oldu demek) `select id into v_receipt_id from receipts where client_uuid = p_client_uuid; return v_receipt_id;` ile ERKEN DÖN — items insert'e ve submit-to-quality bloğuna hiç girme (RPC tek transaction olduğu için, `client_uuid` çakışması = önceki çağrı TAMAMEN commit olmuş demek, yapılacak başka bir şey yok). Bu yaklaşım hem RLS sorununu hem `lock_receipt_core_fields` sorununu hem de `receipt_items_insert_manager`'ın kalite_bekliyor durumundaki bir receipt'e satır eklemeyi reddetme sorununu tek seferde ortadan kaldırır.
  2. **KRİTİK — `yeni-kabul.js`'teki `save()` fonksiyonu "zehirli" (asla senkronize olamayacak) kayıtlar kuyruğa alabilir.** `isNetworkError`, `!navigator.onLine` ise hatanın türüne BAKMADAN `true` döner. Bu yüzden `save()` içindeki yerel doğrulama hataları (`!state.companyId`, miktar>0, boş satır listesi) try/catch bloğunun İÇİNDEYSE ve kullanıcı çevrimdışıyken tetiklenirse, bu yerel/senkron hatalar da "ağ hatası" sanılıp kuyruğa yazılır — ve senkronize edilmeye çalışıldığında AYNI yerel hatayla sonsuza dek başarısız olur. **Düzeltme:** Tüm yerel doğrulamalar (firma seçili mi, en az bir satır var mı, tüm miktarlar > 0 mı) try/catch bloğunun DIŞINA, `createReceiptWithItems` çağrısından önce senkron olarak yapılmalı ve başarısız olursa direkt kırmızı hata mesajı gösterip fonksiyondan çıkmalı — kuyruğa yazma sadece gerçek `createReceiptWithItems` RPC çağrısını saran try/catch içinde olmalı.
  3. **KRİTİK — Kuyruk okuma-değiştirme-yazma atomik değil, senkron sırasında eklenen bir kayıt kaybolabilir.** `syncQueuedReceipts`, kuyruğu okur, senkronize etmeye çalışır, sonunda `remaining` dizisini olduğu gibi geri yazar. Bu sırada (yavaş bir senkron devam ederken) kullanıcı yeni bir kayıt kaydedip kuyruğa eklerse, `syncQueuedReceipts`'in sondaki yazması bu yeni kaydı SİLER — kullanıcıya "kaydedildi" denmiş bir kayıt sessizce kaybolur. Ayrıca `main.js`'de `renderApp()` açılışta İKİ KEZ çağrılıyor (`onAuthStateChange`'in `INITIAL_SESSION` olayı + dosyanın sonundaki çıplak çağrı), ikisi de `trySync()` tetikliyor ve aralarında hiçbir eşzamanlılık koruması yok — aynı kayıt iki paralel senkron denemesine girip birbirinin üzerine yazabilir. **Düzeltme:** `idb-keyval`'ın `update()` fonksiyonuyla atomik oku-değiştir-yaz yapılmalı; senkronize edilen kayıtlar `clientUuid` eşleştirmesiyle tek tek kuyruktan çıkarılmalı (dizinin tamamını üzerine yazmak yerine); `syncQueuedReceipts`'in eşzamanlı ikinci bir çağrısını engelleyen bir "zaten çalışıyor" bayrağı eklenmeli.
  4. **Önemli — kuyruktaki bir kayıt kalıcı olarak başarısız olursa (örn. ürün/firma sonradan silinmiş) hiçbir kullanıcıya görünür sinyal yok, sonsuza dek sessizce yeniden denenir.** Her kuyruk kaydına `attempts` (deneme sayısı) ve `lastError` (son hata mesajı) eklenmeli; `components/offline-banner.js` bağlantı durumunun yanında bekleyen kayıt sayısını da göstermeli ("N kayıt senkronize edilecek" — bu zaten planın orijinal dosya yapısı yorumunda vardı ama hiç uygulanmadı).
  5. **Önemli — kuyruk kayıtları kullanıcıya bağlı değil.** Paylaşımlı bir depo tableti senaryosunda, A kullanıcısının kaydettiği bir kuyruk kaydı B kullanıcısı oturum açtığında senkronize edilmeye çalışılırsa `received_by = auth.uid()` RLS kısıtına takılıp sonsuza dek başarısız olur. `syncQueuedReceipts`, mevcut oturumun `user.id`'sini kuyruk kaydının `payload.receivedBy` alanıyla karşılaştırıp eşleşmiyorsa o kaydı bu turda hiç denemeden atlamalı (başarısız saymadan, sadece geçmeli).

---

## Dosya Yapısı

```
src/
  lib/
    offline-cache.js       # generic localStorage cache-aside yardımcı fonksiyonlar
    offline-queue.js         # idb-keyval tabanlı kuyruk: enqueue/list/remove/sync
    companies.js              # (mevcut dosyaya ekleme) offline cache fallback
    products.js                # (mevcut dosyaya ekleme) offline cache fallback
    receipts.js                  # (mevcut dosyaya ekleme) createReceiptWithItems idempotent client_uuid
  pages/
    yeni-kabul.js                  # (mevcut dosyaya ekleme) ağ hatasında kuyruğa yazma
  components/
    offline-banner.js                # "Çevrimdışı" / "N kayıt senkronize edilecek" göstergesi
  main.js                             # (mevcut dosyaya ekleme) SW register + offline banner + sync tetikleyici
vite.config.js                        # (mevcut dosyaya ekleme) runtime caching kuralları
tests/
  offline-cache.test.js
  offline-queue.test.js
```

---

### Task 1: Firma/Ürün Listeleri İçin Offline Önbellek

**Files:**
- Create: `src/lib/offline-cache.js`
- Modify: `src/lib/companies.js`
- Modify: `src/lib/products.js`
- Test: `tests/offline-cache.test.js`

**Interfaces:**
- Produces: `cacheAside(key, fetchFn)` — verilen `fetchFn` başarılı olursa sonucu `localStorage`'a yazar ve döner; `fetchFn` ağ hatasıyla başarısız olursa `localStorage`'daki son değeri döner (yoksa hatayı yeniden fırlatır).

- [ ] **Step 1: `tests/offline-cache.test.js` yaz**

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cacheAside, isNetworkError } from '../src/lib/offline-cache.js';

describe('cacheAside', () => {
  beforeEach(() => localStorage.clear());

  it('başarılı fetchFn sonucunu localStorage a yazar ve döner', async () => {
    const result = await cacheAside('test-key', () => Promise.resolve([{ id: 1 }]));
    expect(result).toEqual([{ id: 1 }]);
    expect(JSON.parse(localStorage.getItem('test-key'))).toEqual([{ id: 1 }]);
  });

  it('ağ hatasında önbellekteki değeri döner', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 99 }]));
    const netError = new TypeError('Failed to fetch');
    const result = await cacheAside('test-key', () => Promise.reject(netError));
    expect(result).toEqual([{ id: 99 }]);
  });

  it('önbellek de yoksa hatayı yeniden fırlatır', async () => {
    const netError = new TypeError('Failed to fetch');
    await expect(cacheAside('missing-key', () => Promise.reject(netError))).rejects.toThrow('Failed to fetch');
  });

  it('ağ dışı (uygulama) hatasında önbelleğe düşmez, hatayı fırlatır', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 99 }]));
    await expect(cacheAside('test-key', () => Promise.reject(new Error('RLS reddetti')))).rejects.toThrow('RLS reddetti');
  });
});

describe('isNetworkError', () => {
  it('TypeError Failed to fetch icin true doner', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });
  it('normal Error icin false doner', () => {
    expect(isNetworkError(new Error('RLS reddetti'))).toBe(false);
  });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `offline-cache.js` bulunamadı.

- [ ] **Step 3: `src/lib/offline-cache.js` yaz**

```javascript
export function isNetworkError(err) {
  if (!navigator.onLine) return true;
  return err instanceof TypeError && /fetch|network/i.test(err.message);
}

export async function cacheAside(key, fetchFn) {
  try {
    const result = await fetchFn();
    localStorage.setItem(key, JSON.stringify(result));
    return result;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = localStorage.getItem(key);
      if (cached) return JSON.parse(cached);
    }
    throw err;
  }
}
```

- [ ] **Step 4: Testi tekrar çalıştır**

Run: `npm run test`
Expected: PASS (5/5).

- [ ] **Step 5: `src/lib/companies.js` içindeki `listCompanies`'i `cacheAside` kullanacak şekilde güncelle**

```javascript
import { supabase } from './supabase.js';
import { cacheAside } from './offline-cache.js';

export async function listCompanies() {
  return cacheAside('cache:companies', async () => {
    const { data, error } = await supabase.from('companies').select('id, name, sira_no').order('name');
    if (error) throw error;
    return data;
  });
}

// addCompany değişmeden kalır
```

- [ ] **Step 6: `src/lib/products.js` içindeki `listProducts`'ı aynı şekilde güncelle**

```javascript
import { cacheAside } from './offline-cache.js';

export async function listProducts() {
  return cacheAside('cache:products', async () => {
    const { data, error } = await supabase.from('products').select('id, code, name, unit, category').order('category').order('name');
    if (error) throw error;
    return data;
  });
}

// addProduct ve VALID_UNITS/VALID_CATEGORIES değişmeden kalır
```

- [ ] **Step 7: Mevcut `companies.test.js` ve `products.test.js` testlerinin hâlâ geçtiğini doğrula**

Run: `npm run test`
Expected: PASS — `cacheAside` başarılı `fetchFn` durumunda sonucu olduğu gibi döndürdüğü için Plan 2'deki mock tabanlı testler etkilenmez.

- [ ] **Step 8: Tarayıcıda manuel doğrula**

1. `npm run dev`, giriş yap, "Firmalar" ve "Ürünler" sayfalarını bir kez aç (önbelleğin dolması için).
2. Tarayıcı DevTools → Network sekmesi → "Offline" moduna geç.
3. Sayfayı yenilemeden "Firmalar"a tekrar git (router içi navigasyon, tam sayfa yenileme değil).

Expected: Liste yine görünür (localStorage'dan geldi), konsolda hata olsa bile ekranda "Sonuç bulunamadı" gibi bir boşluk olmaz.

- [ ] **Step 9: Commit**

```bash
git add src/lib/offline-cache.js src/lib/companies.js src/lib/products.js tests/offline-cache.test.js
git commit -m "feat: firma/urun listeleri icin localStorage offline onbellek"
```

---

### Task 2: PWA Manifest, Service Worker Runtime Caching, Offline Göstergesi

**Files:**
- Modify: `vite.config.js` (Plan 1'de oluşturulmuştu)
- Create: `src/components/offline-banner.js`
- Modify: `src/main.js`

**Interfaces:**
- Produces: `renderOfflineBanner(container)` — bağlantı durumunu dinler, `online`/`offline` event'lerinde otomatik günceller.

- [ ] **Step 1: `vite.config.js` içindeki `workbox` bloğunu genişlet**

```javascript
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1/companies') || url.pathname.startsWith('/rest/v1/products'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-master-data',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          }
        ]
      }
```

- [ ] **Step 2: `src/components/offline-banner.js` yaz**

```javascript
export function renderOfflineBanner(container) {
  const el = document.createElement('div');
  el.id = 'offline-banner';
  el.style.cssText = 'display:none;background:#b00020;color:white;text-align:center;padding:0.4rem;font-size:0.9rem;';
  container.prepend(el);

  function update() {
    el.style.display = navigator.onLine ? 'none' : 'block';
    el.textContent = 'Çevrimdışısınız — mal kabul kayıtları cihazda bekletilecek.';
  }

  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}
```

- [ ] **Step 3: `src/main.js` başına ekle**

```javascript
import { renderOfflineBanner } from './components/offline-banner.js';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });
```

`renderApp` fonksiyonunun en başına (profil kontrolünden önce, `app.innerHTML` atanmadan hemen sonrasına) ekle — `app` elemanının en tepesine banner koymak için `renderApp` içindeki ilk satıra:

```javascript
async function renderApp() {
  const profile = await getCurrentProfile();
  if (!profile) {
    renderLogin(app, renderApp);
    renderOfflineBanner(app);
    return;
  }
  app.innerHTML = `...`; // (mevcut içerik değişmeden kalır)
  renderOfflineBanner(app);
  // ...devamı değişmeden kalır
}
```

- [ ] **Step 4: Build alıp service worker'ın üretildiğini doğrula**

Run: `npm run build`
Expected: `dist/sw.js` ve `dist/manifest.webmanifest` dosyaları oluşur, build hatasız biter.

- [ ] **Step 5: `npm run preview` ile PWA davranışını tarayıcıda doğrula**

Run: `npm run preview`
Expected: Tarayıcı adres çubuğunda "yükle" (install) ikonu görünür (Chrome). DevTools → Application → Service Workers'da bir SW kayıtlı görünür. DevTools → Network → Offline moduna geçip sayfayı yenile → uygulama app-shell'i yine yükler (boş beyaz sayfa yerine login/ana ekran görünür) ve kırmızı "Çevrimdışısınız" banner'ı görünür.

- [ ] **Step 6: Commit**

```bash
git add vite.config.js src/components/offline-banner.js src/main.js
git commit -m "feat: PWA service worker runtime caching ve cevrimdisi gostergesi"
```

---

### Task 3: Offline Kuyruk ve Otomatik Senkronizasyon

**Files:**
- Modify: `package.json` (idb-keyval bağımlılığı)
- Create: `src/lib/offline-queue.js`
- Modify: `src/lib/receipts.js` (idempotent `client_uuid` desteği)
- Modify: `src/pages/yeni-kabul.js` (ağ hatasında kuyruğa yazma)
- Modify: `src/main.js` (uygulama açılışında ve `online` event'inde senkron tetikleme)
- Test: `tests/offline-queue.test.js`

**Interfaces:**
- Consumes: `isNetworkError` (Task 1), `createReceiptWithItems`/`submitForQuality` (Plan 3, bu görevde güncellenir).
- Produces: `enqueueReceipt(payload)`, `listQueuedReceipts()`, `syncQueuedReceipts()` — `main.js` açılışta ve `online` event'inde `syncQueuedReceipts()`'i çağırır.

- [ ] **Step 1: `idb-keyval` bağımlılığını ekle**

`package.json` `dependencies` bloğuna ekle: `"idb-keyval": "^6.2.1"`.

Run: `npm install`

- [ ] **Step 2: `tests/offline-queue.test.js` yaz**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map();
vi.mock('idb-keyval', () => ({
  get: vi.fn((key) => Promise.resolve(store.get(key))),
  set: vi.fn((key, value) => { store.set(key, value); return Promise.resolve(); })
}));

const createReceiptWithItems = vi.fn();
vi.mock('../src/lib/receipts.js', () => ({ createReceiptWithItems, submitForQuality: vi.fn() }));

import { enqueueReceipt, listQueuedReceipts, syncQueuedReceipts } from '../src/lib/offline-queue.js';

describe('offline-queue', () => {
  beforeEach(() => {
    store.clear();
    createReceiptWithItems.mockReset();
  });

  it('enqueueReceipt kuyruga bir kayit ekler', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [] }, sendToQuality: false });
    const queued = await listQueuedReceipts();
    expect(queued).toHaveLength(1);
    expect(queued[0].clientUuid).toBe('c1');
  });

  it('syncQueuedReceipts basarili gonderilen kaydi kuyruktan siler', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [] }, sendToQuality: false });
    createReceiptWithItems.mockResolvedValue('server-id-1');

    const result = await syncQueuedReceipts();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(await listQueuedReceipts()).toHaveLength(0);
  });

  it('syncQueuedReceipts basarisiz kaydi kuyrukta birakir', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [] }, sendToQuality: false });
    createReceiptWithItems.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await syncQueuedReceipts();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(await listQueuedReceipts()).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu doğrula**

Run: `npm run test`
Expected: FAIL — `offline-queue.js` bulunamadı.

- [ ] **Step 4: `src/lib/offline-queue.js` yaz**

```javascript
import { get, set } from 'idb-keyval';
import { createReceiptWithItems, submitForQuality } from './receipts.js';

const QUEUE_KEY = 'offline-receipt-queue';

async function readQueue() {
  return (await get(QUEUE_KEY)) || [];
}

async function writeQueue(queue) {
  await set(QUEUE_KEY, queue);
}

export async function enqueueReceipt({ clientUuid, payload, sendToQuality }) {
  const queue = await readQueue();
  queue.push({ clientUuid, payload, sendToQuality, queuedAt: new Date().toISOString() });
  await writeQueue(queue);
}

export async function listQueuedReceipts() {
  return readQueue();
}

export async function syncQueuedReceipts() {
  const queue = await readQueue();
  const remaining = [];
  let synced = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      const receiptId = await createReceiptWithItems({ ...entry.payload, clientUuid: entry.clientUuid });
      if (entry.sendToQuality) await submitForQuality(receiptId);
      synced += 1;
    } catch (err) {
      failed += 1;
      remaining.push(entry);
    }
  }

  await writeQueue(remaining);
  return { synced, failed };
}
```

- [ ] **Step 5: Testi tekrar çalıştır**

Run: `npm run test`
Expected: PASS (3/3).

- [ ] **Step 6: `src/lib/receipts.js` içindeki `createReceiptWithItems`'ı idempotent `client_uuid` destekleyecek şekilde güncelle**

```javascript
export async function createReceiptWithItems({ companyId, receiptDate, irsaliyeNo, siparisNo, receivedBy, items, clientUuid }) {
  if (!items || items.length === 0) throw new Error('En az bir ürün satırı gerekli');

  const uuid = clientUuid || crypto.randomUUID();

  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .insert({
      client_uuid: uuid,
      company_id: companyId,
      receipt_date: receiptDate,
      irsaliye_no: irsaliyeNo || null,
      siparis_no: siparisNo || null,
      received_by: receivedBy,
      status: 'taslak'
    })
    .select()
    .single();

  let receiptId;
  if (receiptError) {
    if (receiptError.code === '23505') {
      // client_uuid zaten var: bu kayıt daha önce başarıyla senkronize olmuş (veya kısmen
      // senkronize olup satırları eklenmeden yarıda kalmış olabilir) — receipt'i yeniden
      // oluşturmuyoruz ama satırları aşağıdaki upsert ile yine de (idempotent şekilde) yazıyoruz.
      const { data: existing, error: findError } = await supabase
        .from('receipts')
        .select('id')
        .eq('client_uuid', uuid)
        .single();
      if (findError) throw findError;
      receiptId = existing.id;
    } else {
      throw receiptError;
    }
  } else {
    receiptId = receipt.id;
  }

  const rows = items.map((item, index) => ({
    receipt_id: receiptId,
    product_id: item.productId,
    line_no: index + 1,
    lot_no: item.lotNo || null,
    skt: item.skt || null,
    quantity: item.quantity,
    unit: item.unit,
    uygunluk: 'beklemede'
  }));
  // upsert + onConflict: aynı (receipt_id, line_no) ile tekrar denenen bir senkron, satırları
  // sessizce atlamak yerine üzerine yazar — Plan 1 Task 7'de eklenen
  // receipt_items_receipt_line_unique kısıtı bu upsert'in idempotent çalışmasını sağlar.
  const { error: itemsError } = await supabase
    .from('receipt_items')
    .upsert(rows, { onConflict: 'receipt_id,line_no' });
  if (itemsError) throw itemsError;

  return receiptId;
}
```

- [ ] **Step 7: `tests/receipts.test.js` (Plan 3) testinin hâlâ geçtiğini doğrula**

Run: `npm run test`
Expected: PASS — mevcut mock `single()` başarılı `{data: {id: 'r1'}}` döndürdüğü için `23505` dalına girilmez, eski davranış korunur.

- [ ] **Step 8: `src/pages/yeni-kabul.js` içindeki `save` fonksiyonunu offline kuyruğa yazacak şekilde güncelle**

```javascript
import { isNetworkError } from '../lib/offline-cache.js';
import { enqueueReceipt } from '../lib/offline-queue.js';

// ... mevcut importların yanına eklenir

  async function save(sendToQuality) {
    const msg = container.querySelector('#kabul-msg');
    msg.textContent = '';
    if (!state.companyId) {
      msg.style.color = '#b00020';
      msg.textContent = 'Hata: Lütfen bir firma seçin';
      return;
    }
    const clientUuid = crypto.randomUUID();
    const payload = {
      companyId: state.companyId,
      receiptDate: container.querySelector('#kabul-tarih').value,
      irsaliyeNo: container.querySelector('#kabul-irsaliye').value,
      siparisNo: container.querySelector('#kabul-siparis').value,
      receivedBy: profile.id,
      items: state.items
    };
    try {
      const receiptId = await createReceiptWithItems({ ...payload, clientUuid });
      if (sendToQuality) await submitForQuality(receiptId);
      msg.style.color = 'green';
      msg.textContent = sendToQuality ? 'Kaydedildi ve kalite onayına gönderildi.' : 'Taslak olarak kaydedildi.';
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueReceipt({ clientUuid, payload, sendToQuality });
        msg.style.color = '#a15c00';
        msg.textContent = 'Çevrimdışısınız — kayıt cihazda bekletildi, bağlantı gelince otomatik gönderilecek.';
      } else {
        msg.style.color = '#b00020';
        msg.textContent = 'Hata: ' + err.message;
      }
    }
    state.items = [];
    state.companyId = null;
    renderItemsBody();
  }
```

(Bu blok `renderYeniKabul` fonksiyonu içindeki mevcut `save` fonksiyonunun tamamının yerine geçer.)

- [ ] **Step 9: `src/main.js`'e açılışta ve `online` event'inde senkron tetikleyici ekle**

```javascript
import { syncQueuedReceipts } from './lib/offline-queue.js';

async function trySync() {
  if (!navigator.onLine) return;
  const { synced, failed } = await syncQueuedReceipts();
  if (synced > 0) console.info(`${synced} bekleyen mal kabul kaydı senkronize edildi.`);
  if (failed > 0) console.warn(`${failed} kayıt senkronize edilemedi, tekrar denenecek.`);
}

window.addEventListener('online', trySync);
trySync();
```

(Bu blok, dosyanın en altına, mevcut `onAuthStateChange(() => renderApp()); renderApp();` satırlarının yanına eklenir.)

- [ ] **Step 10: Uçtan uca manuel doğrulama (gerçek offline senaryo)**

1. `npm run dev`, giriş yap, "Yeni Mal Kabul"a git, firma + en az bir ürün satırı ekle.
2. DevTools → Network → Offline moduna geç.
3. "Taslak Kaydet"e bas.

Expected: Turuncu "Çevrimdışısınız — kayıt cihazda bekletildi..." mesajı görünür. DevTools → Application → IndexedDB → `keyval-store` içinde `offline-receipt-queue` altında kaydı gör.

4. DevTools → Network → Offline modunu kapat (Online'a al).
5. Sayfayı yenilemeden birkaç saniye bekle, ya da tekrar "Yeni Mal Kabul" sayfasına git (bu, `online` event'ini tetiklemez; test için DevTools Network panelinden "Offline" kutucuğunu kapatmak tarayıcıda gerçek bir `online` event'i tetikler).

Expected: Konsolda "1 bekleyen mal kabul kaydı senkronize edildi." yazar. Supabase Table Editor'de `receipts` tablosunda ilgili `client_uuid` ile kayıt görünür. IndexedDB'deki kuyruk boşalmıştır.

- [ ] **Step 11: Commit**

```bash
git add package.json src/lib/offline-queue.js src/lib/receipts.js src/pages/yeni-kabul.js src/main.js tests/offline-queue.test.js
git commit -m "feat: cevrimdisi mal kabul kuyrugu ve otomatik senkronizasyon"
```

---

## Bu Plan Tamamlandığında Doğrulanacaklar

- `npm run test` yeşil (offline-cache, offline-queue testleri dahil, mevcut tüm testler kırılmadan).
- `npm run build` başarılı, `dist/sw.js` üretiliyor.
- Uygulama Chrome'da "ana ekrana ekle" ile kurulabiliyor.
- Çevrimdışıyken firma/ürün listeleri görünmeye devam ediyor, yeni mal kabul kaydı cihazda bekletiliyor; çevrimiçi olunca otomatik ve tekrarsız (idempotent) şekilde Supabase'e gönderiliyor.
- Bu, beş planın da (Supabase altyapı → firma/ürün yönetimi → mal kabul formu → arama/çıktı → PWA offline) uçtan uca bağlı, çalışan bir sistem oluşturduğu son doğrulama noktasıdır.
