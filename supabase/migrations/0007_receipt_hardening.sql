-- 0007_receipt_hardening.sql
--
-- Plan 3 final review bulgularının veritabanı tarafı sağlamlaştırmaları.

-- Fix 4: miktar pozitif olmalı (uygulama tarafındaki kontrolün veritabanı karşılığı)
alter table receipt_items add constraint receipt_items_quantity_positive check (quantity > 0);

-- Fix 5: onay için "tüm satırlar işaretlenmiş ve en az bir satır var" kuralının sunucu tarafı
-- zorunluluğu. finalizeQuality'deki uygulama seviyesindeki kontrol tek başına yeterli değil:
-- iki kalite personeli aynı kayıtta yarışırsa veya istemci atlanırsa (doğrudan PostgREST çağrısı)
-- eksik işaretlenmiş bir kayıt onaylanabiliyordu.
create or replace function public.check_receipt_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'onaylandi' and old.status is distinct from 'onaylandi' then
    if not exists (select 1 from receipt_items where receipt_id = new.id) then
      raise exception 'Onaylanacak kayıtta en az bir ürün satırı olmalı';
    end if;
    if exists (select 1 from receipt_items where receipt_id = new.id and uygunluk = 'beklemede') then
      raise exception 'Tüm satırlar uygun/uygun değil olarak işaretlenmeden onaylanamaz';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists receipts_before_approve on receipts;
create trigger receipts_before_approve
  before update on receipts
  for each row execute procedure public.check_receipt_approval();

-- Fix 3: RPC artık tek çağrıda atomik "oluştur + kalite onayına gönder" yapabiliyor ve boş
-- satır dizisini veritabanı seviyesinde reddediyor.
--
-- ÖNEMLİ: yeni parametre (p_submit_to_quality) fonksiyonun imzasını değiştirdiği için
-- `create or replace` eski 7 parametreli sürümü DEĞİŞTİRMEZ, yanına yeni bir overload ekler.
-- Bu durumda 7 adlandırılmış argümanla yapılan çağrılar "function is not unique" hatası verir.
-- Bu yüzden eski imzayı önce açıkça düşürüyoruz.
drop function if exists create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb);

-- `security invoker` (0006'daki gibi): fonksiyon ÇAĞIRAN kullanıcının yetkileriyle çalışır.
-- p_submit_to_quality için yapılan UPDATE, 0004'teki `receipts_update_manager_draft` politikasının
-- ilk kolundan geçer: using → (status='taslak' and received_by=auth.uid() and role='depo_yonetici'),
-- with check → (received_by=auth.uid() and status in ('taslak','kalite_bekliyor')
-- and quality_by is null and quality_note is null and role='depo_yonetici'). Yani insert ile
-- birebir aynı auth.uid()/rol kontrolü; yetki yükseltmesi yok.
create or replace function create_receipt_with_items(
  p_company_id bigint,
  p_receipt_date date,
  p_irsaliye_no text,
  p_siparis_no text,
  p_received_by uuid,
  p_client_uuid text,
  p_items jsonb,
  p_submit_to_quality boolean default false
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_receipt_id uuid;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'En az bir ürün satırı gerekli';
  end if;

  insert into receipts (client_uuid, company_id, receipt_date, irsaliye_no, siparis_no, received_by, status)
  values (p_client_uuid, p_company_id, p_receipt_date, p_irsaliye_no, p_siparis_no, p_received_by, 'taslak')
  returning id into v_receipt_id;

  insert into receipt_items (receipt_id, product_id, line_no, lot_no, skt, quantity, unit, uygunluk)
  select
    v_receipt_id,
    (item->>'productId')::bigint,
    (item->>'lineNo')::int,
    item->>'lotNo',
    nullif(item->>'skt', '')::date,
    (item->>'quantity')::numeric,
    item->>'unit',
    'beklemede'
  from jsonb_array_elements(p_items) as item;

  if p_submit_to_quality then
    update receipts set status = 'kalite_bekliyor' where id = v_receipt_id;
  end if;

  return v_receipt_id;
end;
$$;

-- Fix 12 (minor, defense in depth): anon rolünün bu RPC'yi çağırmak için meşru bir nedeni yok.
-- RLS zaten `to authenticated` politikalarıyla engelliyor, ama Postgres yeni fonksiyonlara
-- varsayılan olarak PUBLIC EXECUTE verir (anon dahil tüm rollere miras kalır). Sadece
-- `... from anon` yazmak PUBLIC üzerinden gelen yetkiyi geri almaz (anon'a doğrudan verilmiş bir
-- yetki yok ki geri alınsın) — bu yüzden önce PUBLIC'ten geri alıp sonra sadece authenticated'e
-- açıkça veriyoruz.
revoke execute on function create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean) from public;
grant execute on function create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean) to authenticated;
