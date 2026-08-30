# Yeni Mal Kabul — Ürün Kartı Tasarımı

Tarih: 2026-08-30

## Amaç ve Kapsam

Yeni Mal Kabul formundaki ürün girişi, tek bir yatay tabloda satır satır girilen mevcut yapıdan,
her ürün kalemi için ayrı, dikey bir "kart" gösteren bir yapıya dönüştürülüyor. Kullanıcı isteği:
başka bir projede (kullanıcının kendi ERP projesi) kullanılan kart tabanlı ürün girişi
tasarımının etkileşim modelini bu uygulamaya taşımak — görsel stil değil, düzen/etkileşim.

**Kapsam dışı**: "Koli Bazlı Giriş (her koliye ayrı etiket)" özelliği — referans ekran
görüntüsünde var ama bu uygulamada hiç konuşulmamış, ayrı bir konu; dahil edilmiyor. Referans
görüntüdeki renkler/font/buton stili birebir kopyalanmıyor — bu uygulamanın zaten var olan
tasarım dili (mevcut CSS değişkenleri/sınıfları) kullanılıyor.

## Etkileşim Modeli

- Sayfa açıldığında **bir boş kart** hazır durumda görünür (ürün henüz seçilmemiş).
- Sağ üstteki **"+ Ürün Ekle"** butonu yeni bir boş kart daha ekler (firmadan genelde 3-4 kalem
  geldiği için — kullanıcı gerekçesi).
- Her kartın kendi ürün arama kutusu var; bir ürün seçilene kadar diğer alanlar (Miktar, Birim
  vb.) o kart için anlamsızdır ama yine de görünür ve doldurulabilir durumda kalır (ürün
  seçilmeden "Kaydet"e basılırsa mevcut doğrulama zaten reddeder — bkz. Doğrulama).
- Her kartın sağ üstünde/altında bir **"Kartı Sil"** butonu var — o kalemi tamamen kaldırır.
- Kartlar dikey olarak alt alta dizilir (mevcut tablo satırlarının yerini alır).

## Kart İçeriği

Sırasıyla (yukarıdan aşağıya), her biri mevcut `.field`/`.field-label` deseniyle:

1. **Ürün Adı** — arama kutusu, **popup/dropdown** (bir önceki "sabit tablo" değişikliği bu kart
   içinde GERİ ALINIYOR — kullanıcı kararı: bu yeni kart tasarımında ürün seçimi eskisi gibi
   popup olmalı). Seçilince kartın başlığında ürün adı görünür, Birim alanı otomatik dolar.
2. **Miktar** (sayı input) ve **Birim** (salt-okunur metin, seçilen ürüne göre otomatik) — yan
   yana.
3. **SKT** (tarih) ve **Sıcaklık (°C)** (sayı) — yan yana.
4. **Seri/Lot No** (metin) ve **Marka** (metin, opsiyonel, placeholder "Opsiyonel") — yan yana.
5. **Yarı Ömrünü Geçti mi** (checkbox) — mevcut alan, korunuyor (referans görüntüde kesilmiş
   olabilir ama veri modelinden çıkmıyor).
6. **Uygunluk** — İKİ BUTON: "✓ Uygun" ve "✗ Uygunsuz", yan yana, tam genişlikte. Tıklanan buton
   dolgulu/vurgulu görünür (mevcut `.btn-success`/`.btn-danger` renkleriyle), diğeri nötr kalır.
   **Hiçbiri seçili değilken durum "beklemede" sayılır** (varsayılan, kart yeni açıldığında).
7. **Not** (metin).
8. Kartın silinmesi için bir buton (kart başlığında veya altında).

Görsel stil: bu alanların hepsi mevcut `.card`, `.field`, `.field-label`, `.field-grid` CSS
sınıflarıyla, Uygunluk butonları `.btn-success`/`.btn-danger` sınıflarıyla oluşturulur —
referans ekran görüntüsünün kendi renk paleti (turuncu buton vb.) kullanılmıyor.

## Doğrulama (mevcut kurallar korunuyor, sadece taşınıyor)

- Ürün seçilmemiş bir kart, "Kaydet"e basıldığında mevcut `productId` zorunluluğu üzerinden
  reddedilir (yeni bir kontrol eklenmiyor — zaten `state.items` içindeki her öğe bir `productId`
  taşımak zorunda; kartın "ürün seçilmemiş" hali `productId: null` ile temsil edilir ve
  kaydetmeden önce bu satırlar filtrelenip kullanıcıya "ürün seçilmemiş satır var" hatası
  gösterilir — mevcut "en az bir ürün satırı gerekli"/"miktar > 0" kontrolleriyle aynı aile).
- Diğer tüm doğrulama kuralları (miktar > 0, tarih zorunlu, "Kaydet" için tüm satırların
  Uygun/Uygunsuz işaretlenmiş olması) DEĞİŞMEDEN kalıyor.

## Veri Modeli

`state.items` dizisinin şekli DEĞİŞMİYOR (`{productId, code, name, unit, marka, lotNo, skt,
quantity, urunSicakligi, yariOmurGecti, uygunluk, note}`) — sadece HTML render'ı (satır → kart)
ve ürün seçimi anındaki davranış (artık boş bir kart önceden var olabiliyor, `productId: null`
ile) değişiyor. `createReceiptWithItems`'a giden payload, RPC, ve tüm backend/veri katmanı
etkilenmiyor.

## Test Planı

- `tests/yeni-kabul.test.js`: mevcut testler (satır bazlı `data-field`/`data-index` seçicileri
  kullanıyor) büyük ölçüde aynı kalabilir çünkü kart içindeki input'lar aynı `data-field`/
  `data-index` desenini koruyacak — sadece "ürün seçimi artık popup" (bir önceki değişiklikte
  eklenen tablo-tabanlı yardımcı fonksiyonlar geri alınacak) ve "başlangıçta bir boş kart var"
  senaryoları için testler güncellenir/eklenir.
- Yeni testler: "sayfa açıldığında bir boş kart görünür", "Ürün Ekle yeni bir boş kart ekler",
  "Uygunluk butonlarından birine basınca diğeri pasif kalır, hiçbiri basılmamışsa beklemede
  sayılır", "Kartı Sil o kalemi kaldırır".
