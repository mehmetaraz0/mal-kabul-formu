# Ürün Bazlı Derece (Sıcaklık) Kontrolü — Tasarım

Tarih: 2026-09-02

## Amaç ve Kapsam

Kullanıcının paylaştığı `Urun_Derece_Esleme.xlsx` dosyası (1264 satır, sütunlar: LN Kodu, Ürün
Adı, RAF, Derece Kriteri), her ürünün mal kabulde olması gereken referans sıcaklığını içeriyor.
Dosyadaki `Derece Kriteri` değerleri sadece 4 farklı kategori: `-18°C` (247 ürün, donuk),
`+4°C` / `+4°C (et)` (31 ürün, soğuk — ikisi aynı eşik olarak ele alınıyor), `Ölçüm gerekmez`
(722 ürün) ve boş (264 ürün, `Ölçüm gerekmez` ile aynı muamele görüyor — kontrol yok).

Bu veri, uygulamanın MEVCUT `products` tablosundaki ürünlerle `code` (LN Kodu) üzerinden
eşleştirilip yeni bir referans-aralık bilgisi olarak saklanacak; Yeni Mal Kabul formunda bir
ürün seçildiğinde girilen sıcaklık bu aralıkla otomatik karşılaştırılıp Uygunluk'u önerecek.

**Kapsam dışı**: Excel'deki ama uygulamanın `products` tablosunda KARŞILIĞI OLMAYAN ürünler
YENİ ürün olarak eklenmiyor — kullanıcı kararı: "ürün listemiz sabit, uygulamada kayıtlı olan
ürünlere dereceler alınıyor". Ürün ekleme/silme davranışı (Ürünler sayfası) hiç değişmiyor.

## Tolerans Kuralları (kullanıcı onayıyla netleştirildi)

| Referans | Kabul Aralığı (dahil) | Örnek |
|---|---|---|
| `-18°C` (donuk) | **-22 ile -16 arası** | -22, -20, -18, -16 uygun; -15 veya -23 uygun değil |
| `+4°C` / `+4°C (et)` (soğuk) | **+2 ile +7 arası** | 2, 5, 7 uygun; 1 veya 8 uygun değil |
| `Ölçüm gerekmez` / boş | kontrol yok | otomatik davranış hiç tetiklenmez |

## Veri Modeli

`products` tablosuna iki yeni nullable sütun: `derece_min numeric`, `derece_max numeric`.
İkisi de `null` ise (Excel'de karşılığı olmayan VEYA "Ölçüm gerekmez"/boş olan ürünler) o ürün
için otomatik derece kontrolü hiç devreye girmez — mevcut davranış (elle Uygun/Uygunsuz seçimi)
aynen sürer.

**Import**: tek seferlik bir migration, Excel'deki 278 dolu satırı (247 donuk + 31 soğuk) tek bir
`update products set derece_min = v.derece_min, derece_max = v.derece_max from (values (...), ...)
as v(code, derece_min, derece_max) where p.code = v.code` ifadesiyle işliyor — `where p.code =
v.code` koşulu sayesinde Excel'de olup `products`'ta karşılığı olmayan kodlar kendiliğinden
atlanıyor (hiçbir yeni satır insert edilmiyor), kullanıcının "sabit liste" kararını doğal olarak
uyguluyor.

## Frontend Davranışı

Yeni Mal Kabul'deki ürün kartında (`src/pages/yeni-kabul.js`):
- Bir ürün seçildiğinde, `state.items[i]`'ye o ürünün `dereceMin`/`dereceMax` değerleri de
  eklenir (`listProducts()`'ın döndürdüğü veriden).
- Sıcaklık (`urunSicakligi`) alanına her değer girildiğinde (`input` event'i — mevcut genel
  input handler'ın İÇİNDE, `field === 'urunSicakligi'` özel durumu olarak): eğer o kartın
  ürününde `dereceMin`/`dereceMax` TANIMLIYSA, girilen değer bu aralıkta mı diye bakılır —
  aralıktaysa `uygunluk = 'uygun'`, dışındaysa `uygunluk = 'uygun_degil'` olarak OTOMATİK
  ayarlanır VE Uygun/Uygunsuz butonlarının görünümü (mevcut buton-boyama mantığıyla aynı
  fonksiyon kullanılarak) hemen güncellenir. `dereceMin`/`dereceMax` tanımlı değilse (`null`)
  bu otomatik davranış hiç çalışmaz, kullanıcı elle seçime devam eder.
- Kullanıcı bu otomatik seçimi İSTEDİĞİ ZAMAN Uygun/Uygunsuz butonlarına elle tıklayarak
  değiştirebilir — otomatik ayar sadece bir ÖNERİ/varsayılan, kilit değil. (Not: kullanıcı
  sıcaklık değerini tekrar değiştirirse otomatik öneri yeniden hesaplanıp uygulanır — yani
  elle yapılan bir düzeltme, sıcaklık alanı tekrar değiştirilirse geçersiz kalabilir; bu kabul
  edilebilir bir basitlik, çünkü sıcaklık genelde bir kez ölçülüp bir kez girilir.)
- Kart üzerinde referans aralığın kendisi (ör. "Beklenen: -22 / -16") ayrıca gösterilmiyor
  (kapsam dışı bırakıldı, otomatik Uygun/Uygunsuz işaretlemesi kullanıcı için yeterli bir
  geri bildirim sayılıyor) — istenirse ayrı bir iş olarak eklenir.

## Test Planı

- `tests/yeni-kabul.test.js`: sıcaklık girilince otomatik Uygun/Uygunsuz ataması (aralık içi/
  dışı, hem -18 hem +4 kategorisi için), `dereceMin`/`dereceMax` olmayan bir ürün için hiçbir
  otomatik davranış tetiklenmediği, kullanıcının otomatik seçimi elle değiştirebildiği.
- Migration'ın kendisi (bu projedeki tüm migration'larla tutarlı) otomatik test edilmiyor —
  Supabase SQL Editor'da manuel doğrulama (birkaç örnek ürünün `derece_min`/`derece_max`
  değerlerini SELECT ile kontrol etmek).

## Açık Sorular / Kararlaştırılan Notlar

- `+4°C (et)` etiketi `+4°C` ile AYNI eşik olarak ele alınıyor (kullanıcı mesajında ayrım
  yapılmadı, sadece açıklayıcı bir not gibi görünüyor) — yanlışsa kolayca ayrı bir eşiğe
  bölünebilir.
- Excel'deki boş `Derece Kriteri` hücreleri `Ölçüm gerekmez` ile aynı muamele görüyor (kontrol
  yok) — 264 ürün bu durumda.
