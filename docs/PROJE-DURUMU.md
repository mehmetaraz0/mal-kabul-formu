# Mal Kabul Formu — Proje Durumu ve Devir Notu

Bu belge, projeyi hiç bilmeyen bir yapay zeka asistanının (veya geliştiricinin) kaldığı yerden
devam edebilmesi için yazıldı. Tarih: 2026-08-30 (son güncelleme: 2026-09-02, üçüncü oturum).

## Proje Nedir

Bir gıda işletmesi (gürok Turizm Grubu) için mal kabul (goods-receipt) süreçlerini dijitalleştiren
bir PWA. Depo personeli teslim alınan malları (firma, ürün, miktar, SKT, sıcaklık, uygunluk vb.)
kaydediyor; sistem F.22 resmi form şablonuna uygun PDF/Excel çıktısı üretiyor.

- **Canlı adres**: https://malkabul.dornevi.com/ — özel alan adı (2026-09-02'de geçildi).
  Eski adres `https://mehmetaraz0.github.io/mal-kabul-formu/` artık buraya YÖNLENDİRİYOR.
  Alan adı `public/CNAME` dosyasıyla bildiriliyor; DNS'te `malkabul` CNAME kaydı
  `mehmetaraz0.github.io`'ya işaret ediyor (dornevi.com kullanıcıya ait).
- **GitHub repo**: https://github.com/mehmetaraz0/mal-kabul-formu (branch: `master`)
- **Yerel çalışma alanı**: `D:\kabul formu\.claude\worktrees\gorsel-tasarim-yenileme` — bu bir git
  worktree, ana checkout `D:\kabul formu`'dur. Branch adı `worktree-gorsel-tasarim-yenileme`.

## Teknoloji Yığını

- **Frontend**: Vite + saf JavaScript (framework yok), `vite-plugin-pwa` ile PWA/offline destek.
- **Backend**: Supabase (Postgres + Auth + RLS + RPC + Edge Functions).
- **Test**: Vitest (`npm run test`), jsdom ortamı.
- **Deploy**: `npm run build` → GitHub Actions → GitHub Pages. **Deploy mekanizması**: bu worktree
  branch'inden `master`'a DOĞRUDAN push (PR/merge süreci yok, solo proje):
  ```bash
  git push origin worktree-gorsel-tasarim-yenileme:master
  ```
  Push sonrası GitHub Actions birkaç dakika içinde otomatik deploy eder.
  **Vite `base` ayarı `/`** (özel alan adı kök dizinde yayınlandığı için). Proje sitesi
  döneminde `/mal-kabul-formu/` idi — alt-yola geri dönülürse `base`, `start_url` ve `scope`
  üçü birden değişmeli. Şablon/logo fetch'leri `import.meta.env.BASE_URL` kullandığı için
  kendiliğinden uyum sağlar, elle dokunulmaz.
- **Ortam değişkenleri**: `.env.local` (repo'da yok, gizli) — `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`.

## Kritik Kısıtlar / Kurallar (mutlaka bilinmesi gereken)

0. **ÖNCE HANGİ ÇALIŞMA ALANINDA OLDUĞUNU DOĞRULA.** Ana checkout (`D:\kabul formu`) uzun süre
   `origin/master`'ın 56 commit GERİSİNDE takılı kaldı ve bir oturum boyunca fark edilmeden o
   bayat kod üzerinde çalışıldı — kaldırılmış `kalite-onay.js` akışına özellik eklendi, hepsi
   çöpe gitti. İşe başlamadan MUTLAKA şunu çalıştır:
   ```bash
   git log --oneline -1 && git status -sb && git fetch -q origin && git log --oneline -1 origin/master
   ```
   HEAD `origin/master` ile aynı değilse önce `git merge --ff-only origin/master` yap. Gerçek
   geliştirme worktree'si `.claude/worktrees/gorsel-tasarim-yenileme` (branch
   `worktree-gorsel-tasarim-yenileme`); deploy oradan yapılır. Bir ekran görüntüsündeki arayüz
   koda uymuyorsa iki şüpheli vardır: (a) bayat checkout, (b) tarayıcıdaki bayat service worker
   paketi — ikisi de bu projede gerçekten yaşandı.
