import { get, set } from 'idb-keyval';
import { createReceiptWithItems } from './receipts.js';

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

// createReceiptWithItems artık TEK bir atomik RPC çağrısı (bkz. src/lib/receipts.js) — hem
// kaydı+satırları oluşturur hem de (submitToQuality:true ise) aynı transaction içinde kalite
// onayına gönderir. Bu yüzden burada ayrı bir submitForQuality çağrısına gerek yok; brief'in
// eski (iki adımlı) örneği artık gerçek receipts.js ile uyumsuz.
//
// Aynı clientUuid ile ikinci bir deneme (ör. sunucu tarafında ilk deneme aslında başarılı oldu
// ama yanıt istemciye ulaşmadan bağlantı koptu) supabase/migrations/0011_receipt_rpc_idempotent.sql
// sayesinde hata fırlatmaz — aynı receipt id'yi idempotent şekilde döner.
export async function syncQueuedReceipts() {
  const queue = await readQueue();
  const remaining = [];
  let synced = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      await createReceiptWithItems({
        ...entry.payload,
        clientUuid: entry.clientUuid,
        submitToQuality: entry.sendToQuality
      });
      synced += 1;
    } catch (err) {
      failed += 1;
      remaining.push(entry);
    }
  }

  await writeQueue(remaining);
  return { synced, failed };
}
