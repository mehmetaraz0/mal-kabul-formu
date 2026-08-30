-- 0016_marka_alani_ekle.sql
--
-- Ürün kararı: aynı ürün farklı teslimatlarda farklı markalarla (üretici markası, ör.
-- "Dardanel") gelebiliyor — bu bilgi firma (tedarikçi) bilgisinden ayrı ve şu ana kadar hiç
-- tutulmuyordu. İstatistik bölümünde ürün/firma bazında marka kırılımı gösterebilmek için
-- receipt_items'a ayrı bir `marka` sütunu ekleniyor (serbest metin, opsiyonel — Firma/Ürün
-- gibi ayrı bir yönetim tablosu/CRUD sayfası GEREKTİRMİYOR, lot_no/note ile aynı basitlikte).

alter table receipt_items add column if not exists marka text;

-- create_receipt_with_items: imza (parametre listesi) DEĞİŞMEDİ — sadece p_items içindeki
-- her öğeye bir alan daha eklendiği için `create or replace` yeterli (0013'teki gibi bir
-- DROP FUNCTION gerekmiyor, çünkü fonksiyonun kendi parametreleri aynı kalıyor).
create or replace function create_receipt_with_items(
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
    urun_sicakligi, yari_omur_gecti, marka
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
    coalesce((item->>'yariOmurGecti')::boolean, false),
    nullif(item->>'marka', '')
  from jsonb_array_elements(p_items) as item;

  if p_submit_to_quality then
    update receipts set status = 'onaylandi' where id = v_receipt_id and status = 'taslak';
  end if;

  return v_receipt_id;
end;
$$;
