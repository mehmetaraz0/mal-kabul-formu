-- 0001_init_schema.sql

create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'depo_yonetici' check (role in ('depo_yonetici', 'kalite_ekibi')),
  created_at timestamptz not null default now()
);

create table companies (
  id bigint generated always as identity primary key,
  sira_no int,
  name text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table products (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  unit text not null check (unit in ('kg', 'ad')),
  category text not null check (category in ('ET', 'BALIK')),
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  client_uuid text unique,
  company_id bigint not null references companies(id),
  receipt_date date not null default current_date,
  irsaliye_no text,
  siparis_no text,
  status text not null default 'taslak' check (status in ('taslak', 'kalite_bekliyor', 'onaylandi', 'reddedildi')),
  received_by uuid references profiles(id),
  quality_by uuid references profiles(id),
  quality_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  product_id bigint not null references products(id),
  line_no int not null,
  lot_no text,
  skt date,
  quantity numeric(10,2) not null,
  unit text not null check (unit in ('kg', 'ad')),
  uygunluk text not null default 'beklemede' check (uygunluk in ('uygun', 'uygun_degil', 'beklemede')),
  note text
);

create index idx_receipts_company on receipts(company_id);
create index idx_receipts_date on receipts(receipt_date);
create index idx_receipts_status on receipts(status);
create index idx_receipt_items_receipt on receipt_items(receipt_id);
create index idx_products_category on products(category);
