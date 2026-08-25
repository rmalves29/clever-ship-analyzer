create table if not exists public.whatsapp_suppressions (
  phone text primary key,
  marketing_opt_out boolean not null default true,
  opted_out_at timestamptz not null default now(),
  source text not null default 'manual',
  reason text null,
  updated_at timestamptz not null default now(),
  constraint whatsapp_suppressions_phone_e164 check (phone ~ '^\+[0-9]{8,15}$')
);

create index if not exists whatsapp_suppressions_marketing_opt_out_idx
  on public.whatsapp_suppressions (marketing_opt_out)
  where marketing_opt_out = true;

alter table public.whatsapp_suppressions enable row level security;

comment on table public.whatsapp_suppressions is
  'Bloqueio central de mensagens de marketing do WhatsApp. Utilidades transacionais continuam permitidas.';