1. **Supabase migration'ları OTOMATİK ÇALIŞMAZ.** `supabase/migrations/` altına yeni bir `.sql`
   dosyası eklemek onu production'a UYGULAMAZ — kullanıcının bu dosyanın TAM içeriğini Supabase
   Dashboard → SQL Editor'a yapıştırıp çalıştırması gerekir. Kullanıcıya dosyanın tam yolunu VE
   içeriğini birlikte vermek (kullanıcı dosyayı bulmakta zorlanabiliyor) en güvenlisi.
2. **Zaten çalıştırılmış (production'a uygulanmış) bir migration dosyası bir daha ASLA
   düzenlenmez.** Sonradan bir düzeltme gerekirse her zaman YENİ, bir sonraki numaralı migration
   dosyası eklenir (ör. `0013_siparis_no_kaldir.sql`, `0012`'yi değil kendi başına yeni bir
   düzeltme ekledi). En son migration numarası: **0016** (`marka` alanı).
3. **Supabase Edge Function'lar da elle deploy edilir** (Dashboard → Edge Functions → kodu
   yapıştır → Deploy). Şu an tek bir Edge Function var: `create-user`
   (`supabase/functions/create-user/index.ts`) — admin'in yeni kullanıcı oluşturması için.
4. Bu asistan (Claude) **şifre girmek/kimlik doğrulamak gibi işlemleri yapamaz** (politika gereği)
   — giriş gerektiren sayfaları (Yeni Mal Kabul, İstatistik detay sayfaları vb.) tarayıcıda canlı
   test edemez, sadece Vitest testleriyle ve statik kod okumasıyla doğrulama yapabilir. Bu tür
   değişikliklerde kullanıcıdan canlı doğrulama istenmesi gerekir.
5. **Geliştirme süreci deseni** (bu oturumda tutarlı şekilde izlendi, devam eden ajan da izlemeli):
   yeni bir özellik istendiğinde önce `superpowers:brainstorming` (netleştirici sorular → tasarım
   belgesi `docs/superpowers/specs/`), sonra `superpowers:writing-plans` (uygulama planı
   `docs/superpowers/plans/`), sonra `superpowers:subagent-driven-development` (her görev için
   ayrı bir implementer subagent + task reviewer + fix loop, sonunda bütün-plan final review).
   Küçük/dar kapsamlı düzeltmeler (tek dosya, birkaç satır) bu tam süreç olmadan doğrudan
   yapılabiliyor — kullanıcı bu ayrımı takdir ediyor, her küçük şey için tam süreci beklemiyor.
6. Migration/SQL çalıştırma onayı istenirken kullanıcı bazen sadece "devam"/"tamam" diyor —
   gerçekten çalıştırıp çalıştırmadığından EMİN OLUNMALI (belirsizse tekrar sorulmalı), çünkü
   frontend kod deploy'u migration'dan BAĞIMSIZ ve daha hızlı gerçekleşiyor; migration
   çalışmadan ilgili kod canlıya çıkarsa sayfalar hata verir.

## Veri Modeli (özet)

