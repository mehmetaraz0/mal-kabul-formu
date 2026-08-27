// MKK (Mal Kabul Kontrol) sütununun sembolü. Gerçek şablonun kendi notuna göre
// (A19/A20 hücreleri): uygun görülen durumlar için "+", uygun olmadığı görülen
// durumlar için "–" yazılır; uygunsuzluğun tanımı HER ZAMAN ayrı "Açıklama"
// sütununda yer alır — MKK sütununa serbest metin yazılmaz.
export function mkkSembolu(uygunluk) {
  if (uygunluk === 'uygun') return '+';
  if (uygunluk === 'uygun_degil') return '–';
  return '';
}
