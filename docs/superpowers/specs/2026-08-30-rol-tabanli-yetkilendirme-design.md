# Rol Tabanlı Yetkilendirme + Admin Kullanıcı Yönetimi — Tasarım

Tarih: 2026-08-30

## Amaç ve Kapsam

Uygulama şu an tek-rol modelinde çalışıyor: her authenticated kullanıcı her şeyi yapabiliyor
(kayıt oluşturma, firma/ürün yönetimi, kayıt görüntüleme). Bu, işletme büyüdükçe ve birden
fazla kullanıcı tipi (depo personeli, kalite ekibi, yönetici) ortaya çıktıkça yetersiz kalıyor.

Bu tasarım üç parçadan oluşuyor:
1. Üç rollü bir yetki matrisi (admin / depo_yonetici / kalite_ekibi) — DB (RLS) seviyesinde
   uygulanır, arayüz sadece bunu yansıtır.
2. Admin'in uygulama içinden yeni kullanıcı oluşturabilmesi (Supabase Edge Function ile).
3. İki küçük, ilgili iyileştirme: "Kayıt Ara" listesinde kaydı kimin oluşturduğunun görünmesi
   ve çıktılardaki İmzalar hücresine kaydı oluşturanın adının yazılması.

**Kapsam dışı**: istatistik/raporlama bölümü (ayrı bir tasarım/plan döngüsünde ele alınacak,
bkz. proje geçmişi), şifre sıfırlama/kullanıcı silme (gerekirse Supabase Dashboard'dan elle
yapılır), gerçek bir audit-log/değişiklik geçmişi tablosu (kullanıcı sadece "kaydı oluşturan
görünsün" istedi, mevcut `received_by` alanı zaten bunu karşılıyor — bkz. Açık Sorular altındaki
karar).

## Rol Matrisi

| Yetki | admin | depo_yonetici | kalite_ekibi |
|---|:---:|:---:|:---:|
| Kullanıcı oluştur / listele / rol değiştir | ✅ | ❌ | ❌ |
| Firma/Ürün ekle-düzenle-sil | ✅ | ✅ | ❌ |
| Yeni Mal Kabul kaydı oluştur | ❌ | ✅ | ❌ |
| Kayıt Ara + tekil çıktı (PDF/Excel) görüntüle | ✅ | ✅ | ✅ |

Admin bilinçli olarak mal kabul kaydı OLUŞTURAMAZ — rolü tamamen yönetimsel (kullanıcı,
firma/ürün, gözlem). `receipts_select_all` / `receipt_items_select_all` / `companies_select_all`
/ `products_select_all` zaten `using (true)` (herkes okuyabilir) — bu değişmiyor, sadece
insert/update/delete politikalarına rol şartı ekleniyor.

## Veri Modeli ve RLS (migration 0014)

Mevcut `profiles.role` sütunu (`0001_init_schema.sql`) ve CHECK kısıtı zaten var
(`depo_yonetici`, `kalite_ekibi`); kalite-onayı kaldırma sürecinde (0012) RLS politikalarından
rol kontrolü çıkarılmıştı ama sütun/CHECK bilerek dokunulmadan bırakılmıştı. Bu migration o
altyapıyı genişletip yeniden devreye alıyor:

