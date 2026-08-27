import { supabase } from './supabase.js';

export async function createReceiptWithItems({ companyId, receiptDate, irsaliyeNo, siparisNo, receivedBy, items }) {
  if (!items || items.length === 0) throw new Error('En az bir ürün satırı gerekli');

  const { data, error } = await supabase.rpc('create_receipt_with_items', {
    p_company_id: companyId,
    p_receipt_date: receiptDate,
    p_irsaliye_no: irsaliyeNo || null,
    p_siparis_no: siparisNo || null,
    p_received_by: receivedBy,
    p_client_uuid: crypto.randomUUID(),
    p_items: items.map((item, index) => ({
      productId: item.productId,
      lineNo: index + 1,
      lotNo: item.lotNo || null,
      skt: item.skt || null,
      quantity: item.quantity,
      unit: item.unit
    }))
  });
  if (error) throw error;
  return data;
}

export async function submitForQuality(receiptId) {
  const { error } = await supabase.from('receipts').update({ status: 'kalite_bekliyor' }).eq('id', receiptId);
  if (error) throw error;
}

export async function listPendingQuality() {
  const { data, error } = await supabase
    .from('receipts')
    .select('id, receipt_date, irsaliye_no, siparis_no, companies (name)')
    .eq('status', 'kalite_bekliyor')
    .order('receipt_date');
  if (error) throw error;
  return data;
}

export async function getReceiptDetail(receiptId) {
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select('id, company_id, receipt_date, irsaliye_no, siparis_no, status, received_by, quality_by, quality_note')
    .eq('id', receiptId)
    .single();
  if (receiptError) throw receiptError;

  const { data: items, error: itemsError } = await supabase
    .from('receipt_items')
    .select('id, product_id, lot_no, skt, quantity, unit, uygunluk, note, products (code, name)')
    .eq('receipt_id', receiptId);
  if (itemsError) throw itemsError;

  return { receipt, items };
}

export async function updateItemUygunluk(itemId, uygunluk, note) {
  const { error } = await supabase.from('receipt_items').update({ uygunluk, note: note || null }).eq('id', itemId);
  if (error) throw error;
}

export async function finalizeQuality(receiptId, { decision, qualityBy, qualityNote }) {
  const { items } = await getReceiptDetail(receiptId);
  if (decision === 'onaylandi' && items.some((i) => i.uygunluk === 'beklemede')) {
    throw new Error('Tüm satırlar uygun/uygun değil olarak işaretlenmeden onaylanamaz');
  }
  const { error } = await supabase
    .from('receipts')
    .update({ status: decision, quality_by: qualityBy, quality_note: qualityNote || null })
    .eq('id', receiptId);
  if (error) throw error;
}