- `profiles` (id, full_name, **role**: `admin` | `depo_yonetici` | `kalite_ekibi`)
- `companies` (id, sira_no, name)
- `products` (id, code, name, unit: `kg`|`ad`, category)
- `receipts` (id, client_uuid, company_id, receipt_date, irsaliye_no, received_by, status:
  pratikte HER ZAMAN `onaylandi` — arayüzde tek "Kaydet" butonu var ve her zaman
  `submitToQuality: true` gönderiyor. `taslak` şema/RPC seviyesinde hâlâ mümkün ama arayüzden
  üretilemiyor; mevcut taslak test kayıtları da temizlendi. `kalite_bekliyor`/`reddedildi`
  tamamen eski (0012'den beri üretilmiyor),
  fatura_no, arac_hijyen_uygun, arac_sicaklik, quality_by/quality_note — bu ikisi kalite-onayı
  akışından kalma, artık kullanılmıyor ama sütun duruyor)
- `receipt_items` (id, receipt_id, product_id, line_no, lot_no, skt, quantity, unit, uygunluk:
  `beklemede`|`uygun`|`uygun_degil`, note, urun_sicakligi, yari_omur_gecti, **marka** [yeni,
  0016])
- Kayıt oluşturma TEK bir RPC üzerinden: `create_receipt_with_items(...)` — hem `receipts` hem
  `receipt_items` satırlarını tek transaction'da, idempotent (`client_uuid` ile) oluşturur.

## Rol Matrisi (0014/0015 ile geldi)

| Yetki | admin | depo_yonetici | kalite_ekibi |
|---|:---:|:---:|:---:|
| Kullanıcı oluştur/rol değiştir (`/kullanicilar`) | ✅ | ❌ | ❌ |
| Firma/Ürün ekle-düzenle-sil | ✅ | ✅ | ❌ |
| Yeni Mal Kabul kaydı oluştur | ❌ | ✅ | ❌ |
| Kayıt Ara + İstatistik görüntüle | ✅ | ✅ | ✅ |

İlk admin hesabı: kullanıcı adı `test`. Giriş kullanıcı adı/şifreyle yapılıyor (`kullaniciadi@malkabul.local`
sentetik e-postasına çevrilip Supabase Auth'a öyle gönderiliyor — bkz. `src/pages/login.js`).

## Tamamlanan Büyük İşler (yeniden eskiye, oturum oturum)

0. **Üçüncü oturum (mobil düzeltmeler + özel alan adı)** — 2026-09-02, dokuz deploy:
   - `1c32cf1` + `a2f55b6` **Dokunmatik ürün seçimi düzeltildi** (PWA'da liste öğesine
     dokununca seçim olmayıp arkadaki SKT kutusunun tarih seçicisi açılıyordu). İki aşamalı:
     (a) seçim `click` yerine `pointerup`'ta kesinleşiyor, 10px kaydırma toleransıyla — böylece
     uzun listeyi kaydırmak seçim sayılmıyor; (b) seçimden sonra gelen uyumluluk `click`'i
     350ms boyunca yakalama fazında yutuluyor — liste kapandığı için o click boşalan
     koordinattaki SKT kutusuna düşüyordu. `pointerup`'ta `preventDefault()` bunu engellemez;
     spec gereği uyumluluk fare olaylarını yalnızca `pointerdown`'ın iptali bastırır, ama
     pointerdown'ı iptal etmek kaydırmayı bozar. Kök neden, kullanıcının çektiği ekran
     videosunun ffmpeg ile kare kare incelenmesiyle bulundu.
   - `c0dbef3`..`f718a5c` **Telefon responsive tablolar** (subagent-driven-development, 4 task).
     Kayıt Ara ≤640px'te karta dönüşüyor (`table.card-table.stacked`, `data-label` + CSS
     `::before`); istatistik ve kullanıcılar tabloları sıkıştırılıyor, sayısal hücreler açık
     `num` sınıfı taşıyor (konumdan `:nth-child` tahmini YAPILMIYOR). Spec ve plan:
     `docs/superpowers/specs|plans/2026-08-30-telefon-responsive-tablolar*.md`.
   - `f6c3c83` + `cc2ff01` Kayıt Ara filtre çubuğu: tarih kutuları telefonda `gg.aa.yyyy`
     metnini gösteremeyecek kadar daralıyordu (`min-width` yoktu). Tüm filtreler 140px'e
     çekilip 2×2 dizildi. Ayrıca final incelemenin 5 minor bulgusu kapatıldı.
   - `fa6cf5a` **Excel çıktısı imza hatası**: kod her veri satırında `O:P` hücrelerini
     birleştiriyordu, bu yüzden teslim alanın adı onay kutusunu da doldurmuş görünüyordu.
     Şablonda "İmzalar" başlığı `O3:P4` olarak birleşik ama VERİ satırlarında iki ayrı kutu
     var: **O = teslim alan (otomatik), P = onaylayan (çıktı üzerinde elle)**. Satır bazlı
     birleştirme kaldırıldı, P'ye hiç dokunulmuyor.
   - `f906cce` PWA ikonları gerçek logoyla değiştirildi (192, 512, apple-touch 180) ve
     `public/favicon.png` eklendi — her konsol çıktısında görünen `favicon.ico` 404'ü kapandı.
     Eski ikonlar birer yer tutucuydu (548 ve 1882 bayt). `public/logo.png`'ye DOKUNULMADI:
     o şirket logosu, Excel ve yazdırma çıktısında kullanılıyor, ayrı bir varlık.
   - `f90ca5a` **Özel alan adına geçiş** (yukarıdaki "Canlı adres" ve "Deploy" maddelerine bak).
   - Test sayısı 200 → 219. Yeni test dosyaları: `istatistik-tablolar.test.js`.

1. **İkinci oturum (bakım turu)** — üç deploy:
   - `cf6423a` Service worker periyodik güncelleme kontrolü (`src/lib/sw-update.js`, 15 dk).
     Güncelleme çubuğu zaten vardı ama gün boyu açık kalan sekmelerde hiç tetiklenemiyordu.
   - `beabe0c` Kayıt Ara'dan DURUM sütunu ve filtresi kaldırıldı (kullanıcı isteği).
   - `c4e9535` Yeni Mal Kabul'den "Taslak Kaydet" butonu kaldırıldı; tek "Kaydet" kaldı, her
     kartın Uygun/Uygunsuz işaretlenmesi artık ZORUNLU (veritabanı 0007'de zaten böyleydi).
     Buton id'si `submit-quality-btn` → `save-btn`.
   - Veri temizliği (SQL Editor'da elle çalıştırıldı, migration DEĞİL): 3 adet taslak test kaydı
     (`TEST-DIAG`, `PAGETEST-15` ve irsaliyesiz olan) ve cascade ile 17 kalemi silindi.
     Çalıştırılan sorgu: `delete from receipts where status = 'taslak' and id in (...)`.
   - Test sayısı 180 → 200. Yeni test dosyaları: `sw-update.test.js`, `arama.test.js`.
2. **Ürün Kartı Yeniden Tasarımı**: Yeni Mal Kabul'deki ürün girişi, satır bazlı tablodan
   her kalem için dikey bir karta (kendi popup ürün arama kutusu, Uygun/Uygunsuz iki buton,
   Kartı Sil) dönüştürüldü. `docs/superpowers/specs/2026-08-30-urun-karti-tasarimi.md` +
   `docs/superpowers/plans/2026-08-30-urun-karti-tasarimi.md`. Ana dosya: `src/pages/yeni-kabul.js`.
3. **Marka Alanı + Açıklama Sütunu Değişikliği**: `receipt_items.marka` (migration 0016),
   Excel/PDF çıktısındaki "Açıklama" sütunu artık Not değil Marka gösteriyor.
4. **İstatistik Bölümü + Detay Sayfaları**: `/istatistik` (ürün/firma bazında toplam kg/adet/red
   sayısı, tarih filtreli), ürün/firma satırına tıklayınca `/istatistik-urun-detay` /
   `/istatistik-firma-detay` (firma+marka veya ürün+marka kırılımı). Veri katmanı:
   `src/lib/statistics.js`. Tasarım: `docs/superpowers/specs/2026-08-30-istatistik-bolumu-design.md`
   ve `docs/superpowers/specs/2026-08-30-istatistik-detay-marka-design.md`.
5. **Rol Tabanlı Yetkilendirme + Admin Paneli**: yukarıdaki rol matrisi, `/kullanicilar` sayfası,
   `create-user` Edge Function. Tasarım: `docs/superpowers/specs/2026-08-30-rol-tabanli-yetkilendirme-design.md`.
6. Daha eski işler (bu oturumdan önce): mal kabul formu + Supabase altyapısı (5 plan), GitHub
   Pages deploy, popup firma/ürün arama, CSV→Excel dönüşümü + F.22 şablonuna birebir uyan
   sayfalama (13 satır/sayfa), kalite-onayı akışının tamamen kaldırılması (tek adımlı kayıt
   modeline geçiş), şirket logosunun Excel'e gömülmesi, gereksiz "Sipariş No" alanının kaldırılması.

## Bilinen/Açık Sorunlar

- **[ÇÖZÜLDÜ] "Kayıt Ara" sayfasında Ürün filtresi boş görünüyor.** Kök neden veri veya RLS
  DEĞİLDİ: tarayıcı bayat bir JS paketi sunuyordu. Kanıt, "Kaydeden" sütununun yenilemeler
  arasında kaybolup geri gelmesiydi (iki farklı build). Site verisi temizlenip sert yenileme
  yapıldıktan sonra `$$('#filter-product option').length` = 65 döndü, yani filtre hep doluydu.
  `products_select_all` politikası 0002'den beri `using(true)` ve hiçbir migration onu
  değiştirmemiş. Kalıcı çözüm için service worker artık 15 dakikada bir güncelleme kontrolü
  yapıyor (`src/lib/sw-update.js`), böylece güncelleme çubuğu gün boyu açık kalan sekmelerde de
  görünebiliyor — eskiden `onNeedRefresh` yalnızca sayfa yeniden yüklenirse tetiklendiği için
  çubuk pratikte ulaşılamazdı.
- **PWA'ların yeniden kurulması gerekiyor.** Alan adı değişikliği tarayıcı için yeni bir
  origin demek: eski kısayol hâlâ github.io'yu işaret eder, service worker önbelleği,
  localStorage (oturum) ve IndexedDB (çevrimdışı kuyruk) yeni adreste BOŞTUR. Geçiş sırasında
  kuyruk boştu, veri kaybı olmadı — ama bir cihaz hâlâ eski adreste kurulu duruyorsa ve
  senkronize edilmemiş kaydı varsa, o kayıt yeni adreste görünmez.
- **Android maskable ikon yok.** `purpose: "maskable"` ikonu bilinçli eklenmedi: logodaki mor
  baklava üst-sağ köşeye yakın ve dairesel maske onu kırpardı. Chrome şu an ikonu beyaz zemine
  oturtup küçültüyor — güvenli ama ana ekranda küçük duruyor. Kenar boşluklu ayrı bir maskable
  sürüm üretilirse tam boy görünür.
- Design spec'lerdeki "Açık Sorular" bölümlerinde kayıtlı, bilinçli olarak ertelenmiş küçük
  konular var (ör. marka'nın serbest metin olması nedeniyle yazım tutarsızlığı riski, kayıt
  detay sayfalarında bazı alanların salt-okunur kalması) — kritik değil, sadece bilgi amaçlı.

## Nasıl Devam Edilir

- Yeni bir özellik isteği geldiğinde önce **brainstorming** ile netleştir (kullanıcı genelde
  isteğini eksik/belirsiz ifade ediyor, netleşene kadar 2-4 tur soru-cevap normal), sonra tasarım
  belgesi yaz, sonra plan yaz, sonra (kullanıcıya sor) subagent-driven-development veya inline
  execution ile uygula.
- Migration gerektiren bir değişiklik varsa: dosyayı `supabase/migrations/000N_...sql` olarak
  oluştur, kullanıcıya TAM İÇERİĞİYLE (yolunu değil, içeriğini de) paylaş, SQL Editor'da
  çalıştırdığını AÇIKÇA doğrulat, sonra frontend kodunu deploy et.
- Her değişiklikten sonra `npm run test` (tüm paket) ve `npm run build` çalıştır, ikisi de temiz
  olmadan deploy etme.
- Deploy: `git add` + `git commit` + `git push origin worktree-gorsel-tasarim-yenileme:master`.
- Giriş gerektiren bir sayfa değiştiyse, canlı doğrulamayı kullanıcıdan iste (kendi başına
  tarayıcıda giriş yapamazsın).
