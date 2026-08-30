-- 0015_role_metadata_guvenlik_sikilastirma.sql
--
-- Final review bulgusu: handle_new_user() (0014) rolü raw_user_meta_data'dan okuyordu — bu alan
-- user_metadata üzerinden CLIENT TARAFINDAN yazılabilir (ör. supabase.auth.updateUser({data:
-- {role:'admin'}}) veya kendi kendine kayıt açıksa signUp() ile). Kendi kendine kayıt şu an
-- Dashboard'dan kapalı (bkz. proje geçmişi) ama bu, admin rolünün güvenliğini görünmez/dokümante
-- edilmemiş bir ayara bağlı bırakıyordu. raw_app_meta_data'ya geçiliyor — bu alan SADECE
-- service_role anahtarıyla (yani create-user Edge Function'ı içinde) yazılabilir, self-signup
-- açık olsa bile client bunu değiştiremez.
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
    coalesce(new.raw_app_meta_data->>'role', 'depo_yonetici')
  );
  return new;
end;
$$;

-- Final review bulgusu: lock_profile_role_self_edit (0014) trigger'ı auth.uid()'i NULL
-- bulduğunda (Supabase SQL Editor'da, yani JWT olmadan çalışan sorgularda auth.uid() NULL
-- döner) "not exists(...)" true olur ve rol değişikliğini REDDEDER — bu da tek admin'in
-- yanlışlıkla kendini düşürdüğü bir senaryoda SQL Editor'dan elle düzeltme yapmayı
-- (trigger'ı önce disable etmeden) imkansız kılıyordu. auth.uid() is not null şartı eklenerek
-- SQL Editor / service_role bağlamındaki güncellemeler bu kısıttan muaf tutuluyor — authenticated
-- ve anon rollerinin ikisi de her zaman bir JWT taşıdığı için (RLS zaten sadece bu iki role
-- update izni veriyor), gerçek uygulama trafiğinde bu muafiyetin kötüye kullanılma yolu yok.
create or replace function public.lock_profile_role_self_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
    and new.role is distinct from old.role
    and not exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  then
    raise exception 'Rol değişikliği sadece admin tarafından yapılabilir';
  end if;
  return new;
end;
$$;
