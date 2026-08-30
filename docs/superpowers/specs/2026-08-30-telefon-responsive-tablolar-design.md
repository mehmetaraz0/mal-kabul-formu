# Telefon Ekranlarında Tablo Görünümü — Design Spec

**Tarih:** 2026-08-30
**Durum:** Onaylandı, uygulama planı bekliyor

## Problem

PWA tablet ve büyük ekranlarda sorunsuz, ancak telefonda veri tabloları ekrana sığmıyor ve
yatay kaydırma gerektiriyor.

Uygulamada responsive için bugün yalnızca iki kural var:

- `.field-grid` 640px altında tek sütuna düşüyor (`src/style.css:99`)
- `#app` 768px üstünde ortalanıyor (`src/style.css:226`)

Tablolar için hiçbir telefon uyarlaması yok. Genişliği zorlayan şey sütun sayısı değil (4-5),
uzun metinler: firma adları (`4S DENIZ URUNLERI GIDA SAN.TIC.A.S.`) ve ürün adları
(`YIY02000011 — ALABALIK PORSIYONLUK SOKLU-200`).

## Kapsam

| Sayfa | Sütunlar | Uygulanacak |
|---|---|---|
| `arama.js` (Kayıt Ara) | Tarih, Firma, Kaydeden, İrsaliye No, Çıktı | **Kart düzeni** |
| `istatistik.js` | Ad, Toplam Kg, Toplam Adet, Red Sayısı | Sıkıştırma |
| `istatistik-urun-detay.js` | Firma, Marka, Toplam Kg, Toplam Adet, Red Sayısı | Sıkıştırma |
| `istatistik-firma-detay.js` | Ürün, Marka, Toplam Kg, Toplam Adet, Red Sayısı | Sıkıştırma |
| `kullanicilar.js` | Ad Soyad, Rol | Sıkıştırma + eksik sarmalayıcı |

**Kapsam dışı:** `mal-kabul-ciktisi.js` — A4 yatay resmi F.22 formu, bilerek geniş. Hiç
dokunulmayacak.

## Neden iki farklı çözüm

Bu tablolar farklı işler yapıyor:

- **Kayıt Ara** taranıp üzerine dokunulan bir *liste*. Satırlar arası karşılaştırma yapılmıyor,
  tek bir kayıt aranıp Çıktı'ya basılıyor. Kart düzeni burada en okunaklısı.
- **İstatistik** sayıların *karşılaştırıldığı* bir tablo. Kg / Adet / Red rakamlarının alt alta
  hizalı kalması sayfanın varlık sebebi. Kart düzeni bu hizalamayı bozar ve sayfayı çok uzatır.

Bu yüzden tek tip çözüm yerine hibrit yaklaşım seçildi.

## Kırılma noktası

**640px.** Mevcut `.field-grid` kuralıyla aynı eşik — yeni bir kırılma noktası tanımlanmıyor.

## 1. Kayıt Ara — kart düzeni

Tabloya `stacked` değiştirici sınıfı eklenir (`<table class="card-table stacked">`), böylece
kural yalnızca bu tabloyu etkiler.

640px altında:

- `thead` gizlenir
- Her `tr` bir karta dönüşür: kenarlık, `--radius-card`, iç boşluk, alt boşluk
- **Firma adı** kart başlığı olur — etiketsiz, kalın, diğerlerinden büyük
- Kalan hücreler `Etiket ......... Değer` düzeninde alt alta dizilir
- Etiketler CSS `::before` ile `data-label` özniteliğinden okunur
- Çıktı butonu tam genişlik, kartın en altında

**JS değişikliği:** `arama.js` satır şablonundaki her `td`'ye `data-label` eklenir. Başlıklar
tek bir yerde tanımlanıp hem `thead` hem `data-label` için kullanılır ki ikisi ayrışmasın.

## 2. İstatistik (3 sayfa) + Kullanıcılar — sıkıştırma

