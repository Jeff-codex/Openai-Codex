-- 원고 검수/스코어링 엔진 스키마 (규칙엔진 전용)
-- 적용 순서: 003_init_d1_schema.sql 이후

pragma foreign_keys = on;

create table if not exists review_documents (
  id text primary key,
  owner_type text not null,
  owner_key text not null,
  file_key text not null,
  file_name text not null,
  file_mime text not null default 'application/octet-stream',
  file_size integer not null default 0,
  source_text_hash text not null,
  created_at text not null default (datetime('now')),
  last_run_at text,
  expires_at text not null,
  status text not null default 'active'
);

create table if not exists review_runs (
  id text primary key,
  review_document_id text not null,
  run_no integer not null,
  review_mode text not null default 'first',
  approval_score integer not null default 0,
  risk_score integer not null default 0,
  readability_score integer not null default 0,
  branding_score integer not null default 0,
  risk_breakdown_json text not null default '{}',
  highlights_json text not null default '[]',
  summary text not null default '',
  created_at text not null default (datetime('now')),
  foreign key(review_document_id) references review_documents(id) on delete cascade
);

create index if not exists idx_review_documents_owner on review_documents(owner_key);
create index if not exists idx_review_documents_expires_at on review_documents(expires_at);
create unique index if not exists idx_review_runs_doc_run on review_runs(review_document_id, run_no);
create index if not exists idx_review_runs_doc_id on review_runs(review_document_id);
create index if not exists idx_review_runs_created_at on review_runs(created_at);