1. **CHECK kısıtı**: `role in ('depo_yonetici', 'kalite_ekibi')` → `role in ('admin', 'depo_yonetici', 'kalite_ekibi')`.
2. **`companies`/`products`** insert/update/delete politikaları: `using(true)` / `with check(true)`
   yerine `exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','depo_yonetici'))`
   (0002'deki `depo_yonetici`-only desenle aynı yapı, sadece rol listesi genişletiliyor).
3. **`receipts_insert_manager`**: mevcut `received_by = auth.uid() and status = 'taslak'`
   şartına `and exists (... role in ('admin','depo_yonetici'))` eklenir. (Admin pratikte hiç
   kayıt oluşturmayacak ama depo ile aynı yetki grubunda tutuluyor — RLS'te ayrı bir admin
   istisnası gerekmiyor, çünkü admin zaten `received_by = auth.uid()` ile kendi adına kayıt
   açmayı hiç denemeyecek; arayüz de bu butonu admin'e göstermeyecek.)

   *Not: yalnızca depo_yonetici'nin oluşturabilmesini istiyorsan (admin'in DB seviyesinde bile
   hiç oluşturamaması), rol listesini `('depo_yonetici')` ile sınırlı tutmak da mümkün — ama
   arayüz zaten admin'e bu ekranı göstermeyeceği için pratikte fark etmiyor. Basitlik için
   admin+depo_yonetici birlikte tutuluyor, aşağıdaki "Açık Sorular"da bu seçim not edildi.*
4. **`receipts_update_manager_draft`**, **`receipt_items_insert_manager`**,
   **`receipt_items_update_flow`**, **`receipt_items_delete_draft`**: aynı desenle
   `role in ('admin','depo_yonetici')` şartı eklenir (sahiplik/durum şartları korunur).
5. **`profiles`**: `role` sütunu üzerinde `grant update (role) on profiles to authenticated`
   + yeni `profiles_update_admin_role` politikası:
   ```sql
   create policy "profiles_update_admin_role" on profiles for update to authenticated
     using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
     with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
   ```
   Mevcut `profiles_update_own` (sadece `full_name`, kendi satırı) politikasıyla birlikte var
   olacak — Postgres RLS politikaları OR'lanır, birinin `using` şartı geçerse satır güncellenebilir
   hale gelir; `with check` de aynı şekilde ayrı ayrı değerlendirilir. Kolon bazlı grant zaten
   hangi sütunların değiştirilebileceğini sınırlıyor (`full_name` VEYA `role`, ikisi ayrı grant).
6. **`handle_new_user`** tetikleyicisi: rol artık sabit `'depo_yonetici'` değil,
   `coalesce(new.raw_user_meta_data->>'role', 'depo_yonetici')`.
7. **Bootstrap**: `update profiles set role = 'admin' where id = (select id from auth.users where email = 'test@malkabul.local');`
   — kullanıcının kendi hesabı (`test`) ilk admin olarak işaretlenir.

## Admin Kullanıcı Oluşturma (Edge Function)

Supabase anon anahtarıyla tarayıcıdan yeni auth kullanıcısı oluşturulamaz (güvenlik nedeniyle
admin API'ları yalnızca `service_role` anahtarıyla çalışır, bu anahtar asla client'a gönderilemez).
Bu yüzden bir Edge Function gerekiyor:

- **Fonksiyon adı**: `create-user`.
- **Girdi** (JSON body): `{ username, password, fullName, role }`.
- **Akış**:
  1. `Authorization` header'ındaki JWT'den çağıran kullanıcının id'si çözülür (Supabase'in
     fonksiyona otomatik enjekte ettiği anon-key'li client ile `auth.getUser()`).
  2. Çağıranın `profiles.role = 'admin'` olduğu doğrulanır — değilse `403` ile reddedilir.
     **Bu kontrol olmadan fonksiyon herkese açık bir "kullanıcı oluştur" arka kapısı olur** —
     kritik güvenlik adımı.
  3. `role` girdisi `('admin','depo_yonetici','kalite_ekibi')` kümesinde değilse `400` döner
     (RLS/CHECK'e ek savunma, ama asıl doğrulama zaten DB CHECK kısıtında).
  4. `service_role` client'ı ile `auth.admin.createUser({ email: username + '@malkabul.local', password, email_confirm: true, user_metadata: { full_name: fullName, role } })` çağrılır.
  5. Başarılıysa yeni kullanıcının id/ad/rol bilgisi döner; `handle_new_user` tetikleyicisi
     `profiles` satırını otomatik oluşturur (doğru rolle, madde 6 sayesinde).
- **Deploy**: Supabase Dashboard → Edge Functions bölümünden (CLI gerekmiyor, kod editörden
  yapıştırılıp deploy edilebilir) — SQL migration çalıştırmaya benzer, tek seferlik manuel adım.
- **Hata durumları**: username zaten kullanılıyorsa Supabase Auth kendi hatasını döner (bu
  fonksiyon tarafından olduğu gibi client'a iletilir); frontend bunu okunur bir mesaja çevirir.

## Frontend

### `src/lib/role.js`
`hasAnyRole(profile, roles)` eklenir (mevcut `hasRole` korunur, tekil kontrol için hâlâ kullanılabilir):
```js
export function hasAnyRole(profile, roles) {
  return !!profile && roles.includes(profile.role);
}
```

### `src/main.js`
Nav pilleri ve route kayıtları role göre filtrelenir:
- `/yeni-kabul` ve ana sayfadaki "+ Yeni Mal Kabul" butonu: sadece `depo_yonetici`.
- `/firmalar`, `/urunler`: `admin` + `depo_yonetici`.
- `/arama`: her üç rol.
- `/kullanicilar` (yeni): sadece `admin`.

Bu filtreleme **yalnızca arayüzü şekillendirir** — gerçek yetkilendirme RLS politikalarında
(bkz. yukarısı), bu yüzden bir kullanıcı URL'yi elle değiştirip gizli bir sayfaya girse bile
DB seviyesinde işlem yapamaz (mevcut `auth.js` yorumundaki ilkeyle tutarlı).

### Yeni sayfa: `src/pages/kullanicilar.js`
- Kullanıcı listesi: `profiles` tablosundan `id, full_name, role` (zaten `profiles_select_all`
  ile herkese açık okunabilir, yeni bir sorgu kısıtı gerekmez — sayfa sadece admin nav'ında
  göründüğü için pratikte sadece admin görür).
- Her satırda rol değiştirme `<select>` — değişiklik `supabase.from('profiles').update({ role }).eq('id', ...)`
  ile gönderilir (madde 5'teki RLS politikası admin olmayanı zaten engeller).
- "Yeni Kullanıcı" formu: kullanıcı adı, şifre, ad-soyad, rol seçimi → `supabase.functions.invoke('create-user', { body: {...} })`.
- Kullanıcı adı (login) listede **gösterilmiyor** — sadece ad-soyad + rol (basitlik tercihi,
  brainstorming'de karara bağlandı).

## Ek İyileştirmeler (aynı planda, küçük kapsam)

### Kayıt Ara listesinde "Kaydeden" sütunu
`src/lib/receipts.js`'teki `listReceipts` sorgusuna `received_profile:profiles!receipts_received_by_fkey (full_name)`
join'i eklenir (`getReceiptDetail`'de zaten aynı desen var). `src/pages/arama.js`'teki tabloya
yeni bir "Kaydeden" `<th>`/`<td>` eklenir.

### İmzalar hücresine kaydı oluşturanın adı
- `src/pages/mal-kabul-ciktisi.js`: her satırın boş `<td></td>` (İmzalar) hücresi
  `${escapeHtml(receipt.receivedByName || '-')}` olur.
- `src/lib/mal-kabul-excel.js`: şu an bilerek boş bırakılan `O{row}:P{row}` (İmzalar) artık
  `sheet.getCell(\`O${row}\`).value = receipt.receivedByName || '-';` ile doldurulur. (Şablonda
  O:P'nin tek satır için birleştirilmiş tek hücre mi yoksa iki ayrı sütun mu olduğu plan/uygulama
  aşamasında şablon dosyası tekrar incelenerek doğrulanacak — C sütunundaki "iki satırlı tek
  hücre" deseniyle karışmasın diye.)

Bu değişiklik ıslak imza alanını ortadan kaldırıyor (hücreye isim yazıldığı için fiziksel imza
için ayrı boşluk kalmıyor) — kullanıcı bunu bilerek istedi (brainstorming'de onaylandı).

## Test Planı

- `tests/role.test.js` (yeni veya `auth.test.js`'e ek): `hasAnyRole` için pozitif/negatif/null
  senaryoları.
- `main.js`'in nav filtreleme mantığı için (mevcut test dosyası yoksa) rol bazlı görünürlük
  testi — hangi route'ların hangi rollerde kayıtlı olduğu.
- `tests/receipts-list.test.js`: `listReceipts`'in `received_profile` join'ini istediği ve
  sonucun `receivedByName`'e eşlendiği doğrulanır.
- `tests/mal-kabul-excel.test.js`: İmzalar hücresine isim yazıldığını doğrulayan yeni test.
- Edge Function için otomatik test kapsamı yok (Supabase Dashboard'da manuel deploy/test) —
  ama `kullanicilar.js` sayfasının `supabase.functions.invoke` çağrısını doğru body ile
  yaptığını doğrulayan bir mock testi eklenecek.
- RLS politikaları için: mevcut projede SQL politikalarının otomatik testi yok (Supabase SQL
  Editor'da manuel doğrulama yapılıyor, tıpkı önceki migration'larda olduğu gibi) — canlıya
  almadan önce üç farklı rolle (admin/depo/kalite) gerçek tarayıcıda uçtan uca doğrulama yapılacak.

## Açık Sorular / Kararlaştırılan Notlar

- Admin'in `receipts_insert_manager` rol listesinde depo_yonetici ile birlikte tutulması
  (madde 3) sadece basitlik için — davranışsal fark yaratmıyor çünkü arayüz admin'e bu ekranı
  hiç göstermiyor. İstenirse ileride `('depo_yonetici')`'ye daraltılabilir.
- İlk admin hesabı: kullanıcı adı `test` (email: `test@malkabul.local`).
