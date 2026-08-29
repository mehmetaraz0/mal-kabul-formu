import { supabase } from './supabase.js';

export async function createReceiptWithItems({
  companyId,
  receiptDate,
  irsaliyeNo,
  receivedBy,
  items,
  clientUuid,
  submitToQuality = false,
  faturaNo,
  aracHijyenUygun,
  aracSicaklik
}) {
  // Veritabanı da (0007) boş diziyi reddediyor; bu kontrol daha hızlı ve okunaklı bir hata verir.
  if (!items || items.length === 0) throw new Error('En az bir ürün satırı gerekli');

  const { data, error } = await supabase.rpc('create_receipt_with_items', {
    p_company_id: companyId,
    p_receipt_date: receiptDate,
    p_irsaliye_no: irsaliyeNo || null,
    p_received_by: receivedBy,
    // Çağıran kendi UUID'sini verebilir (Plan 5'in çevrimdışı kuyruğu tekrar oynatırken aynı
    // UUID'yi kullanarak idempotency sağlayabilsin diye).
    p_client_uuid: clientUuid || crypto.randomUUID(),
    p_items: items.map((item, index) => ({
      productId: item.productId,
      lineNo: index + 1,
      lotNo: item.lotNo || null,
      skt: item.skt || null,
      quantity: item.quantity,
      unit: item.unit,
      urunSicakligi: item.urunSicakligi ?? null,
      yariOmurGecti: item.yariOmurGecti ?? false,
      uygunluk: item.uygunluk,
      note: item.note
    })),
    p_submit_to_quality: submitToQuality,
    p_fatura_no: faturaNo || null,
    p_arac_hijyen_uygun: aracHijyenUygun ?? null,
    p_arac_sicaklik: aracSicaklik ?? null
  });
  if (error) throw error;
  return data;
}

export async function getReceiptDetail(receiptId) {
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select(`
      id, company_id, receipt_date, irsaliye_no, status, received_by, quality_by, quality_note,
      fatura_no, arac_hijyen_uygun, arac_sicaklik,
      companies (name),
      received_profile:profiles!receipts_received_by_fkey (full_name),
      quality_profile:profiles!receipts_quality_by_fkey (full_name)
    `)
    .eq('id', receiptId)
    .single();
  if (receiptError) throw receiptError;

  const { data: items, error: itemsError } = await supabase
    .from('receipt_items')
    .select('id, line_no, product_id, lot_no, skt, quantity, unit, uygunluk, note, urun_sicakligi, yari_omur_gecti, products (code, name)')
    .eq('receipt_id', receiptId)
    .order('line_no');
  if (itemsError) throw itemsError;

  return {
    receipt: {
      ...receipt,
      companyName: receipt.companies?.name,
      receivedByName: receipt.received_profile?.full_name,
      qualityByName: receipt.quality_profile?.full_name
    },
    items
  };
}

export async function listReceipts({ companyId, startDate, endDate, status, productId } = {}) {
  let query = supabase
    .from('receipts')
    .select('id, receipt_date, irsaliye_no, status, companies (name)');

  if (companyId) query = query.eq('company_id', companyId);
  if (startDate) query = query.gte('receipt_date', startDate);
  if (endDate) query = query.lte('receipt_date', endDate);
  if (status) query = query.eq('status', status);

  if (productId) {
    // Çok satırlı bir ürün için bu ön-sorgu sınırsız olursa hem aşağıdaki .in() çağrısında
    // PostgREST URL uzunluğu sorunu hem de (indekssiz) seq-scan riski oluşur — aşağıdaki
    // ana sorguda zaten kullanılan .limit(500) üst sınırıyla aynı gerekçeyle burada da bir
    // üst sınır konuyor (bkz. supabase/migrations/0010_receipt_items_product_index.sql).
    const { data: itemRows, error: itemsError } = await supabase
      .from('receipt_items')
      .select('receipt_id')
      .eq('product_id', productId)
      .limit(2000);
    if (itemsError) throw itemsError;
    const receiptIds = [...new Set(itemRows.map((r) => r.receipt_id))];
    // Eşleşen ürün satırı yoksa `.in('id', [])` PostgREST'e boş bir liste gönderir; bu davranış
    // sürüme göre belirsiz olabileceğinden sorguyu hiç göndermeden doğrudan boş sonuç dönüyoruz.
    if (receiptIds.length === 0) return [];
    query = query.in('id', receiptIds);
  }

  // Filtresiz (veya geniş filtreli) bir arama tüm tabloyu istemeden çekmesin diye üst sınır.
  const { data, error } = await query.order('receipt_date', { ascending: false }).limit(500);
  if (error) throw error;
  return data;
}
