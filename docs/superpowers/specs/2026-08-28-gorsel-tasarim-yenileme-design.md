# Görsel Tasarım Yenileme — Design Spec

**Tarih:** 2026-08-28
**Durum:** Kullanıcı onayı bekleniyor

## Amaç

Mal Kabul Formu uygulamasının şu anki sade/ham görünümünü (düz lacivert header, kenarlıksız gri butonlar, çıplak `<ul>` listeler, `<table>`'lar), kullanıcının referans olarak gösterdiği bir ERP ekranındaki tasarım diline (kart tabanlı bölümler, hap şeklinde sekmeler/butonlar, büyük harf etiketler, renkli durum rozetleri) uygun, modern ve "renkli" bir arayüze dönüştürmek.

**Kapsam:** Uygulamanın tüm ekranları (Login, Ana Sayfa/nav kabuğu, Firmalar, Ürünler, Yeni Mal Kabul, Kalite Onayı, Kayıt Ara). **Kapsam dışı:** yazdırılabilir/PDF çıktı (`mal-kabul-ciktisi.js`'nin `.print-page` blokları) ve Excel çıktısı (`mal-kabul-excel.js`) — bunlar gerçek kağıt "MAL KABUL FORMU" (F.22) şablonuna Plan 4'te birebir uydurulmuş, bu görev onlara dokunmaz. Sadece o sayfalardaki ekran-üstü kontrol butonları (Yazdır/PDF İndir/Excel İndir) yeni buton stiline geçer.

## Referans

Kullanıcının paylaştığı ERP ekran görüntüsü: beyaz üst nav + açık gri alt-sekme şeridi (koyu dolgulu aktif "hap" buton), açık gri sayfa zemini üzerinde beyaz kartlar (ikon+başlık+opsiyonel rozet), büyük harf/harf aralıklı gri etiketler, yuvarlak kenarlıklı input'lar, turuncu vurgu butonu ("Ürün Ekle"), yeşil "uygun" durum kutusu.

## Kısıt: Davranış Değişmez, Sadece Görünüm

Bu tamamen bir CSS/markup görevi. Hiçbir görev şunları yapamaz:
- Var olan `id` değerlerini (örn. `#firma-msg`, `#kabul-tarih`, `#firma-search`) veya JS'in `querySelector` ile aradığı yapıyı bozmak — bunlar hem uygulama mantığının hem de mevcut testlerin (`tests/*.test.js`) üzerine kurulu.
- `escapeHtml()` kullanımını kaldırmak veya DB kaynaklı bir string'i `escapeHtml()`'siz `innerHTML`'e yazmak (bkz. Plan 1/2/3/4 Global Constraints — bu proje boyunca defalarca bulunan gerçek bir XSS sınıfı).
- RLS/route/veri katmanı davranışını değiştirmek.
- `mal-kabul-ciktisi.js`'nin `.print-page` içeriğini veya `mal-kabul-excel.js`'yi değiştirmek (kapsam dışı, yukarıda belirtildi).

Her görev sonunda `npm run test` **değişmeden** yeşil kalmalı (yeni test gerekmiyor, sadece mevcutların kırılmaması). Her sayfa gerçek tarayıcıda (`npm run dev`, `test`/`kalite` hesaplarıyla) görsel olarak doğrulanmalı.

## Tasarım Token'ları

`src/style.css`'e eklenecek CSS custom property'ler (`:root` üzerinde):

```css
--color-primary: #1e3a5f;       /* mevcut lacivert korunuyor, marka rengi */
--color-primary-hover: #16293f;
--color-accent: #d9822b;         /* "Ekle" tipi ikincil aksiyonlar için turuncu */
--color-accent-hover: #bf6f1e;
--color-success-bg: #e6f4ea;
--color-success-border: #a8d5b5;
--color-success-text: #1f8a4c;
--color-danger-bg: #fbe9ea;
--color-danger-border: #f0b4b8;
--color-danger-text: #b00020;
--color-warning-bg: #fff4e5;
--color-warning-border: #f0c987;
--color-warning-text: #a15c00;
--color-page-bg: #f4f5f7;
--color-card-bg: #ffffff;
--color-border: #e2e5ea;
--color-input-border: #d7dbe0;
--color-label: #6b7280;
--color-text: #1a1a1a;
--radius-card: 12px;
--radius-input: 8px;
--radius-pill: 999px;
--shadow-card: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
```

Var olan `escapeHtml`'li XSS regresyon testleri renk/class değişikliğinden etkilenmez (DOM yapısını değil `innerHTML` içeriğini test ediyorlar) — token eklemek güvenli.

## Paylaşılan Bileşenler (CSS sınıfları, yeni JS yok — mevcut şablonlara class eklenir)

- **`.card`** — beyaz zemin, `--radius-card`, `--shadow-card`, `1px solid var(--color-border)`, iç boşluk `1.25rem`. Her mantıksal form/liste bölümü (`Firmalar`, `Yeni Mal Kabul`'un "Teslimat Bilgileri"/"Ürünler" blokları, `Kalite Onayı` detay paneli vb.) bir `.card` içine alınır.
- **`.card-header`** — ikon (emoji veya basit inline SVG — yeni bir ikon kütüphanesi eklenmez, YAGNI) + kalın başlık + sağda opsiyonel `.badge`.
- **`.badge`** — küçük yuvarlak hap, renkli nokta + metin; durum rozetleri (`Taslak`/`Kalite Bekliyor`/`Onaylandı`/`Reddedildi`, `Uygun`/`Uygun Değil`/`Beklemede`) için varyantlar: `.badge-neutral`, `.badge-success`, `.badge-danger`, `.badge-warning`.
- **`.field`** — `label` (büyük harf, `--color-label`, `letter-spacing: 0.04em`, `font-size: 0.72rem`) + input/select sarmalayıcı; zorunlu alanlar `*` ile işaretli (mevcut `required` niteliği zaten var, sadece görsel işaret eklenir).
- **`input`, `select`** — `--radius-input`, `1px solid var(--color-input-border)`, focus'ta `--color-primary` kenarlık + hafif halka gölgesi.
- **`button.btn-primary`** (varsayılan `button` stili bu olur — mevcut davranış), **`button.btn-accent`** (turuncu, "Ekle" butonları), **`button.btn-danger`** (kırmızı, "Reddet"/"Sil"), **`button.btn-ghost`** (şeffaf/kenarlıklı, ikincil aksiyonlar — örn. "Taslak Kaydet").
- **`.pill-tab`** — hap şeklinde sekme butonu; `.pill-tab.active` koyu dolgu+beyaz metin, pasif beyaz dolgu+kenarlık.
- **`.status-box`** — Araç Hijyeni gibi checkbox+etiket satırları; işaretliyken `.status-box.checked` yeşil tint+kenarlık alır (JS zaten checkbox `change` event'ini dinliyor, sadece class toggle eklenir).

## Sayfa Bazlı Uygulama

**Nav kabuğu (`main.js`):** Şu anki tek-parça lacivert header, iki katmana bölünür: (1) beyaz üst şerit — sol "Mal Kabul Formu" başlığı, sağ kullanıcı adı/rol + Çıkış; (2) açık gri alt şerit — nav butonları `.pill-tab` olur, aktif rota (mevcut `location.hash` okunarak) koyu dolgulu gösterilir. Rota değiştikçe aktif pill güncellenir (`hashchange`'e ek bir küçük dinleyici — router'ın kendi mantığına dokunmadan, sadece görsel).

**Login (`login.js`):** Form bir `.card` içine alınır, ortalanmış, üstte basit bir başlık/ikon.

**Firmalar / Ürünler (`firmalar.js`, `urunler.js`):** Arama kutusu ve "Yeni ... Ekle" formu ayrı `.card`'lar olur; sonuç listesi (`renderSearchList`) `<ul>` yerine kart içinde satır-satır, hover'da hafif gri zemin. "Ekle" butonu `.btn-accent`.

**Yeni Mal Kabul (`yeni-kabul.js`):** Referans ekran görüntüsüyle en çok örtüşen sayfa. "Teslimat Bilgileri" alanları (Firma, Tarih, İrsaliye/Sipariş No, Fatura No, Araç Hijyeni, Araç Sıcaklığı) bir `.card` içinde 2 sütunlu grid; Araç Hijyeni `.status-box`; "Ürünler" ayrı bir `.card`, satır tablosu kart-içi satırlar olarak yeniden stillenir (mevcut `<table>` yapısı kalabilir, sadece CSS); "Taslak Kaydet" `.btn-ghost`, "Kaydet ve Kalite Onayına Gönder" `.btn-primary`.

**Kalite Onayı (`kalite-onay.js`):** Bekleyen kayıtlar listesi kart-satırları; detay paneli bir `.card`; durum select'i yerine (davranış aynı kalır) görsel olarak `.badge` önizlemesi eklenebilir; "Onayla" `.btn-primary`/yeşil, "Reddet" `.btn-danger`.

**Kayıt Ara (`arama.js`):** Filtre satırı bir `.card`; sonuç tablosu kart içinde, durum sütunu `.badge` ile gösterilir (mevcut `STATUS_LABELS` metnini değiştirmez, sadece görsel sarmalama); "Çıktı"/"CSV İndir" butonları yeni stil.

**Offline banner (`offline-banner.js`):** Fonksiyonel kırmızı/turuncu renkler korunur (yeni token'lardan `--color-danger`/`--color-warning` kullanılır), sadece görsel tutarlılık için köşe/boşluk ayarı.

## Test Planı

Her görev: `npm run test` (mevcut suite değişmeden yeşil) + `npm run build` + ilgili sayfanın gerçek tarayıcıda (`test`/`kalite` hesabıyla) ekran görüntüsü ile doğrulanması (buton renkleri, kart görünümü, rozet renkleri, mobil genişlikte grid'in tek sütuna düşmesi).

## Sıra Dışı Bırakılanlar (YAGNI)

- Karanlık mod yok (talep edilmedi).
- Yeni bir ikon kütüphanesi/font eklenmiyor (emoji veya inline SVG yeterli).
- Animasyon/geçiş efektleri bu görevin kapsamında değil.
- `renderSearchList`'in iç mantığı (filtreleme, escapeHtml) değişmiyor, sadece render edilen class'lar.
