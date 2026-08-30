# İstatistik Bölümü — Tasarım

Tarih: 2026-08-30

## Amaç ve Kapsam

Kullanıcı isteği: ürün ve firma bazında ne kadar kg/adet mal alındığının, ve hangi ürün/firmadan
ne kadar reddedilen kalem çıktığının görülebileceği yeni bir bölüm. Bu, rol tabanlı yetkilendirme
sisteminden (bkz. `docs/superpowers/specs/2026-08-30-rol-tabanli-yetkilendirme-design.md`) ayrı,
bağımsız bir özellik olarak ele alınıyor (brainstorming'de karara bağlandı).

**Kapsam dışı**: grafik/çubuk görselleştirme (sade tablo tercih edildi), red oranı yüzdesi (sadece
ham sayı istendi), ürün/firma dışında başka bir kırılım (ör. aylık trend) — istenirse ayrı bir
iş olarak ele alınır.

## Erişim

Üç rol de (`admin`, `depo_yonetici`, `kalite_ekibi`) erişebilir — `src/main.js`'teki nav/route
gating'e (rol tabanlı yetkilendirme planından) yeni bir koşulsuz pill/route olarak eklenir, tıpkı
"Kayıt Ara" gibi.

## Filtre

Kayıt Ara'daki (`src/pages/arama.js`) tarih aralığı deseninin aynısı: opsiyonel başlangıç/bitiş
tarihi input'u. İkisi de boşsa tüm zamanların istatistiği gösterilir.

## Görünüm

Tek sayfada iki tablo, ikisi de sade HTML `<table class="card-table">` (mevcut `arama.js`/
`firmalar.js` deseniyle aynı), varsayılan sıralama Toplam Kg'ye göre azalan (en çok alınan üstte):

**1) Ürün Bazlı** — sütunlar: Ürün Adı | Toplam Kg | Toplam Adet | Red Sayısı
**2) Firma Bazlı** — sütunlar: Firma Adı | Toplam Kg | Toplam Adet | Red Sayısı

"Red Sayısı": o ürüne/firmaya ait, `receipt_items.uygunluk = 'uygun_degil'` olan satır sayısı
(tarih filtresi dahilinde). Kg/Adet sütunları ayrı tutulur (birbirine toplanmaz) — mevcut
`mal-kabul-excel.js`/`mal-kabul-ciktisi.js`'teki `item.unit === 'kg' ? item.quantity : ''` deseniyle
tutarlı. Bir hücre 0/boşsa "-" gösterilir.

## Veri Katmanı

Yeni dosya `src/lib/statistics.js`, tek fonksiyon:

```
getStatistics({ startDate, endDate } = {}) →
  { products: [{ id, name, totalKg, totalAdet, rejectedCount }, ...],  // Toplam Kg azalan sıralı
    companies: [{ id, name, totalKg, totalAdet, rejectedCount }, ...], // Toplam Kg azalan sıralı
    truncated: boolean }                                              // güvenlik sınırına takıldıysa true
```

**Sorgu**: `receipt_items` tablosundan, `products` ve `receipts!inner(receipt_date, company_id,
companies(id, name))` join'iyle TEK sorgu — tarih filtresi join edilen `receipts.receipt_date`
üzerinden uygulanır (PostgREST'in desteklediği standart embedded-filter deseni,
`.gte('receipts.receipt_date', startDate)` şeklinde `!inner` join gerektirir).

Bu sayfa "Kayıt Ara"dan farklı olarak bir ÖZET/TOPLAM üretiyor — `listReceipts`'in kullandığı
500 kayıtlık üst sınır burada YANLIŞ olur (sessizce eksik/yanlış toplam gösterir). Bu yüzden ayrı,
çok daha yüksek bir güvenlik sınırı kullanılır (`.limit(10000)` satır, kayıt değil — receipt_items
seviyesinde). Dönen satır sayısı tam olarak limit'e eşitse (`data.length === 10000`), sonuçların
kesilmiş olabileceği varsayılır ve `truncated: true` döner; sayfa bu durumda görünür bir uyarı
gösterir ("Çok fazla kayıt var, sonuçlar eksik olabilir — tarih aralığını daraltın").

Aggregasyon (toplama) istemci tarafında (JS) yapılır: dönen satırlar `product_id` ve
`company_id`'ye göre gruplanıp `unit`'e göre kg/adet ayrı toplanır, `uygunluk === 'uygun_degil'`
olanlar sayılır.

**Durum filtresi**: Sorgu sadece `receipts.status = 'onaylandi'` (onaylanmış/finalize edilmiş)
kayıtları sayar — `taslak` (Taslak Kaydet ile bırakılmış, tamamlanmamış olabilecek) ve varsa eski
`reddedildi` kayıtları hariç tutulur. Bu sayfanın amacı "ne kadar mal gerçekten alındı" sorusuna
cevap vermek; taslak/onaylanmamış kayıtlar henüz fiilen teslim alınmış mal anlamına gelmediğinden
toplamlara dahil edilmemeli.

## Frontend

Yeni sayfa `src/pages/istatistik.js`, `renderIstatistik(container)`:
- Üstte tarih filtresi (Kayıt Ara ile aynı UI deseni) + "Filtrele" butonu.
- Filtre değiştiğinde `getStatistics(...)` çağrılır, iki tablo yeniden render edilir.
- `truncated: true` dönerse tablo(lar)ın üstünde uyarı mesajı.
- `main.js`'e `/istatistik` route'u + nav pill'i (koşulsuz, üç rol de görür) eklenir.

## Test Planı

- `tests/statistics.test.js` (yeni): `getStatistics`'in mock Supabase verisiyle doğru şekilde
  ürün/firma bazında kg/adet/red topladığını, azalan sırayla döndüğünü, ve `truncated` bayrağının
  doğru koşulda (satır sayısı tam limit'e eşit) true döndüğünü doğrulayan testler.
- `src/pages/istatistik.js` için (bu projedeki `arama.js`/`firmalar.js` gibi diğer basit sayfalar
  için dedike test dosyası olmaması deseniyle tutarlı) ayrı bir sayfa testi yazılmayacak — görsel
  doğrulama canlıda yapılacak.

## Açık Sorular / Kararlaştırılan Notlar

- Kesme (truncation) eşiği 10000 satır olarak seçildi — bu ölçekteki bir işletme için pratikte
  hiç tetiklenmesi beklenmiyor, sadece bir güvenlik ağı.
