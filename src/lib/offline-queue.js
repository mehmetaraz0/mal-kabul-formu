import { get, update } from 'idb-keyval';
import { createReceiptWithItems } from './receipts.js';
import { supabase } from './supabase.js';

const QUEUE_KEY = 'offline-receipt-queue';

async function readQueue() {
  return (await get(QUEUE_KEY)) || [];
}

export async function enqueueReceipt({ clientUuid, payload, sendToQuality }) {
  // `update()` (idb-keyval) IndexedDB'nin kendi readwrite transaction'ı içinde atomik bir
  // oku-değiştir-yaz yapar — `get()` + `set()`'i ayrı ayrı çağırmaktan farklı olarak, aynı anda
  // devam eden bir `syncQueuedReceipts()` çağrısının (o da `update()` kullanıyor, bkz. aşağı)
  // kendi yazmasıyla arada çakışıp birbirini ezmesi mümkün değil (final review bulgusu 3).
  await update(QUEUE_KEY, (queue = []) => [
    ...queue,
    { clientUuid, payload, sendToQuality, queuedAt: new Date().toISOString(), attempts: 0, lastError: null }
  ]);
}

export async function listQueuedReceipts() {
  return readQueue();
}

async function removeFromQueue(clientUuid) {
  // Diziyi TAMAMEN üzerine yazmak yerine, sadece bu tek `clientUuid`'i filtreleyip çıkarıyoruz.
  // Bu satır önemli: `queue` parametresi `update()`'in kendi callback'ine EN GÜNCEL (canlı) IDB
  // değerini verir — syncQueuedReceipts'in döngü başında aldığı eski snapshot değil. Yani bu
  // senkron sürerken `enqueueReceipt` ile kuyruğa eklenmiş YENİ bir kayıt varsa, bu filtre onu
  // hiç görmez ve dokunmaz — sadece senkronize ETTİĞİMİZ kaydı çıkarır. Eski implementasyon
  // (`writeQueue(remaining)` ile dizinin tamamını üzerine yazma) tam da bu YENİ kaydı sessizce
  // SİLERDİ.
  await update(QUEUE_KEY, (queue = []) => queue.filter((e) => e.clientUuid !== clientUuid));
}

async function recordFailure(clientUuid, message) {
  await update(QUEUE_KEY, (queue = []) =>
    queue.map((e) =>
      e.clientUuid === clientUuid
        ? { ...e, attempts: (e.attempts || 0) + 1, lastError: message || 'Bilinmeyen hata' }
        : e
    )
  );
}

// `syncQueuedReceipts`'in eşzamanlı iki çağrısının aynı kayda aynı anda `createReceiptWithItems`
// çağırıp birbirinin `removeFromQueue`/`recordFailure` yazmasının üzerine yazmasını (ör. aynı
// kaydı iki kez "başarılı" sayıp attempts'i iki kez artırmak gibi) engellemek için modül
// seviyesinde bir bayrak. main.js açılışta `renderApp()`'ı hem `onAuthStateChange`'in
// `INITIAL_SESSION` olayından hem de dosyanın sonundaki çıplak çağrıdan İKİ KEZ tetikleyebiliyor
// — ikisi de `trySync()` çağırıyor (final review bulgusu 3). İkinci eşzamanlı çağrı burada no-op
// olur (senkronize edilen/başarısız olan kayıt sayısı 0 döner) — bir sonraki `online` event'i
// veya açılış zaten kalan kayıtları tekrar deneyecektir, kayıp yok.
let syncInFlight = false;

// createReceiptWithItems artık TEK bir atomik RPC çağrısı (bkz. src/lib/receipts.js) — hem
// kaydı+satırları oluşturur hem de (submitToQuality:true ise) aynı transaction içinde kalite
// onayına gönderir. Bu yüzden burada ayrı bir submitForQuality çağrısına gerek yok; brief'in
// eski (iki adımlı) örneği artık gerçek receipts.js ile uyumsuz.
//
// Aynı clientUuid ile ikinci bir deneme (ör. sunucu tarafında ilk deneme aslında başarılı oldu
// ama yanıt istemciye ulaşmadan bağlantı koptu) supabase/migrations/0011_receipt_rpc_idempotent.sql
// sayesinde hata fırlatmaz — aynı receipt id'yi idempotent şekilde döner.
export async function syncQueuedReceipts() {
  if (syncInFlight) {
    return { synced: 0, failed: 0, skipped: 0 };
  }
  syncInFlight = true;
  try {
    // Bu turda hangi kayıtları deneyeceğimizi belirlemek için kuyruğun BİR anlık görüntüsünü
    // okuyoruz — ama her kaydın çıkarılması/güncellenmesi yukarıdaki `removeFromQueue`/
    // `recordFailure` ile TEK TEK ve atomik yapılıyor, bu yüzden bu snapshot'ın "bayat" olması
    // veri kaybına yol açmaz (bkz. removeFromQueue'nun yorumu).
    const queue = await readQueue();
    if (queue.length === 0) return { synced: 0, failed: 0, skipped: 0 };

    // Paylaşımlı depo tableti senaryosu (final review bulgusu 5): kuyruktaki bir kayıt A
    // kullanıcısı adına oluşturulmuş olabilir, ama şu an B kullanıcısı oturum açmış olabilir.
    // `receipts_insert_manager`/`receipt_items_insert_manager` RLS politikaları
    // `received_by = auth.uid()` şartını taşıdığından B'nin senkron denemesi sonsuza dek
    // başarısız olurdu. `getSession()` yerel/önbellekli bir okumadır (ağ round-trip'i
    // gerektirmez), bu yüzden burada ekstra bir ağ hatası riski yaratmaz.
    let currentUserId;
    try {
      const { data } = await supabase.auth.getSession();
      currentUserId = data?.session?.user?.id;
    } catch {
      currentUserId = undefined;
    }

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const entry of queue) {
      const receivedBy = entry.payload?.receivedBy;
      if (receivedBy && receivedBy !== currentUserId) {
        // Bu kayıt şu anki oturum sahibine ait değil (ya da hiç oturum yok) — bu turda hiç
        // denemeden atla. "Başarısız" SAYILMIYOR (attempts artmıyor) çünkü bu senkronizasyonun
        // gerçek bir denemesi değildi, sadece doğru kullanıcı beklerken geçildi.
        skipped += 1;
        continue;
      }
      try {
        await createReceiptWithItems({
          ...entry.payload,
          clientUuid: entry.clientUuid,
          submitToQuality: entry.sendToQuality
        });
        await removeFromQueue(entry.clientUuid);
        synced += 1;
      } catch (err) {
        failed += 1;
        await recordFailure(entry.clientUuid, err?.message || String(err));
      }
    }

    return { synced, failed, skipped };
  } finally {
    syncInFlight = false;
  }
}
