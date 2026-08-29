-- 0013_siparis_no_kaldir.sql
--
-- Ürün kararı: "Sipariş No" alanı gereksiz — hiçbir çıktıda (PDF/print, Excel) hiç
-- gösterilmiyordu, sadece formda toplanıp veritabanında duruyordu. Alan tamamen
-- kaldırılıyor: RPC parametresi, sabit-alan kilidi kontrolü ve sütunun kendisi.

-- create_receipt_with_items: p_siparis_no parametresi kaldırıldığı için imza
-- (parametre tip listesi) değişiyor — `create or replace` bunu kabul etmez,
-- önce eski imzayla DROP edilmesi gerekiyor.
drop function if exists create_receipt_with_items(
  bigint, date, text, text, uuid, text, jsonb, boolean, text, boolean, numeric
);

create function create_receipt_with_items(
  p_company_id bigint,
  p_receipt_date date,
  p_irsaliye_no text,
  p_received_by uuid,
  p_client_uuid text,
  p_items jsonb,
  p_submit_to_quality boolean default false,
  p_fatura_no text default null,
  p_arac_hijyen_uygun boolean default null,
  p_arac_sicaklik numeric default null
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

  -- UYARI: bu insert'e asla bir `on conflict (client_uuid) do update ...` SET listesi
  -- eklenmesin — RLS UPDATE-politikası sorununu geri getirir (bkz. 0011). `do nothing`
  -- + aşağıdaki erken-dönüş bilerek tercih edildi.
  insert into receipts (
    client_uuid, company_id, receipt_date, irsaliye_no, received_by, status,
    fatura_no, arac_hijyen_uygun, arac_sicaklik
  )
  values (
    p_client_uuid, p_company_id, p_receipt_date, p_irsaliye_no, p_received_by, 'taslak',
    p_fatura_no, p_arac_hijyen_uygun, p_arac_sicaklik
  )
  on conflict (client_uuid) do nothing
  returning id into v_receipt_id;

  if v_receipt_id is null then
    select id into v_receipt_id from receipts where client_uuid = p_client_uuid;
    return v_receipt_id;
  end if;

  insert into receipt_items (
    receipt_id, product_id, line_no, lot_no, skt, quantity, unit, uygunluk, note,
    urun_sicakligi, yari_omur_gecti
  )
  select
    v_receipt_id,
    (item->>'productId')::bigint,
    (item->>'lineNo')::int,
    item->>'lotNo',
    nullif(item->>'skt', '')::date,
    (item->>'quantity')::numeric,
    item->>'unit',
    coalesce(item->>'uygunluk', 'beklemede'),
    nullif(item->>'note', ''),
    nullif(item->>'urunSicakligi', '')::numeric,
    coalesce((item->>'yariOmurGecti')::boolean, false)
  from jsonb_array_elements(p_items) as item;

  if p_submit_to_quality then
    update receipts set status = 'onaylandi' where id = v_receipt_id and status = 'taslak';
  end if;

  return v_receipt_id;
end;
$$;

-- lock_receipt_core_fields: siparis_no kontrolü kaldırıldı (sütun aşağıda drop ediliyor).
create or replace function public.lock_receipt_core_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id is distinct from old.company_id
    or new.received_by is distinct from old.received_by
    or new.receipt_date is distinct from old.receipt_date
    or new.irsaliye_no is distinct from old.irsaliye_no
    or new.client_uuid is distinct from old.client_uuid
  then
    raise exception 'Bu alanlar oluşturulduktan sonra değiştirilemez: company_id, received_by, receipt_date, irsaliye_no, client_uuid';
  end if;
  return new;
end;
$$;

alter table receipts drop column if exists siparis_no;
