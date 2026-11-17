-- Painel da afiliada: link privado (token) e posts que ela registra como comprovante de divulgação.
alter table crm.affiliates
  add column if not exists access_token text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
create unique index if not exists affiliates_access_token_key on crm.affiliates (access_token);

create table if not exists crm.affiliate_posts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references crm.affiliates (id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_posts_affiliate_idx on crm.affiliate_posts (affiliate_id, created_at desc);

alter table crm.affiliate_posts enable row level security;
revoke all on crm.affiliate_posts from anon, authenticated;
comment on column crm.affiliates.access_token is 'Token do link privado do painel da afiliada (/afiliada/<token>).';
