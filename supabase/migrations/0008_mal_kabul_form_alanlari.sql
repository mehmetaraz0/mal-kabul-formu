-- 0008_mal_kabul_form_alanlari.sql
--
-- Gerçek "MAL KABUL FORMU" belgesinde (Doküman No: F.22) olup şemada karşılığı olmayan
-- alanlar: Fatura No, Araç Hijyeni/Sıcaklığı (sevkiyat başına), Ürün Sıcaklığı ve
-- Yarı Ömrünü Geçmiş mi (satır başına).
alter table receipts add column fatura_no text;
alter table receipts add column arac_hijyen_uygun boolean;
alter table receipts add column arac_sicaklik numeric(5,2);

alter table receipt_items add column urun_sicakligi numeric(5,2);
alter table receipt_items add column yari_omur_gecti boolean not null default false;

-- ÖNEMLİ: 0007'deki 8 parametreli create_receipt_with_items'a 3 yeni parametre eklendiği için
-- (Task 1/4'te öğrenilen ders) eski imzayı önce açıkça düşürüyoruz, yoksa "function is not unique" hatası alınır.
drop function if exists create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean);

create or replace function create_receipt_with_items(
  p_company_id bigint,
  p_receipt_date date,
  p_irsaliye_no text,
  p_siparis_no text,
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

  insert into receipts (
    client_uuid, company_id, receipt_date, irsaliye_no, siparis_no, received_by, status,
    fatura_no, arac_hijyen_uygun, arac_sicaklik
  )
  values (
    p_client_uuid, p_company_id, p_receipt_date, p_irsaliye_no, p_siparis_no, p_received_by, 'taslak',
    p_fatura_no, p_arac_hijyen_uygun, p_arac_sicaklik
  )
  returning id into v_receipt_id;

  insert into receipt_items (
    receipt_id, product_id, line_no, lot_no, skt, quantity, unit, uygunluk,
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
    'beklemede',
    nullif(item->>'urunSicakligi', '')::numeric,
    coalesce((item->>'yariOmurGecti')::boolean, false)
  from jsonb_array_elements(p_items) as item;

  if p_submit_to_quality then
    update receipts set status = 'kalite_bekliyor' where id = v_receipt_id;
  end if;

  return v_receipt_id;
end;
$$;

revoke execute on function create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean, text, boolean, numeric) from public;
grant execute on function create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean, text, boolean, numeric) to authenticated;

-- Ek sağlamlaştırma (bu görevin brief'inde açıkça istenmedi, ama 0004'teki "temel alanlar
-- oluşturulduktan sonra değiştirilemez" ilkesiyle tutarlılık için gerekli — aksi halde yeni
-- sütunlar sessizce bu korumanın dışında kalırdı):
--
-- 1) receipts.fatura_no / arac_hijyen_uygun / arac_sicaklik, depo_yonetici'nin kabul anında girdiği
--    ölçüm/gözlemlerdir (receipt_items.urun_sicakligi/yari_omur_gecti ile aynı kategoride — bkz.
--    aşağıdaki (2) numaralı not). Tehdit modeli tam olarak (2) ile aynıdır: kalite_ekibi kendi
--    'kalite_bekliyor' güncellemesi sırasında (örn. doğrudan PostgREST çağrısıyla) bu alanları
--    sessizce değiştirebilir; ORİJİNAL sütunlar (company_id, received_by, receipt_date, irsaliye_no,
--    siparis_no, client_uuid) ise farklı, daha geniş bir değişmezlik kuralını korur (depo_yonetici da
--    dahil HİÇBİR rol oluşturulduktan sonra bunları değiştiremez — bu 0004'ten beri var ve bu
--    görevin kapsamı dışında, dokunulmuyor). Bu yüzden 3 yeni sütun sadece kalite_ekibi için
--    kilitleniyor — (2)'deki rol kontrolüyle birebir aynı desen — depo_yonetici, kendi taslağı hâlâ
--    'taslak' durumundayken bu 3 alanı düzeltebilir (bugün bunu yapan bir UI yok, ama ileride bir
--    "taslağı düzenle" özelliği eklendiğinde depo_yonetici'yi kendi henüz teslim etmediği kaydında
--    gereksiz yere engellememek için).
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

  if exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'kalite_ekibi') then
    if new.fatura_no is distinct from old.fatura_no
      or new.arac_hijyen_uygun is distinct from old.arac_hijyen_uygun
      or new.arac_sicaklik is distinct from old.arac_sicaklik
    then
      raise exception 'Kalite ekibi fatura no / araç hijyeni / araç sıcaklığı alanlarını değiştiremez';
    end if;
  end if;

  return new;
end;
$$;

-- 2) receipt_items.urun_sicakligi / yari_omur_gecti, lot_no/skt/quantity ile aynı kategoridedir
--    (depo_yonetici'nin kabul anında girdiği ölçüm/gözlem). lock_receipt_item_fields_for_quality
--    bunları kapsamazsa kalite_ekibi, satırı değerlendirirken bu kabul-anı kayıtlarını da
--    (istemeden ya da kasıtlı) değiştirebilirdi; oysa amaçları sadece uygunluk/not girmektir.
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
      or new.urun_sicakligi is distinct from old.urun_sicakligi
      or new.yari_omur_gecti is distinct from old.yari_omur_gecti
    then
      raise exception 'Kalite ekibi sadece uygunluk ve not alanlarını değiştirebilir';
    end if;
  end if;
  return new;
end;
$$;
