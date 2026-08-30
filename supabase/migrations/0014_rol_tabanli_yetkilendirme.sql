-- 0014_rol_tabanli_yetkilendirme.sql
--
-- Ürün kararı: tek-rol modelinden üç-rollü bir modele geçiliyor (admin / depo_yonetici /
-- kalite_ekibi). profiles.role sütunu ve CHECK kısıtı zaten vardı (0001), kalite-onayı
-- kaldırma sürecinde (0012) RLS politikalarından rol kontrolü bilerek çıkarılmıştı —
-- bu migration o kontrolü YENİDEN devreye alıyor, ama artık iki değil üç rolle.
--
-- Yetki matrisi (bkz. docs/superpowers/specs/2026-08-30-rol-tabanli-yetkilendirme-design.md):
--   admin          -> kullanıcı yönetimi, firma/ürün yönetimi, sadece GÖRÜNTÜLEME (kayıt oluşturamaz)
--   depo_yonetici  -> firma/ürün yönetimi, kayıt oluşturma, görüntüleme
--   kalite_ekibi   -> sadece görüntüleme

-- 1) CHECK kısıtına 'admin' eklendi. Kısıt adı Postgres'in <tablo>_<sütun>_check varsayılan
--    adlandırmasıyla eşleşiyor (0001'de isimsiz inline CHECK olarak tanımlanmıştı).
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'depo_yonetici', 'kalite_ekibi'));

-- 2) companies/products: ekleme-düzenleme-silme artık admin+depo_yonetici ile sınırlı
--    (0012'de "herhangi bir authenticated kullanıcı" diye gevşetilmişti — geri sıkılaştırılıyor).
--    SELECT politikaları (companies_select_all, products_select_all) DOKUNULMUYOR.
drop policy if exists "companies_insert_all" on companies;
create policy "companies_insert_all" on companies for insert to authenticated
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

drop policy if exists "companies_update_manager" on companies;
create policy "companies_update_manager" on companies for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

drop policy if exists "companies_delete_manager" on companies;
create policy "companies_delete_manager" on companies for delete to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

drop policy if exists "products_insert_all" on products;
create policy "products_insert_all" on products for insert to authenticated
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

drop policy if exists "products_update_manager" on products;
create policy "products_update_manager" on products for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

drop policy if exists "products_delete_manager" on products;
create policy "products_delete_manager" on products for delete to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici')));

-- 3) receipts: insert/update artık admin+depo_yonetici ile sınırlı. SELECT (receipts_select_all)
--    DOKUNULMUYOR — kalite_ekibi zaten okuyabiliyordu. Mevcut sahiplik/durum şartları (received_by
--    = auth.uid(), status='taslak') aynen korunuyor, sadece rol şartı ekleniyor.
drop policy if exists "receipts_insert_manager" on receipts;
create policy "receipts_insert_manager" on receipts for insert to authenticated
  with check (
    received_by = auth.uid()
    and status = 'taslak'
    and quality_by is null
    and quality_note is null
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici'))
  );

drop policy if exists "receipts_update_manager_draft" on receipts;
create policy "receipts_update_manager_draft" on receipts for update to authenticated
  using (
    received_by = auth.uid() and status = 'taslak'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici'))
  )
  with check (
    received_by = auth.uid()
    and status in ('taslak', 'onaylandi')
    and quality_by is null
    and quality_note is null
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'depo_yonetici'))
  );

-- 4) receipt_items: insert/update/delete aynı desenle rol şartı alıyor.
drop policy if exists "receipt_items_insert_manager" on receipt_items;
create policy "receipt_items_insert_manager" on receipt_items for insert to authenticated
  with check (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
        and p.role in ('admin', 'depo_yonetici')
    )
  );

drop policy if exists "receipt_items_update_flow" on receipt_items;
create policy "receipt_items_update_flow" on receipt_items for update to authenticated
  using (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
        and p.role in ('admin', 'depo_yonetici')
    )
  )
  with check (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
        and p.role in ('admin', 'depo_yonetici')
    )
  );

drop policy if exists "receipt_items_delete_draft" on receipt_items;
create policy "receipt_items_delete_draft" on receipt_items for delete to authenticated
  using (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
        and p.role in ('admin', 'depo_yonetici')
    )
  );

-- 5) profiles: admin, başka kullanıcıların rolünü değiştirebilsin. Kolon bazlı grant zaten
--    hangi sütunların authenticated tarafından değiştirilebileceğini sınırlıyor (0002'de
--    full_name için yapılmıştı) — role için aynı deseni tekrarlıyoruz.
grant update (role) on profiles to authenticated;

drop policy if exists "profiles_update_admin_role" on profiles;
create policy "profiles_update_admin_role" on profiles for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 6) handle_new_user: rol artık sabit 'depo_yonetici' değil, user_metadata'dan okunuyor
--    (Edge Function yeni kullanıcı oluştururken role'ü buraya yazacak). Metadata'da rol
--    yoksa (ör. Supabase Dashboard'dan elle oluşturulan bir kullanıcı) eski varsayılan korunuyor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'depo_yonetici')
  );
  return new;
end;
$$;

-- 7) Bootstrap: mevcut 'test' kullanıcısı ilk admin olarak işaretleniyor.
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'test@malkabul.local');
