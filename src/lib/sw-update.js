// Service worker güncelleme kontrolü.
//
// `registerSW({ onNeedRefresh })` (main.js) yeni bir sürüm BEKLEMEYE ALINDIĞINDA güncelleme
// çubuğunu gösterir — ama tarayıcı yeni bir service worker betiğini yalnızca sayfa
// yüklendiğinde/gezinildiğinde arar. Bu uygulamanın gerçek kullanım biçimi depo tabletinde
// sekmenin gün boyu AÇIK kalması olduğu için, `onNeedRefresh` pratikte hiç tetiklenmiyordu:
// çubuk mevcuttu ama ulaşılamazdı ve kullanıcılar farkında olmadan eski paketi çalıştırmaya
// devam ediyordu (bu, olmayan bir "ürün filtresi boş" bugunun peşinde zaman harcattı).
// Periyodik `registration.update()` çağrısı o boşluğu kapatır.
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export function startUpdateChecks(
  registration,
  {
    intervalMs = UPDATE_CHECK_INTERVAL_MS,
    schedule = setInterval,
    isOnline = () => navigator.onLine
  } = {}
) {
  // registerSW'in onRegisteredSW'i, kayıt başarısız olduğunda registration'ı undefined geçebilir.
  if (!registration || typeof registration.update !== 'function') return null;

  return schedule(() => {
    // Çevrimdışıyken kontrol etmeye çalışmak sadece boş yere başarısız bir istek üretir;
    // bağlantı geri geldiğinde bir sonraki tur zaten yakalar.
    if (!isOnline()) return;
    // update() hem senkron fırlatabilir hem de reddedebilir (ağ hatası, SW betiği 404).
    // Hiçbiri kullanıcıya yansımamalı: bu sessiz bir arka plan kontrolü.
    try {
      Promise.resolve(registration.update()).catch(() => {});
    } catch {
      // yoksay
    }
  }, intervalMs);
}
