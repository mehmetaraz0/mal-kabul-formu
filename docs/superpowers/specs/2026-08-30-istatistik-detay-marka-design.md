# İstatistik Detay Sayfaları + Marka Alanı — Tasarım

Tarih: 2026-08-30

## Amaç ve Kapsam

Mevcut İstatistik bölümünü (bkz. `docs/superpowers/specs/2026-08-30-istatistik-bolumu-design.md`)
genişletiyor: bir ürüne/firmaya tıklandığında, o ürünün/firmanın hangi firma/ürün ve **marka**
kombinasyonlarından ne kadar geldiğini gösteren bir detay sayfası. "Marka" (ör. üretici markası,
"Dardanel" gibi) şu ana kadar hiç tutulmuyordu — firma (tedarikçi) bilgisinden ayrı, yeni bir alan.

**Kapsam dışı**: ayrı bir "Marka Yönetimi" CRUD sayfası (Firmalar/Ürünler gibi) — marka serbest
metin olarak tutuluyor, Lot No/Not ile aynı basitlikte. PDF/Excel çıktılarına (F.22 fiziksel
formu) marka eklenmiyor — o form sabit bir kağıt şablonu yansıtıyor, yeni sütun eklemek uygun değil.

## Marka Alanı

- `receipt_items` tablosuna yeni `marka` (text, opsiyonel) sütunu eklenir.
- Yeni Mal Kabul formunda (`src/pages/yeni-kabul.js`), ürün satırı tablosuna "Ürün" sütunundan
  hemen sonra bir "Marka" serbest-metin giriş sütunu eklenir (Lot No ile aynı stil/davranış).
- `createReceiptWithItems` (`src/lib/receipts.js`) bu alanı RPC'ye `marka` olarak geçirir.
- `create_receipt_with_items` RPC'si (migration 0016) `receipt_items.marka`'ya yazar — RPC'nin
  imzası (parametre listesi) DEĞİŞMİYOR, sadece `p_items` içindeki her öğeye bir alan daha
  ekleniyor, bu yüzden migration 0013'teki gibi bir DROP FUNCTION gerekmiyor (0006'dan beri ilk
  kez sadece `create or replace` yeterli).

## Detay Sayfaları

**Ürün Detayı** (`/istatistik-urun-detay?id=<productId>&name=<productName>`): İstatistik
sayfasındaki Ürün Bazlı tablosunda bir satıra tıklanınca açılır. Tablo: Firma | Marka | Toplam Kg
| Toplam Adet | Red Sayısı — o ürünün her firma+marka kombinasyonu bir satır. "Geri" butonuyla
`/istatistik`'e dönülür.

**Firma Detayı** (`/istatistik-firma-detay?id=<companyId>&name=<companyName>`): Firma Bazlı
tablosunda bir satıra tıklanınca açılır. Tablo: Ürün | Marka | Toplam Kg | Toplam Adet | Red
Sayısı — o firmadan gelen her ürün+marka kombinasyonu bir satır.

İkisi de üç rolün de erişebildiği (koşulsuz) route'lar — ana `/istatistik` sayfasıyla aynı erişim.
Ürün/firma adı sayfa başlığında query string üzerinden taşınır (ana sayfada zaten elde mevcut,
ekstra bir sorgu gerektirmez) — `getQueryParam`/`URLSearchParams` Türkçe karakterleri doğru
encode/decode ediyor (mevcut `navigate('/mal-kabul-ciktisi?id=' + ...)` deseniyle tutarlı).

Marka boşsa (`null`) tabloda "-" gösterilir. Sıralama Toplam Kg'ye göre azalan (ana sayfayla
tutarlı). Tarih filtresi bu sürümde detay sayfalarına taşınmıyor (ana sayfadaki filtre
uygulanmadan, her zaman tüm zamanların detayı gösterilir) — istenirse ayrı bir iş olarak eklenir.

## Veri Katmanı

`src/lib/statistics.js`'e iki yeni fonksiyon eklenir, ikisi de mevcut `getStatistics`'in aynı
sorgu desenini (receipt_items + receipts!inner + status='onaylandi' filtresi + STATISTICS_ROW_LIMIT
+ count-tabanlı truncation) kullanır, sadece gruplama anahtarı ve filtre farklı:

```
getProductDetail(productId, { startDate, endDate } = {}) →
  { rows: [{ companyId, companyName, marka, totalKg, totalAdet, rejectedCount }, ...], truncated }
  // .eq('product_id', productId) ile filtrelenir, (companyId, marka) çiftine göre gruplanır

getCompanyDetail(companyId, { startDate, endDate } = {}) →
  { rows: [{ productId, productName, marka, totalKg, totalAdet, rejectedCount }, ...], truncated }
  // .eq('receipts.company_id', companyId) ile filtrelenir, (productId, marka) çiftine göre gruplanır
```

Her iki fonksiyon da `getStatistics`'teki gibi `rows`'u Toplam Kg'ye göre azalan sıralar.

## Frontend

- `src/pages/istatistik.js`: Ürün Bazlı ve Firma Bazlı tablolarındaki isim hücreleri artık
  tıklanabilir (buton) — tıklanınca ilgili detay route'una `id`+`name` query param'larıyla
  yönlendirir.
- Yeni `src/pages/istatistik-urun-detay.js` → `renderIstatistikUrunDetay(container)`.
- Yeni `src/pages/istatistik-firma-detay.js` → `renderIstatistikFirmaDetay(container)`.
- `main.js`'e iki yeni route (koşulsuz) eklenir; nav pill gerekmez (sadece tıklamayla erişilir,
  tıpkı `/mal-kabul-ciktisi` gibi).

## Test Planı

- `tests/statistics.test.js`'e `getProductDetail`/`getCompanyDetail` için: (companyId, marka)
  kombinasyonuna göre doğru gruplama, marka `null` iken "-" fallback'i, doğru filtre
  (`product_id`/`receipts.company_id`) uygulanması, sıralama, ve truncation testleri eklenir.
- Yeni detay sayfaları için (mevcut projedeki basit sayfa deseniyle tutarlı) dedike bir sayfa
  testi yazılmaz — canlı doğrulama yeterli.
- Migration/RPC için (bu projedeki tüm migration'larla tutarlı) otomatik test yok — manuel
  Supabase SQL Editor doğrulaması yapılır.

## Açık Sorular / Kararlaştırılan Notlar

- Marka serbest metin — yazım tutarsızlığı riski var (ör. "dardanel" vs "Dardanel" ayrı satır
  sayılır). Bilinçli bir YAGNI kararı: pratikte sorun çıkarsa ileride ayrı bir Marka yönetim
  tablosu + arama/otomatik-tamamlama eklenebilir.
- Detay sayfalarına tarih filtresi taşınmadı (kapsam dışı bırakıldı, ana sayfanın filtresinden
  bağımsız çalışıyor) — basitlik tercih edildi.
