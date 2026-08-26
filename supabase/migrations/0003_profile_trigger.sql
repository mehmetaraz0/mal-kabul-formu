-- 0003_profile_trigger.sql

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- new.email artık gerçek bir e-posta değil, "kullaniciadi@malkabul.local" biçiminde sahte bir
  -- adres olabilir (bkz. Task 6 login değişikliği) — full_name varsayılanı olarak tüm adresi değil,
  -- sadece @ öncesi kullanıcı adını kullanmak daha okunaklı bir görünen isim verir.
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 'depo_yonetici');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
