// MKK (Mal Kabul Kontrol) sütununun sembolü. Gerçek şablonun kendi notuna göre
// (A19/A20 hücreleri): uygun görülen durumlar için "+", uygun olmadığı görülen
// durumlar için "–" yazılır; uygunsuzluğun tanımı HER ZAMAN ayrı "Açıklama"
// sütununda yer alır — MKK sütununa serbest metin yazılmaz.
export function mkkSembolu(uygunluk) {
  if (uygunluk === 'uygun') return '+';
  if (uygunluk === 'uygun_degil') return '–';
  return '';
}

// Araç hijyeni gibi üç durumlu (evet / hayır / bilgi yok) alanların gösterimi.
// PDF/yazdırma çıktısı ile Excel çıktısının birbirinden ayrışmaması için paylaşılıyor.
export function evetHayirYokBilgi(value) {
  if (value === null || value === undefined) return '-';
  return value ? 'Uygun' : 'Uygun Değil';
}

// Gerçek şablonun A20 hücresindeki lejant metni, birebir. PDF/print çıktısında
// (mal-kabul-ciktisi.js) kullanılıyor; burada paylaşılan bir sabit olarak tutulması,
// MKK sembol kuralı (mkkSembolu) değişirse bu açıklama cümlesinin tekrar ayrışmasını
// önlemek için.
export const MKK_ACIKLAMA_METNI =
  'Denetim sırasında UYGUN OLMADIĞI görülen durumlar için – yazılacaktır. Açıklama kısmında ise uygunsuzluğun tanımı yapılacak.';
