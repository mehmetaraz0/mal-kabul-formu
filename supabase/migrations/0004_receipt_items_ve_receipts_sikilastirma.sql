-- 0004_receipt_items_ve_receipts_sikilastirma.sql

-- C1: receipt_items_update_flow'da with check eksikti; bu da receipt_items_insert_manager'ın
-- "uygunluk = beklemede" zorunluluğunu bir sonraki UPDATE ile tamamen etkisiz kılıyordu.
drop policy if exists "receipt_items_update_flow" on receipt_items;
create policy "receipt_items_update_flow" on receipt_items for update to authenticated
  using (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and (
        (r.status = 'taslak' and r.received_by = auth.uid() and p.role = 'depo_yonetici')
        or (r.status = 'kalite_bekliyor' and p.role = 'kalite_ekibi')
      )
    )
  )
  with check (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and (
        (r.status = 'taslak' and r.received_by = auth.uid() and p.role = 'depo_yonetici' and uygunluk = 'beklemede')
        or (r.status = 'kalite_bekliyor' and p.role = 'kalite_ekibi' and uygunluk in ('uygun', 'uygun_degil', 'beklemede'))
      )
    )
  );

-- I1: quality_by sahtelenebiliyordu ve depo_yonetici, oluşturma sırasında quality_by/quality_note'u
-- önceden doldurabiliyordu.
drop policy if exists "receipts_insert_manager" on receipts;
create policy "receipts_insert_manager" on receipts for insert to authenticated
  with check (
    received_by = auth.uid()
    and status = 'taslak'
    and quality_by is null
    and quality_note is null
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici')
  );

drop policy if exists "receipts_update_manager_draft" on receipts;
create policy "receipts_update_manager_draft" on receipts for update to authenticated
  using (
    (status = 'taslak' and received_by = auth.uid()
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'))
    or
    (status = 'kalite_bekliyor'
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'kalite_ekibi'))
  )
  with check (
    (received_by = auth.uid() and status in ('taslak', 'kalite_bekliyor') and quality_by is null and quality_note is null
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'))
    or
    (status in ('kalite_bekliyor', 'onaylandi', 'reddedildi') and quality_by = auth.uid()
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'kalite_ekibi'))
  );

-- I1 (devamı): temel alanlar oluşturulduktan sonra hiçbir rol tarafından değiştirilemez.
-- RLS with check tek başına eski/yeni satırı karşılaştıramadığından bir trigger gerekir.
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
    or new.siparis_no is distinct from old.siparis_no
    or new.client_uuid is distinct from old.client_uuid
  then
    raise exception 'Bu alanlar oluşturulduktan sonra değiştirilemez: company_id, received_by, receipt_date, irsaliye_no, siparis_no, client_uuid';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_receipt_core_fields_trigger on receipts;
create trigger lock_receipt_core_fields_trigger
  before update on receipts
  for each row execute procedure public.lock_receipt_core_fields();

-- I4: updated_at hiçbir zaman güncellenmiyordu.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_receipts_updated_at on receipts;
create trigger set_receipts_updated_at
  before update on receipts
  for each row execute procedure public.set_updated_at();

-- I3: receipt_items'ta idempotency anahtarı yoktu; Plan 5'in çevrimdışı senkron kuyruğu aynı
-- receipt_id + line_no ile tekrar denendiğinde (receipts.client_uuid çakışması "zaten senkronize"
-- sayılıp items insert'i hiç yapılmadan dönüyordu) satırların sessizce kaybolmasına yol açıyordu.
alter table receipt_items add constraint receipt_items_receipt_line_unique unique (receipt_id, line_no);

-- I2 (final review round 2): kalite_ekibi sadece uygunluk/note değiştirebilir, diğer satır
-- alanlarını (miktar, ürün, lot no, SKT, sıra no) değiştiremez — bu alanlar depo_yonetici'nin
-- taslak aşamasında düzeltme yapabilmesi için kalite_ekibi DIŞINDAKİ roller için kilitli değildir.
create or replace function public.lock_receipt_item_fields_for_quality()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'kalite_ekibi') then
    if new.product_id is distinct from old.product_id
      or new.quantity is distinct from old.quantity
      or new.unit is distinct from old.unit
      or new.lot_no is distinct from old.lot_no
      or new.skt is distinct from old.skt
      or new.line_no is distinct from old.line_no
      or new.receipt_id is distinct from old.receipt_id
    then
      raise exception 'Kalite ekibi sadece uygunluk ve not alanlarını değiştirebilir';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_receipt_item_fields_for_quality_trigger on receipt_items;
create trigger lock_receipt_item_fields_for_quality_trigger
  before update on receipt_items
  for each row execute procedure public.lock_receipt_item_fields_for_quality();
