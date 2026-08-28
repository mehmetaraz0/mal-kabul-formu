export function isNetworkError(err) {
  if (!navigator.onLine) return true;
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) return true;
  // supabase-js (postgrest-js) does NOT reject with the raw TypeError when the
  // underlying fetch() fails (offline, DNS, CORS, aborted). It catches it and
  // resolves with a PostgrestError-*shaped* plain object instead — not an
  // `instanceof TypeError` — with `code: ''`/`hint: ''`, because those fields
  // are reserved for real PostgREST/PostgreSQL responses (verified against
  // node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts, which
  // explicitly comments "we don't populate code/hint for client-side network
  // errors"). Our `listX()` helpers do `if (error) throw error`, so this is
  // the shape that actually reaches `cacheAside` on a real network failure.
  // A genuine application-level error (RLS denial, bad table/column,
  // constraint violation) always carries a non-empty `code` (a Postgres
  // SQLSTATE or PGRST-prefixed code), so keying off a falsy `code` here
  // cannot misclassify a real permission/validation error as "offline".
  if (err && typeof err === 'object' && !err.code && typeof err.message === 'string' && /fetch|network/i.test(err.message)) {
    return true;
  }
  return false;
}

export async function cacheAside(key, fetchFn) {
  let result;
  try {
    result = await fetchFn();
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = localStorage.getItem(key);
      if (cached) return JSON.parse(cached);
    }
    throw err;
  }

  // Önbelleğe YAZMA best-effort'tur: `localStorage.setItem` kota aşımında (QuotaExceededError) ya
  // da Safari'nin gizli modunda (storage tamamen devre dışı) fırlatabilir. Bu, BAŞARIYLA çekilmiş
  // gerçek veriyi asla hataya çevirmemeli. Eski hali `setItem`'ı fetch ile aynı try bloğunda
  // tutuyordu; bu yüzden bir kota hatası ya (a) doğrudan çağırana fırlıyor ve sayfayı "Bir hata
  // oluştu"ya düşürüyor, ya da (b) daha kötüsü — `!navigator.onLine` iken `isNetworkError` true
  // döndüğü için — TAZE veriyi atıp BAYAT önbellek değerini döndürüyordu. Yazmayı kendi
  // try/catch'ine almak her iki durumu da ortadan kaldırıyor.
  try {
    localStorage.setItem(key, JSON.stringify(result));
  } catch {
    // Yoksay: önbellek yazılamadı, ama elimizde taze veri var — çağıran onu almalı.
  }
  return result;
}
