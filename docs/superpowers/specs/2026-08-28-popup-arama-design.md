# Popup Arama (Search Dropdown) — Design Spec

**Tarih:** 2026-08-28
**Durum:** Onaylandı, uygulanıyor

## Amaç

`src/components/search-list.js`'teki paylaşılan `renderSearchList` bileşeni şu an arama kutusunun hemen altında sabit, her zaman görünen bir liste render ediyor. Kullanıcı bunun yerine "yazınca açılan popup" (autocomplete/dropdown) davranışı istiyor: kutu boşken hiçbir liste görünmesin, en az 1 karakter yazılınca eşleşenler kayan bir kutuda (dropdown) belirsin.

**Kapsam:** Sadece `src/components/search-list.js` ve ona ait CSS (`src/style.css`). Bu bileşeni kullanan üç yer (Firmalar, Ürünler, Yeni Mal Kabul'daki firma/ürün seçiciler) hiçbir kod değişikliği gerektirmez — hepsi otomatik olarak yeni davranışı alır.

## Davranış

- Kutu boşken (`query.trim() === ''`) dropdown gizli.
- En az 1 karakter yazılınca, eşleşen öğeler kutunun altında mutlak konumlu (position:absolute) bir dropdown'da görünür.
- Eşleşme yoksa dropdown "Sonuç bulunamadı" mesajıyla açık kalır (kullanıcıya geri bildirim için).
- Bir öğeye tıklanınca: `onSelect(item)` çağrılır (mevcut davranış), input **temizlenir**, dropdown kapanır — bu, Yeni Mal Kabul'daki ürün ekleme akışı gibi tekrarlı seçim yapılan yerlerde bir sonraki aramaya hazır bırakır.
- Kutu dışına tıklanınca veya `Escape` tuşuna basılınca dropdown kapanır.
- İlk `renderSearchList` çağrısında `<li>` elemanları DOM'a (gizli halde) yine yazılır — bu, mevcut `tests/search-list.test.js`'teki XSS regresyon testinin (render sonrası `container.querySelector('li')` bekliyor) değişmeden geçmesini sağlar; sadece görünürlük CSS ile kontrol edilir, DOM'un kendisi boş başlamaz.

## Kısıt

- `escapeHtml()` kullanımı, `data-key` tabanlı tıklama kablolaması, `filterItems`/`normalize` mantığı değişmez.
- Hiçbir çağıran dosya (`firmalar.js`, `urunler.js`, `yeni-kabul.js`) değişmez — `renderSearchList`'in dışa açık imzası (`{ items, getLabel, getKey, onSelect, placeholder }`) aynı kalır.
- Yeni bir bağımlılık eklenmez.
