import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock çağrıları dosyanın en tepesine "hoist" edilir; factory içinde referans verilen bir
// değişken vitest 2.x'te ya "mock" ile başlamalı ya da vi.hoisted() ile tanımlanmalı, aksi halde
// TDZ (temporal dead zone) ReferenceError'ı alınır — brief'in orijinal `const createReceiptWithItems
// = vi.fn()` şekli bu yüzden gerçek vitest sürümünde çalışmıyordu, vi.hoisted() ile düzeltildi.
const { createReceiptWithItems, mockGetSession } = vi.hoisted(() => ({
  createReceiptWithItems: vi.fn(),
  mockGetSession: vi.fn()
}));

// Gerçek receipts.js artık TEK bir atomik RPC sarmalayıcısı (create + isteğe bağlı kalite
// onayına gönderme aynı çağrıda) — burada ayrı bir submitForQuality mock'una gerek yok,
// ve offline-queue.js onu import etmemeli.
vi.mock('../src/lib/receipts.js', () => ({ createReceiptWithItems }));

// syncQueuedReceipts artık şu anki oturumun user.id'sini kuyruk kaydının payload.receivedBy'ı
// ile karşılaştırıyor (final review bulgusu 5 — paylaşımlı cihaz senaryosu), bu yüzden
// supabase.js'in de mock'lanması gerekiyor.
vi.mock('../src/lib/supabase.js', () => ({ supabase: { auth: { getSession: mockGetSession } } }));

const store = new Map();

// Gerçek idb-keyval'in `update()`'i IndexedDB'nin kendi readwrite transaction'ı içinde ATOMIK
// çalışır — aynı store üzerindeki eşzamanlı `update()` çağrıları SERİLEŞTİRİLİR (biri bitmeden
// diğeri başlamaz). Bu mock, bir promise zinciriyle aynı davranışı taklit ediyor — aksi halde
// (ör. store.get + await + store.set ayrı ayrı, senkronizasyon olmadan) bu testler tam da
// gerçek IndexedDB'nin ÖNLEDİĞİ race condition'ı YANLIŞLIKLA "geçer" gösterebilirdi.
let updateChain = Promise.resolve();
vi.mock('idb-keyval', () => ({
  get: vi.fn((key) => Promise.resolve(store.get(key))),
  update: vi.fn((key, updater) => {
    const run = updateChain.then(async () => {
      const current = store.get(key);
      const next = await updater(current);
      store.set(key, next);
      return next;
    });
    updateChain = run.catch(() => {});
    return run;
  })
}));

