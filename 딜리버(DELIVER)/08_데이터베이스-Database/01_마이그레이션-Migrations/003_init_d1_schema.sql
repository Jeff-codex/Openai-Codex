-- 딜리버 Cloudflare D1(SQLite) 초기 스키마
-- 적용 대상: D1 database (dliver-prod-db)

pragma foreign_keys = on;

create table if not exists members (
  id text primary key,
  login_id text not null unique,
  name text not null,
  email text not null unique,
  company text,
  password text not null,
  point_balance integer not null default 0,
  role text not null default 'member',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists media_channels (
  id text primary key,
  name text not null unique,
  category text not null,
  byline_type text,
  unit_price integer not null default 0,
  member_price_label text not null default '회원전용',
  channel text,
  description text,
  is_active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists orders (
  id text primary key,
  member_id text not null,
  member_login_id text,
  member_name text,
  email text,
  title text not null,
  media_id text,
  media_name text,
  budget integer not null default 0,
  status text not null default 'received',
  request_note text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  foreign key(member_id) references members(id) on delete cascade
);

create table if not exists order_status_logs (
  id integer primary key autoincrement,
  order_id text not null,
  from_status text,
  to_status text not null,
  changed_by text,
  note text,
  changed_at text not null default (datetime('now')),
  foreign key(order_id) references orders(id) on delete cascade,
  foreign key(changed_by) references members(id) on delete set null
);

create table if not exists admin_logs (
  id integer primary key autoincrement,
  message text not null,
  created_at text not null default (datetime('now'))
);

create table if not exists security_audit_logs (
  id integer primary key autoincrement,
  event_type text not null,
  actor_type text not null default 'system',
  actor_id text,
  ip text,
  outcome text not null,
  detail text,
  created_at text not null default (datetime('now'))
);

create table if not exists point_charge_payments (
  id text primary key,
  order_id text not null unique,
  member_id text not null,
  member_login_id text not null,
  amount integer not null,
  note text,
  status text not null default 'ready',
  payment_key text unique,
  method text,
  confirmed_at text,
  credited_at text,
  failure_code text,
  failure_message text,
  toss_raw text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  foreign key(member_id) references members(id) on delete cascade
);

create index if not exists idx_members_login_id on members(login_id);
create index if not exists idx_members_email on members(email);
create index if not exists idx_media_channels_active on media_channels(is_active);
create index if not exists idx_orders_member_id on orders(member_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created_at on orders(created_at);
create index if not exists idx_order_logs_order_id on order_status_logs(order_id);
create index if not exists idx_security_audit_created_at on security_audit_logs(created_at);
create index if not exists idx_point_charge_payments_member_id on point_charge_payments(member_id);
create index if not exists idx_point_charge_payments_status on point_charge_payments(status);
create index if not exists idx_point_charge_payments_created_at on point_charge_payments(created_at);
create index if not exists idx_point_charge_payments_payment_key on point_charge_payments(payment_key);

create trigger if not exists trg_point_charge_confirmed_credit
after update of status on point_charge_payments
for each row
when new.status = 'confirmed' and old.status != 'confirmed' and new.credited_at is null
begin
  update members
  set point_balance = point_balance + new.amount,
      updated_at = coalesce(new.confirmed_at, new.updated_at, datetime('now'))
  where id = new.member_id;
  update point_charge_payments
  set credited_at = coalesce(new.confirmed_at, new.updated_at, datetime('now'))
  where order_id = new.order_id;
end;

insert or ignore into members (
  id,
  login_id,
  name,
  email,
  company,
  password,
  point_balance,
  role
) values (
  'admin_fixed_account',
  'admin',
  '관리자',
  'admin@dliver.local',
  'DLIVER',
  'admin1234',
  0,
  'admin'
);

insert or ignore into members (
  id,
  login_id,
  name,
  email,
  company,
  password,
  point_balance,
  role
) values (
  'member_temp_test',
  'test',
  '테스트계정',
  'test@deliver.local',
  '임시계정',
  '1234',
  0,
  'member'
);
