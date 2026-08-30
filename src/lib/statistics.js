import { supabase } from './supabase.js';

// Kayıt Ara'nın 500 kayıtlık üst sınırından bilerek FARKLI ve çok daha yüksek: o bir liste
// sınırı (kullanıcı en son N kaydı görür, sorun değil), bu ise bir TOPLAM — sessizce eksik
// toplanması yanlış sonuç üretir. Bu yüzden sınıra gerçekten takılırsa (dönen satır sayısı tam
// bu değere eşitse) `truncated: true` ile açıkça işaretlenir, sessizce yanlış sayı dönülmez.
export const STATISTICS_ROW_LIMIT = 10000;

export async function getStatistics({ startDate, endDate } = {}) {
  // Tarih filtresi embed edilen `receipts` kaynağı üzerinden uygulanıyor — PostgREST'in
  // desteklediği standart bir desen, `receipts!inner(...)` join'i zorunlu kılıyor (aksi halde
  // `receipts.receipt_date` filtresi tanımsız bir sütuna işaret eder).
  let query = supabase
    .from('receipt_items')
    .select('product_id, quantity, unit, uygunluk, products (name), receipts!inner (receipt_date, company_id, companies (id, name))')
    .limit(STATISTICS_ROW_LIMIT);
  if (startDate) query = query.gte('receipts.receipt_date', startDate);
  if (endDate) query = query.lte('receipts.receipt_date', endDate);

  const { data, error } = await query;
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
    truncated: data.length === STATISTICS_ROW_LIMIT
  };
}
