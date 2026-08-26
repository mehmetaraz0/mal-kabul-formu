-- 0002_rls_policies.sql

alter table profiles enable row level security;
alter table companies enable row level security;
alter table products enable row level security;
alter table receipts enable row level security;
alter table receipt_items enable row level security;

-- profiles: herkes (authenticated) tüm profilleri okuyabilir (isim göstermek için), sadece kendi satırını güncelleyebilir
create policy "profiles_select_all" on profiles for select to authenticated using (true);
create policy "profiles_update_own" on profiles for update to authenticated using (id = auth.uid());

-- companies: authenticated herkes okuyabilir ve ekleyebilir; güncelleme/silme sadece depo_yonetici
create policy "companies_select_all" on companies for select to authenticated using (true);
create policy "companies_insert_all" on companies for insert to authenticated with check (true);
create policy "companies_update_manager" on companies for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'));
create policy "companies_delete_manager" on companies for delete to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'));

-- products: companies ile aynı kural
create policy "products_select_all" on products for select to authenticated using (true);
create policy "products_insert_all" on products for insert to authenticated with check (true);
create policy "products_update_manager" on products for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'));
create policy "products_delete_manager" on products for delete to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'));

-- receipts: herkes okuyabilir (kalite ekibi bekleyenleri görmeli)
create policy "receipts_select_all" on receipts for select to authenticated using (true);
-- depo_yonetici kendi adına yeni kayıt oluşturabilir
create policy "receipts_insert_manager" on receipts for insert to authenticated
  with check (
    received_by = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici')
  );
-- depo_yonetici taslak durumundaki kendi kaydını güncelleyebilir; kalite_ekibi kalite_bekliyor durumundaki her kaydı güncelleyebilir
create policy "receipts_update_manager_draft" on receipts for update to authenticated
  using (
    (status = 'taslak' and received_by = auth.uid()
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'depo_yonetici'))
    or
    (status = 'kalite_bekliyor'
      and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'kalite_ekibi'))
  );

-- receipt_items: receipts ile aynı erişim kuralına bağlı (join üzerinden)
create policy "receipt_items_select_all" on receipt_items for select to authenticated using (true);
create policy "receipt_items_insert_manager" on receipt_items for insert to authenticated
  with check (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid() and p.role = 'depo_yonetici'
    )
  );
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
  );
create policy "receipt_items_delete_draft" on receipt_items for delete to authenticated
  using (
    exists (
      select 1 from receipts r
      join profiles p on p.id = auth.uid()
      where r.id = receipt_id and r.status = 'taslak' and r.received_by = auth.uid() and p.role = 'depo_yonetici'
    )
  );