import { enqueueReceipt, listQueuedReceipts, syncQueuedReceipts } from '../src/lib/offline-queue.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('offline-queue', () => {
  beforeEach(() => {
    store.clear();
    updateChain = Promise.resolve();
    createReceiptWithItems.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  });

  it('enqueueReceipt kuyruga bir kayit ekler (attempts:0, lastError:null ile)', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [] }, sendToQuality: false });
    const queued = await listQueuedReceipts();
    expect(queued).toHaveLength(1);
    expect(queued[0].clientUuid).toBe('c1');
    expect(queued[0].attempts).toBe(0);
    expect(queued[0].lastError).toBeNull();
  });

  it('syncQueuedReceipts basarili gonderilen kaydi kuyruktan siler', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [], receivedBy: 'u1' }, sendToQuality: false });
    createReceiptWithItems.mockResolvedValue('server-id-1');

    const result = await syncQueuedReceipts();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(await listQueuedReceipts()).toHaveLength(0);
  });

  it('syncQueuedReceipts basarisiz kaydi kuyrukta birakir ve attempts/lastError gunceller', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [], receivedBy: 'u1' }, sendToQuality: false });
    // Gerçek supabase-js şekli: instanceof TypeError DEĞİL, code:'' olan düz nesne
    // (bkz. offline-cache.js/isNetworkError'daki gerekçe).
    createReceiptWithItems.mockRejectedValue({ message: 'TypeError: Failed to fetch', details: '...', hint: '', code: '' });

    const result = await syncQueuedReceipts();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    const queued = await listQueuedReceipts();
    expect(queued).toHaveLength(1);
    expect(queued[0].attempts).toBe(1);
    expect(queued[0].lastError).toMatch(/Failed to fetch/);

    // İkinci bir başarısız deneme attempts'i 2'ye çıkarmalı (kalıcı hata görünürlüğü, bulgu 4).
    const result2 = await syncQueuedReceipts();
    expect(result2.failed).toBe(1);
    const queued2 = await listQueuedReceipts();
    expect(queued2[0].attempts).toBe(2);
  });

  it('syncQueuedReceipts tek bir atomik createReceiptWithItems cagrisi yapar (ayri submitForQuality YOK)', async () => {
    await enqueueReceipt({
      clientUuid: 'c1',
      payload: { companyId: 1, receiptDate: '2026-08-28', irsaliyeNo: 'IRS-1', siparisNo: '', receivedBy: 'u1', items: [{ productId: 1, quantity: 1, unit: 'kg' }], faturaNo: 'F-1', aracHijyenUygun: true, aracSicaklik: 4.1 },
      sendToQuality: true
    });
    createReceiptWithItems.mockResolvedValue('server-id-1');

    await syncQueuedReceipts();

    expect(createReceiptWithItems).toHaveBeenCalledTimes(1);
    expect(createReceiptWithItems).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 1,
      clientUuid: 'c1',
      submitToQuality: true,
      faturaNo: 'F-1',
      aracHijyenUygun: true,
      aracSicaklik: 4.1
    }));
  });

  it('birden fazla kayittan biri basarili biri basarisiz olursa dogru ayrilir', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [], receivedBy: 'u1' }, sendToQuality: false });
    await enqueueReceipt({ clientUuid: 'c2', payload: { companyId: 2, items: [], receivedBy: 'u1' }, sendToQuality: false });
    createReceiptWithItems
      .mockResolvedValueOnce('server-id-1')
      .mockRejectedValueOnce({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' });

    const result = await syncQueuedReceipts();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);
    const remaining = await listQueuedReceipts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].clientUuid).toBe('c2');
  });

  it('paylasimli cihaz: baska kullaniciya ait kayit bu turda atlanir, basarisiz sayilmaz', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [], receivedBy: 'baska-kullanici-id' }, sendToQuality: false });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

    const result = await syncQueuedReceipts();

    expect(createReceiptWithItems).not.toHaveBeenCalled();
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
    const remaining = await listQueuedReceipts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].attempts).toBe(0); // denenmedi, "başarısız" sayılmadı
  });

  it('oturum yokken (getSession user:null) receivedBy iceren kayitlar atlanir', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [], receivedBy: 'u1' }, sendToQuality: false });
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const result = await syncQueuedReceipts();

    expect(createReceiptWithItems).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('dogru kullanici oturum actiginda daha once atlanan kayit senkronize olur', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [], receivedBy: 'u2' }, sendToQuality: false });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    const first = await syncQueuedReceipts();
    expect(first.skipped).toBe(1);

    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u2' } } } });
    createReceiptWithItems.mockResolvedValue('server-id-1');
    const second = await syncQueuedReceipts();
    expect(second.synced).toBe(1);
    expect(await listQueuedReceipts()).toHaveLength(0);
  });

  it('esZAMANLI ikinci syncQueuedReceipts cagrisi no-op doner (in-flight koruma)', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [], receivedBy: 'u1' }, sendToQuality: false });
    const gate = deferred();
    const invoked = deferred();
    // `await Promise.resolve()` gibi sabit sayıda mikro-task beklemek kırılgan olurdu —
    // syncQueuedReceipts createReceiptWithItems'a ulaşana kadar birden fazla iç `await`
    // (readQueue, getSession) atlıyor. Bunun yerine createReceiptWithItems'ın FİİLEN
    // çağrıldığı anı kendi promise'iyle işaretliyoruz — böylece ikinci çağrıyı tam olarak
    // "syncInFlight kesinlikle true" olduğu anda tetikliyoruz, tahmine dayalı değil.
    createReceiptWithItems.mockImplementation(() => {
      invoked.resolve();
      return gate.promise;
    });

    const firstCall = syncQueuedReceipts();
    await invoked.promise;
    const secondCall = await syncQueuedReceipts();
    expect(secondCall).toEqual({ synced: 0, failed: 0, skipped: 0 });
    expect(createReceiptWithItems).toHaveBeenCalledTimes(1); // ikinci çağrı hiç RPC tetiklemedi

    gate.resolve('server-id-1');
    const firstResult = await firstCall;
    expect(firstResult.synced).toBe(1);
    expect(await listQueuedReceipts()).toHaveLength(0);
  });

  it('senkron devam ederken eklenen yeni kayit KAYBOLMAZ (atomik kaldirma)', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [], receivedBy: 'u1' }, sendToQuality: false });
    const gate = deferred();
    const invoked = deferred();
    createReceiptWithItems.mockImplementation(() => {
      invoked.resolve();
      return gate.promise;
    });

    const syncPromise = syncQueuedReceipts();
    await invoked.promise;
    // c1 hâlâ "işleniyor" durumdayken (createReceiptWithItems henüz resolve olmadı) yeni bir
    // kayıt kuyruğa ekleniyor — eski implementasyon (queue'nun tamamını `remaining` ile üzerine
    // yazma) bu yeni kaydı sync bittiğinde SİLERDİ.
    await enqueueReceipt({ clientUuid: 'c2', payload: { companyId: 2, items: [], receivedBy: 'u1' }, sendToQuality: false });

    gate.resolve('server-id-1');
    const result = await syncPromise;
    expect(result.synced).toBe(1); // sadece c1 bu turda denendi

    const remaining = await listQueuedReceipts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].clientUuid).toBe('c2'); // c2 kaybolmadı, kuyrukta kaldı
  });
});
