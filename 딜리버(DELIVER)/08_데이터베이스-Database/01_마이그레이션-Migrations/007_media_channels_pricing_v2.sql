-- media_channels 가격구조 V2
-- 목표:
-- 1) 공급가/판매가 분리
-- 2) 동일 매체명 카테고리별 허용(UNIQUE(name, category))
-- 3) 기존 unit_price/member_price_label 호환 유지

pragma foreign_keys = off;

create table if not exists media_channels_v2 (
  id text primary key,
  name text not null,
  category text not null,
  category_detail text not null default '',
  byline_type text,
  supply_price integer not null default 0,
  sale_price integer not null default 0,
  unit_price integer not null default 0,
  member_price_label text not null default '회원전용',
  channel text,
  description text,
  is_active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique(name, category)
);

insert into media_channels_v2 (
  id,
  name,
  category,
  category_detail,
  byline_type,
  supply_price,
  sale_price,
  unit_price,
  member_price_label,
  channel,
  description,
  is_active,
  created_at,
  updated_at
)
select
  id,
  name,
  category,
  '',
  byline_type,
  coalesce(unit_price, 0),
  coalesce(unit_price, 0),
  coalesce(unit_price, 0),
  coalesce(nullif(member_price_label, ''), '회원전용'),
  channel,
  description,
  coalesce(is_active, 1),
  coalesce(created_at, datetime('now')),
  coalesce(updated_at, datetime('now'))
from media_channels;

drop table media_channels;
alter table media_channels_v2 rename to media_channels;

create index if not exists idx_media_channels_active on media_channels(is_active);
create index if not exists idx_media_channels_category on media_channels(category);
create index if not exists idx_media_channels_sale_price on media_channels(sale_price);

pragma foreign_keys = on;
