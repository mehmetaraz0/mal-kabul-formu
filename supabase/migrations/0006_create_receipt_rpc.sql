-- 0006_create_receipt_rpc.sql

-- Task 1 review bulgusu: createReceiptWithItems iki ayrı ağ çağrısıyla (receipts insert,
-- ardından receipt_items insert) çalışıyordu. İkinci insert başarısız olursa (kötü product_id,
-- RLS reddi, vb.) birinci insert geri alınmıyor ve boş bir "taslak" receipt veritabanında
-- öksüz kalıyor, kullanıcıya da hatalı biçimde "kayıt başarısız" gösteriliyordu.
--
-- Çözüm: her iki insert'i tek bir PL/pgSQL fonksiyonu içine alıyoruz. Fonksiyon gövdesi tek bir
-- örtük transaction olarak çalışır; receipt_items insert'i herhangi bir nedenle başarısız olursa
-- Postgres receipts insert'ini de otomatik olarak geri alır.
--
-- `security invoker` (varsayılan olsa da açıkça belirtildi): fonksiyon ÇAĞIRAN kullanıcının
-- yetkileriyle çalışır, dolayısıyla Plan 1'in receipts_insert_manager / receipt_items_insert_manager
-- RLS politikaları öncekiyle birebir aynı şekilde uygulanmaya devam eder. Bu sadece atomiklik
-- sağlar, yetki yükseltmesi (privilege escalation) yapmaz.
create or replace function create_receipt_with_items(
  p_company_id bigint,
  p_receipt_date date,
  p_irsaliye_no text,
  p_siparis_no text,
  p_received_by uuid,
  p_client_uuid text,
  p_items jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_receipt_id uuid;
begin
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

  return v_receipt_id;
end;
$$;
