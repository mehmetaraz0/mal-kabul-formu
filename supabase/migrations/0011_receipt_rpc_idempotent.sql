-- 0011_receipt_rpc_idempotent.sql
--
-- Plan 5 (PWA Offline) Task 3: create_receipt_with_items şu ana kadar client_uuid üzerinde
-- gerçek bir idempotency sağlamıyordu. Senaryo: çevrimdışı kuyruk bir kaydı senkronize eder,
-- sunucu tarafında insert BAŞARILI olur ama yanıt istemciye ulaşmadan bağlantı kopar (mobil ağ,
-- depo içi zayıf sinyal). İstemci "başarısız" sanıp kaydı kuyrukta tutar ve bir sonraki
-- `online` event'inde AYNI client_uuid ile tekrar dener. `receipts.client_uuid` `unique`
-- olduğu için bu ikinci insert 23505 (unique_violation) ile patlar, RPC'nin PL/pgSQL gövdesi
-- örtük transaction olduğundan TÜM fonksiyon (satırlar dahil) geri alınır ve hata istemciye
-- fırlatılır — istemci bunu yine ağ/uygulama hatası sanıp kaydı kuyrukta bırakır. Sonuç: bu
-- kayıt asla senkronize olamaz, sonsuza kadar kuyrukta "başarısız" kalır. Bu, offline kuyruğun
-- tüm amacını (bağlantı gelince otomatik ve GÜVENİLİR senkron) geçersiz kılan ciddi bir hata.
--
-- Çözüm: hem receipts hem receipt_items insert'lerine `on conflict` ekleyerek RPC'yi gerçekten
-- idempotent hale getiriyoruz. Parametre listesi (tip ve sıra) 0008'dekiyle birebir aynı
-- kaldığından `create or replace` yeterli — yeni bir overload oluşmaz, eski imzayı düşürmeye
-- gerek yok (0007/0008'in aksine, orada parametre sayısı değişiyordu).

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

  -- `on conflict (client_uuid) do update set client_uuid = excluded.client_uuid`: kasıtlı bir
  -- no-op güncelleme. Amacımız satırı değiştirmek değil, `returning ... into` ile VAR OLAN
  -- satırın id'sini almak (plain `on conflict do nothing` RETURNING'de hiçbir şey döndürmez,
  -- bu yüzden do nothing kullanamıyoruz). client_uuid zaten aynı değere eşitlendiği için
  -- `lock_receipt_core_fields` trigger'ındaki `new.client_uuid is distinct from old.client_uuid`
  -- kontrolü false'a değerlendirilir ve trigger istisna fırlatmaz — diğer tüm alanlar (company_id,
  -- received_by, receipt_date, irsaliye_no, siparis_no) bu UPDATE'te hiç SET edilmediğinden
  -- (eski değerlerini korurlar) o kontroller de tetiklenmez. `set_receipts_updated_at` trigger'ı
  -- yine de çalışıp updated_at'i günceller — bu zararsızdır (sadece "son denendiği zaman"ı yansıtır).
  insert into receipts (
    client_uuid, company_id, receipt_date, irsaliye_no, siparis_no, received_by, status,
    fatura_no, arac_hijyen_uygun, arac_sicaklik
  )
  values (
    p_client_uuid, p_company_id, p_receipt_date, p_irsaliye_no, p_siparis_no, p_received_by, 'taslak',
    p_fatura_no, p_arac_hijyen_uygun, p_arac_sicaklik
  )
  on conflict (client_uuid) do update set client_uuid = excluded.client_uuid
  returning id into v_receipt_id;

  -- `on conflict (receipt_id, line_no) do nothing` (kısıt zaten 0004'te bu senaryo için
  -- eklenmişti: receipt_items_receipt_line_unique). BİLEREK `do update` DEĞİL `do nothing`:
  -- bir retry, kalite ekibinin bu satır için o ana kadar girmiş olabileceği uygunluk/note
  -- değerini asla ezmemeli. Ayrıca `do nothing` bir UPDATE üretmediğinden
  -- `lock_receipt_item_fields_for_quality_trigger` (before UPDATE) hiç tetiklenmez — dolayısıyla
  -- kalite_ekibi rolündeki birinin retry SIRASINDA bu satırı işaretlemiş olması ile bir yarış
  -- durumu oluşmaz; retry satırı sessizce atlar, kalite_ekibi'nin girdiği değer olduğu gibi kalır.
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
  from jsonb_array_elements(p_items) as item
  on conflict (receipt_id, line_no) do nothing;

  -- `and status = 'taslak'`: retry sırasında kayıt zaten kalite_bekliyor/onaylandı/reddedildi
  -- olmuşsa (ör. ilk deneme zaten submit etmişti, ya da kalite ekibi bu arada işlem yapmıştı)
  -- bu UPDATE 0 satır etkiler ve status'u GERİ ALMAZ. WHERE eşleşmediğinde PostgREST/RPC
  -- tarafında `error: null` döner (bu, receipts.js'teki diğer fonksiyonların neden `.select()`
  -- ile satır sayısını ayrıca doğruladığının aynı nedeni — burada risk yok çünkü zaten "hiçbir
  -- şey yapma" istediğimiz durum budur, hata değil).
  if p_submit_to_quality then
    update receipts set status = 'kalite_bekliyor' where id = v_receipt_id and status = 'taslak';
  end if;

  return v_receipt_id;
end;
$$;

-- Fonksiyon imzası (tip listesi) değişmediği için grant/revoke tekrar gerekmez (0008'dekiler
-- geçerliliğini korur) — yine de açıkça teyit için tekrar veriliyor, zararsız ve idempotent.
revoke execute on function create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean, text, boolean, numeric) from public;
grant execute on function create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean, text, boolean, numeric) to authenticated;
