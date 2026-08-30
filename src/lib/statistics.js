import { supabase } from './supabase.js';

// Kayıt Ara'nın 500 kayıtlık üst sınırından bilerek FARKLI ve çok daha yüksek: o bir liste
// sınırı (kullanıcı en son N kaydı görür, sorun değil), bu ise bir TOPLAM — sessizce eksik
// toplanması yanlış sonuç üretir. Sorgu `{ count: 'exact' }` ile PostgREST'ten GERÇEK toplam
// eşleşen satır sayısını da ister (Supabase projesinin sunucu taraflı "Max Rows" ayarı bu
// `.limit()` değerinden daha düşük olsa bile `count` doğru kalır); dönen satır sayısı bu gerçek
// toplamdan azsa (`count > data.length`) sonuçların kesilmiş olduğu anlaşılır ve `truncated: true`
// ile açıkça işaretlenir, sessizce yanlış sayı dönülmez.
export const STATISTICS_ROW_LIMIT = 10000;

export async function getStatistics({ startDate, endDate } = {}) {
  // Tarih filtresi embed edilen `receipts` kaynağı üzerinden uygulanıyor — PostgREST'in
  // desteklediği standart bir desen, `receipts!inner(...)` join'i zorunlu kılıyor (aksi halde
  // `receipts.receipt_date` filtresi tanımsız bir sütuna işaret eder). Aynı `!inner` join,
  // sadece onaylanmış (finalize edilmiş) kayıtları saymak için `receipts.status = 'onaylandi'`
  // filtresini de mümkün kılıyor.
  let query = supabase
    .from('receipt_items')
    .select(
      'product_id, quantity, unit, uygunluk, products (name), receipts!inner (receipt_date, status, company_id, companies (id, name))',
      { count: 'exact' }
    )
    .eq('receipts.status', 'onaylandi')
    .limit(STATISTICS_ROW_LIMIT);
  if (startDate) query = query.gte('receipts.receipt_date', startDate);
  if (endDate) query = query.lte('receipts.receipt_date', endDate);

  const { data, error, count } = await query;
  if (error) throw error;

  const productMap = new Map();
  const companyMap = new Map();

  for (const item of data) {
    const isRejected = item.uygunluk === 'uygun_degil';
    const kg = item.unit === 'kg' ? Number(item.quantity) : 0;
    const adet = item.unit === 'ad' ? Number(item.quantity) : 0;

    const productId = item.product_id;
    if (!productMap.has(productId)) {
      productMap.set(productId, { id: productId, name: item.products?.name || '-', totalKg: 0, totalAdet: 0, rejectedCount: 0 });
    }
    const product = productMap.get(productId);
    product.totalKg += kg;
    product.totalAdet += adet;
    if (isRejected) product.rejectedCount += 1;

    const companyId = item.receipts?.company_id;
    if (companyId != null) {
      if (!companyMap.has(companyId)) {
        companyMap.set(companyId, {
          id: companyId,
          name: item.receipts.companies?.name || '-',
          totalKg: 0,
          totalAdet: 0,
          rejectedCount: 0
        });
      }
      const company = companyMap.get(companyId);
      company.totalKg += kg;
      company.totalAdet += adet;
      if (isRejected) company.rejectedCount += 1;
    }
  }

  const byKgDesc = (a, b) => b.totalKg - a.totalKg;
  return {
    products: [...productMap.values()].sort(byKgDesc),
    companies: [...companyMap.values()].sort(byKgDesc),
    truncated: count > data.length
  };
}
