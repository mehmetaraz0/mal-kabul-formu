-- 0009_anon_rpc_yetkisini_kaldir.sql
-- 0007/0008'deki "revoke ... from public" anon'un doğrudan aldığı EXECUTE yetkisini
-- kaldırmıyordu (Supabase varsayılan olarak anon'a da doğrudan yetki veriyor; PUBLIC'ten
-- geri alma bunu etkilemez). Açıkça anon'dan da kaldırıyoruz.
revoke execute on function create_receipt_with_items(
  bigint, date, text, text, uuid, text, jsonb, boolean, text, boolean, numeric
) from anon;
