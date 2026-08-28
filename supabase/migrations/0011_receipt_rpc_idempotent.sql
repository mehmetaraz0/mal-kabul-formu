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
-- DÜZELTME TURU (final review bulgusu 1): İLK deneme (`on conflict (client_uuid) do update
-- set client_uuid = excluded.client_uuid returning id into v_receipt_id`) YANLIŞTI. Postgres,
-- `INSERT ... ON CONFLICT DO UPDATE`'te çakışan satıra karşı hedef tablonun UPDATE RLS
-- politikasının `USING` ifadesini de değerlendirir (WCO_RLS_CONFLICT_CHECK). Buradaki
-- `receipts_update_manager_draft` politikasının `USING`'i sadece `status = 'taslak' AND
-- received_by = auth.uid()` (depo_yonetici, kendi taslağı) veya `status = 'kalite_bekliyor'`
-- (kalite_ekibi) satırlarına izin verir. Kayıt ilk denemede "Kaydet ve Kalite Onayına Gönder"
-- ile kaydedilip zaten 'kalite_bekliyor'/'onaylandi'/'reddedildi'ye taşınmışsa, bir retry'ın
-- DO UPDATE'i bu USING kontrolünü geçemez ve `42501` (insufficient_privilege / RLS ihlali) ile
-- patlar — aynı "kayıt sonsuza kadar kuyrukta kilitli kalır" sorunu, sadece 23505 yerine 42501
-- olarak yeniden ortaya çıkar. `onaylandi`/`reddedildi` durumundaki bir kayıt için politika hiç
-- bir USING dalına girmediğinden orada da aynı şekilde patlar.
--
-- DOĞRU YAKLAŞIM: `on conflict (client_uuid) do NOTHING returning id into v_receipt_id`, sonra
-- `v_receipt_id is null` ise (çakışma oldu demek) mevcut satırın id'sini `select` ile oku ve
-- ERKEN DÖN — items insert'e ve submit-to-quality bloğuna HİÇ girme. `do nothing` hiçbir UPDATE
-- üretmediğinden hiçbir UPDATE RLS politikası hiç değerlendirilmez — RLS sorunu tamamen ortadan
-- kalkar. Bu aynı zamanda doğru: RPC gövdesi tek bir örtük transaction'dır, dolayısıyla
-- `client_uuid` çakışması = önceki çağrının (receipt + TÜM satırları + varsa submit-to-quality
-- durumu dahil) TAMAMEN commit olduğunun KANITIdır — aksi halde transaction geri alınır,
-- client_uuid hiçbir zaman kalıcı olarak var olmazdı. Yapılacak başka bir şey yok; aynı id'yi
-- döndürmek yeterli. Bu yaklaşım ayrıca `receipt_items_insert_manager` RLS politikasının
-- 'kalite_bekliyor' durumundaki bir receipt'e (retry'da) satır eklemeyi reddetme sorununu da
-- bir kerede ortadan kaldırır, çünkü items insert'e artık hiç girilmiyor.

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

  -- UYARI: bu insert'e asla bir `on conflict (client_uuid) do update ...` SET listesi eklenmesin
  -- (ör. "madem buradayız, diğer alanları da güncelleyelim" gibi bir gerekçeyle) — yukarıdaki
  -- açıklamada anlatılan RLS UPDATE-politikası sorununu geri getirir. `do nothing` + aşağıdaki
  -- erken-dönüş bilerek tercih edildi, bu insert bir UPDATE'e ASLA dönüşmemeli.
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
    -- Çakışma: bu client_uuid'li receipt daha önce (bu RPC'nin önceki bir çağrısında) zaten
    -- TAMAMEN oluşturulmuş — receipt + tüm satırlar + (varsa) kalite onayına gönderme dahil,
    -- çünkü tek transaction'da hepsi ya birlikte commit olur ya da hiçbiri kalıcı olmaz. Bu
    -- yüzden items insert'e ve p_submit_to_quality bloğuna HİÇ girmeden, var olan id'yi bulup
    -- aynen döndürüyoruz — idempotent davranış budur, "yapılacak iş yok".
    select id into v_receipt_id from receipts where client_uuid = p_client_uuid;
    return v_receipt_id;
  end if;

  -- Bu noktaya sadece v_receipt_id TAZE (bu çağrıda yeni insert edilmiş) bir satırsa gelinir —
  -- dolayısıyla bu receipt_id için receipt_items'ta önceden satır olması mümkün değil (yeni
  -- üretilmiş bir uuid). Bu yüzden burada bir `on conflict` gerekmiyor: çakışma ihtimali yok.
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
    update receipts set status = 'kalite_bekliyor' where id = v_receipt_id and status = 'taslak';
  end if;

  return v_receipt_id;
end;
$$;

-- Fonksiyon imzası (tip listesi) değişmediği için grant/revoke tekrar gerekmez (0008'dekiler
-- geçerliliğini korur) — yine de açıkça teyit için tekrar veriliyor, zararsız ve idempotent.
revoke execute on function create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean, text, boolean, numeric) from public;
grant execute on function create_receipt_with_items(bigint, date, text, text, uuid, text, jsonb, boolean, text, boolean, numeric) to authenticated;
