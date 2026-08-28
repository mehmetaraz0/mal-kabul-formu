-- 0010_receipt_items_product_index.sql
-- listReceipts'teki ürün filtresi ön-sorgusu (receipt_items.product_id'ye göre receipt_id
-- çekme) bu sütunda indeks olmadan seq-scan'e düşer. product_id üzerinde bir indeks ekleniyor.
create index if not exists idx_receipt_items_product on receipt_items(product_id);