640px altında `table.card-table` için:

- Yazı boyutu `0.85rem`, hücre boşluğu `0.35rem 0.4rem` (masaüstünde sırasıyla varsayılan ve
  `0.5rem 0.6rem`)
- İsim/metin sütunu `overflow-wrap: break-word` ile alt satıra kayar, kalan genişliği alır
  (düzeltme: `word-break: break-word` min-content'i tek karaktere düşürüp sütunu 48px'e
  daraltıyor ve metni harf harf parçalıyordu — Task 4'ün 375px'teki görsel doğrulamasında
  tespit edildi; `overflow-wrap` min-content'i en uzun kelime kadar korur)
- **Sayısal sütunlar `text-align: right`; sadece `td.num` `white-space: nowrap`** — hizalama
  korunur, rakam ortadan bölünmez (düzeltme: `nowrap` `th.num`'da da varken "Toplam Adet"
  başlığı sarmayıp sütunu gereksiz genişletiyordu; `nowrap` yalnızca veri hücrelerine taşındı)
- Mevcut `overflow-x:auto` sarmalayıcılar güvenlik ağı olarak kalır

**Sayısal sütun nasıl belirlenir:** CSS'in bunu konumdan tahmin etmesi kırılgan olurdu
(`istatistik.js`'te sayısal sütunlar 2-4, detay sayfalarında 3-5). Bunun yerine üç istatistik
sayfasında ilgili `th` ve `td`'lere açık bir `num` sınıfı eklenir; CSS `.card-table .num`
üzerinden hedefler. Böylece sütun sırası ileride değişirse kural bozulmaz.

`kullanicilar.js`'teki tablo şu an `overflow-x:auto` ile sarmalanmamış — diğer dört sayfayla
tutarlı hale getirmek için sarmalayıcı eklenir. İki sütunlu olduğu için kart düzenine
çevrilmiyor; sıkıştırma yeterli.

## Yazdırma çıktısını koruma

Tüm yeni kurallar `@media screen and (max-width: 640px)` altında tanımlanır. `style-print.css`
ayrı bir dosya ve `@media print` kullanıyor; ekran kuralları baskı çıktısına sızmamalı.

## Test ve doğrulama

**Birim testi (jsdom):** jsdom CSS uygulamaz, dolayısıyla görsel davranış birim testiyle
kanıtlanamaz. Test edilebilir ve test edilecek olan:

- `arama.js` her `td`'ye doğru `data-label` yazıyor mu
- `data-label` değerleri `thead` başlıklarıyla birebir aynı mı (ayrışma regresyonu)
- Sütun yapısı ve mevcut davranış (filtreler, Çıktı butonu) bozulmadı mı
- `kullanicilar.js` tablosu sarmalayıcı içinde mi
- Üç istatistik sayfasında sayısal `th`/`td`'ler `num` sınıfı taşıyor mu

Mevcut `arama.test.js` ve `kullanicilar.test.js` testleri değişiklikten sonra da geçmeli.

**Görsel doğrulama:** Tarayıcı panelinde 375px mobil emülasyonla statik bir örnek üzerinden
kontrol edilir. Gerçek veriyle son doğrulamayı kullanıcı telefonunda yapar — bu sayfalar giriş
gerektirdiği için asistan canlı test edemiyor (bkz. `docs/PROJE-DURUMU.md`, kural 4).

## Kapsam dışı bırakılanlar (YAGNI)

- Sütun gizleme / önceliklendirme — istatistikte her sütun anlamlı, gizlenecek sütun yok
- Yatay kaydırmayı iyileştiren yapışkan ilk sütun — kart düzeni zaten kaydırmayı ortadan
  kaldırıyor, istatistikte de sıkıştırma yetiyor
- Yeni bir tasarım sistemi / bileşen kütüphanesi — mevcut `card-table` sınıfı üzerine inşa
  ediliyor
