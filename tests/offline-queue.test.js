import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map();
vi.mock('idb-keyval', () => ({
  get: vi.fn((key) => Promise.resolve(store.get(key))),
  set: vi.fn((key, value) => { store.set(key, value); return Promise.resolve(); })
}));

// vi.mock çağrıları dosyanın en tepesine "hoist" edilir; factory içinde referans verilen bir
// değişken vitest 2.x'te ya "mock" ile başlamalı ya da vi.hoisted() ile tanımlanmalı, aksi halde
// TDZ (temporal dead zone) ReferenceError'ı alınır — brief'in orijinal `const createReceiptWithItems
// = vi.fn()` şekli bu yüzden gerçek vitest sürümünde çalışmıyordu, vi.hoisted() ile düzeltildi.
const { createReceiptWithItems } = vi.hoisted(() => ({ createReceiptWithItems: vi.fn() }));
// Gerçek receipts.js artık TEK bir atomik RPC sarmalayıcısı (create + isteğe bağlı kalite
// onayına gönderme aynı çağrıda) — burada ayrı bir submitForQuality mock'una gerek yok,
// ve offline-queue.js onu import etmemeli.
vi.mock('../src/lib/receipts.js', () => ({ createReceiptWithItems }));

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

  it('syncQueuedReceipts basarisiz kaydi kuyrukta birakir (ag hatasi)', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [] }, sendToQuality: false });
    // Gerçek supabase-js şekli: instanceof TypeError DEĞİL, code:'' olan düz nesne
    // (bkz. offline-cache.js/isNetworkError'daki gerekçe). Task 1'de düzeltilen
    // isNetworkError'un TypeError'a değil bu şekle göre çalıştığını burada da doğruluyoruz.
    createReceiptWithItems.mockRejectedValue({ message: 'TypeError: Failed to fetch', details: '...', hint: '', code: '' });

    const result = await syncQueuedReceipts();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(await listQueuedReceipts()).toHaveLength(1);
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

  it('syncQueuedReceipts uygulama seviyesi (ag disi) hatada da kaydi kuyrukta birakir', async () => {
    // Not: Bu davranış bilinçli — syncQueuedReceipts'in kendisi hatayı sınıflandırmaz,
    // her türlü hatada kaydı kuyrukta bırakır (kullanıcıya gösterilecek bir UI yok, sadece
    // arka planda sessizce tekrar dener). Ağ hatası / uygulama hatası ayrımı enqueue ANINDA
    // yeni-kabul.js'de isNetworkError ile yapılır (kötü kayıtlar hiç kuyruğa GİRMEZ).
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [] }, sendToQuality: false });
    createReceiptWithItems.mockRejectedValue({ message: 'RLS reddetti', details: null, hint: null, code: '42501' });

    const result = await syncQueuedReceipts();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(await listQueuedReceipts()).toHaveLength(1);
  });

  it('birden fazla kayittan biri basarili biri basarisiz olursa dogru ayrilir', async () => {
    await enqueueReceipt({ clientUuid: 'c1', payload: { companyId: 1, items: [] }, sendToQuality: false });
    await enqueueReceipt({ clientUuid: 'c2', payload: { companyId: 2, items: [] }, sendToQuality: false });
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
});
