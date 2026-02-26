-- 주문 결제 전환 스키마 (포인트 충전제 대체)
-- 적용 순서: 003_init_d1_schema.sql, 004_review_engine_schema.sql 이후

pragma foreign_keys = on;

-- orders 확장 컬럼 (최초 1회 적용)
alter table orders add column order_number text;
alter table orders add column ordered_at text;
alter table orders add column payment_status text not null default 'unpaid';
alter table orders add column payment_total_amount integer not null default 0;
alter table orders add column payment_vat_amount integer not null default 0;
alter table orders add column payment_supply_amount integer not null default 0;

create unique index if not exists idx_orders_order_number on orders(order_number);
create index if not exists idx_orders_ordered_at on orders(ordered_at);
create index if not exists idx_orders_payment_status on orders(payment_status);

create table if not exists order_payment_intents (
  id text primary key,
  intent_id text not null unique,
  member_id text not null,
  member_login_id text not null,
  media_id text not null,
  media_name text not null,
  unit_price integer not null,
  vat_amount integer not null,
  total_amount integer not null,
  draft_title text not null,
  draft_note text,
  draft_file_key text,
  draft_file_name text,
  draft_file_mime text,
  draft_file_size integer not null default 0,
  status text not null default 'ready',
  payment_method text,
  toss_payment_key text unique,
  toss_order_id text not null unique,
  toss_method text,
  toss_raw text,
  failure_code text,
  failure_message text,
  order_id text,
  expires_at text not null,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  foreign key(member_id) references members(id) on delete cascade,
  foreign key(order_id) references orders(id) on delete set null
);

create index if not exists idx_order_payment_intents_member_id on order_payment_intents(member_id);
create index if not exists idx_order_payment_intents_status on order_payment_intents(status);
create index if not exists idx_order_payment_intents_created_at on order_payment_intents(created_at);
create index if not exists idx_order_payment_intents_expires_at on order_payment_intents(expires_at);

create table if not exists order_payments (
  id text primary key,
  order_id text not null unique,
  member_id text not null,
  amount_supply integer not null,
  amount_vat integer not null,
  amount_total integer not null,
  payment_provider text not null default 'toss',
  payment_key text not null unique,
  order_id_pg text not null unique,
  method text,
  status text not null default 'paid',
  paid_at text not null,
  raw_payload text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  foreign key(order_id) references orders(id) on delete cascade,
  foreign key(member_id) references members(id) on delete cascade
);

create index if not exists idx_order_payments_member_id on order_payments(member_id);
create index if not exists idx_order_payments_status on order_payments(status);
create index if not exists idx_order_payments_paid_at on order_payments(paid_at);

create table if not exists payment_refunds (
  id text primary key,
  refund_id text not null unique,
  order_id text not null,
  payment_id text not null,
  refund_amount integer not null,
  status text not null default 'requested',
  reason text,
  requested_by text,
  approved_at text,
  toss_refund_key text,
  failure_code text,
  failure_message text,
  raw_payload text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  foreign key(order_id) references orders(id) on delete cascade,
  foreign key(payment_id) references order_payments(id) on delete cascade
);

create index if not exists idx_payment_refunds_order_id on payment_refunds(order_id);
create index if not exists idx_payment_refunds_payment_id on payment_refunds(payment_id);
create index if not exists idx_payment_refunds_status on payment_refunds(status);
create index if not exists idx_payment_refunds_created_at on payment_refunds(created_at);

create table if not exists order_number_sequences (
  date_key text primary key,
  last_value integer not null default 0,
  updated_at text not null default (datetime('now'))
);
