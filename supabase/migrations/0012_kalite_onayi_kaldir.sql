-- 0012_kalite_onayi_kaldir.sql
--
-- Ürün kararı: Kalite Onayı ayrı bir adım/rol olarak kaldırıldı — kaydı yapan kişi
-- ürünleri eklerken uygunluk (uygun/uygun_degil) ve notu AYNI FORMDA, aynı anda girer.
-- "Kaydet" artık doğrudan 'onaylandi' durumuna geçer (ara 'kalite_bekliyor' basamağı
-- kalkar). Var olan "tüm satırlar işaretlenmeden onaylanamaz" veritabanı kontrolü
-- (0007'deki check_receipt_approval trigger'ı) AYNEN KORUNUYOR — bu kontrol zaten tam
-- olarak istenen "kayıt kontrolü" güvencesini sağlıyor, sadece kim işaretlediği değişti.
--
-- profiles.role sütunu ve CHECK kısıtı DOKUNULMADAN bırakılıyor (geriye dönük uyumluluk,
-- mevcut satırlar bozulmasın diye) — ama aşağıdaki politikalar artık role='depo_yonetici'
-- / role='kalite_ekibi' kontrolü YAPMIYOR, sadece received_by = auth.uid() (sahiplik).

-- ÖNEMLİ (Task 1 review'da bulundu): status'a 'onaylandi' da izin vermek "ileride biri
-- doğrudan onaylandi insert eder" diye eklenmişti ama BU GERÇEK BİR AÇIK: RPC dışında
-- (ör. doğrudan PostgREST çağrısı) status='onaylandi' ile SIFIR ürünlü bir insert yapılabilir,
-- çünkü check_receipt_approval (0007) tetikleyicisi sadece `before update`'te çalışır, INSERT'te
-- HİÇ tetiklenmez. RPC zaten HER ZAMAN önce 'taslak' insert edip ardından aynı transaction
-- içinde UPDATE ile 'onaylandi'ya taşıyor (bu UPDATE, tetikleyiciyi doğru şekilde çalıştırır) —
-- yani insert politikasının 'onaylandi'ya hiç izin vermesi gerekmiyordu. Sadece 'taslak'.
drop policy if exists "receipts_insert_manager" on receipts;
create policy "receipts_insert_manager" on receipts for insert to authenticated
  with check (
    received_by = auth.uid()
    and status = 'taslak'
    and quality_by is null
    and quality_note is null
  );

-- receipts_update_manager_draft: sahibi SADECE kendi TASLAK kaydını 'onaylandi'ya
-- taşıyabilir. USING'e `status = 'taslak'` şartı EKLENDİ (final review bulgusu) —
-- bu olmadan sahibi kendi ONAYLANMIŞ kaydını status='taslak'a geri çekip (bu geçiş
-- check_receipt_approval'ı tetiklemez, çünkü new.status <> 'onaylandi') satırlarını
-- yeniden düzenleyip tekrar onaylayabiliyordu — onaylanmış bir kayıt artık DEĞİŞMEZ
-- olmalı.
drop policy if exists "receipts_update_manager_draft" on receipts;
create policy "receipts_update_manager_draft" on receipts for update to authenticated
  using (received_by = auth.uid() and status = 'taslak')
  with check (
    received_by = auth.uid()
    and status in ('taslak', 'onaylandi')
    and quality_by is null
    and quality_note is null
  );

-- receipt_items_insert_manager: sabit 'uygunluk = beklemede' şartı kaldırıldı — istemci
-- artık uygunluk'u formda doğrudan seçip gönderebiliyor (uygun/uygun_degil/beklemede
-- hepsi geçerli, receipt_items.uygunluk sütunundaki CHECK kısıtı zaten bunu sınırlıyor).
drop policy if exists "receipt_items_insert_manager" on receipt_items;
create policy "receipt_items_insert_manager" on receipt_items for insert to authenticated
  with check (
    exists (
      select 1 from receipts r
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
    )
  );

-- receipt_items_update_flow: kalite_ekibi dalı kaldırıldı; sahibi kendi TASLAK
-- kaydındaki satırları (uygunluk dahil) düzenleyebilir. Kayıt 'onaylandi' olduktan
-- sonra (bu politika status='taslak' şartı yüzünden) hiçbir satır güncellenemez.
drop policy if exists "receipt_items_update_flow" on receipt_items;
create policy "receipt_items_update_flow" on receipt_items for update to authenticated
  using (
    exists (
      select 1 from receipts r
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from receipts r
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
    )
  );

-- lock_receipt_core_fields: kalite_ekibi'ye özel fatura/araç kilidi artık anlamsız
-- (o rol artık bu alanları hiç güncellemiyor) — kaldırıldı, sadece temel-alan kilidi kalıyor.
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

-- lock_receipt_item_fields_for_quality: sadece kalite_ekibi'ni kısıtlıyordu, o rol
-- artık bu satırları hiç güncellemiyor (receipt_items_update_flow zaten sadece
-- status='taslak' + sahip için güncellemeye izin veriyor) — trigger'ı ve fonksiyonu
-- kaldırıyoruz, "quality" adlı bir trigger'ın ne işe yaradığını gelecekte biri
-- arayıp bulamayınca şaşırmasın diye bırakmak yerine temizliyoruz.
drop trigger if exists lock_receipt_item_fields_for_quality_trigger on receipt_items;
drop function if exists public.lock_receipt_item_fields_for_quality();

-- RPC: p_submit_to_quality artık 'kalite_bekliyor' değil DOĞRUDAN 'onaylandi'ya taşıyor;
-- satırlar sabit 'beklemede' yerine istemcinin gönderdiği uygunluk/not değerleriyle
-- ekleniyor. İmza (parametre listesi) DEĞİŞMEDİ — create or replace yeterli.
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

  -- UYARI: bu insert'e asla bir `on conflict (client_uuid) do update ...` SET listesi
  -- eklenmesin — RLS UPDATE-politikası sorununu geri getirir (bkz. 0011). `do nothing`
  -- + aşağıdaki erken-dönüş bilerek tercih edildi.
  insert into receipts (
    client_uuid, company_id, receipt_date, irsaliye_no, siparis_no, received_by, status,
    fatura_no, arac_hijyen_uygun, arac_sicaklik
  )
  values (
    p_client_uuid, p_company_id, p_receipt_date, p_irsaliye_no, p_siparis_no, p_received_by, 'taslak',
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

-- Final review bulgusu 2: 0002'den kalan bu 5 politika hâlâ role='depo_yonetici'
-- kontrolü yapıyordu — tek-rol modeline geçişte unutulmuşlardı. Artık herhangi bir
-- authenticated kullanıcı firma/ürün düzenleyebilir/silebilir ve kendi taslak
-- kaydındaki satırları silebilir (receipts/receipt_items ile aynı tutarlı model).
drop policy if exists "companies_update_manager" on companies;
create policy "companies_update_manager" on companies for update to authenticated using (true);
drop policy if exists "companies_delete_manager" on companies;
create policy "companies_delete_manager" on companies for delete to authenticated using (true);

drop policy if exists "products_update_manager" on products;
create policy "products_update_manager" on products for update to authenticated using (true);
drop policy if exists "products_delete_manager" on products;
create policy "products_delete_manager" on products for delete to authenticated using (true);

drop policy if exists "receipt_items_delete_draft" on receipt_items;
create policy "receipt_items_delete_draft" on receipt_items for delete to authenticated
  using (
    exists (
      select 1 from receipts r
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid()
    )
  );
