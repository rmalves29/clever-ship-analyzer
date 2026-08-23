-- WhatsApp outbound queue: durable, retryable and concurrency-safe.
create table if not exists public.whatsapp_message_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.whatsapp_campaigns(id) on delete cascade,
  customer_id uuid not null,
  phone text not null,
  template_name text not null,
  template_language text not null default 'pt_BR',
  body_params jsonb not null default '[]'::jsonb,
  media_url text,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','retry_wait')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  wa_message_id text,
  error text,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_message_queue_campaign_customer_uq
  on public.whatsapp_message_queue(campaign_id, customer_id);

create index if not exists whatsapp_message_queue_ready_idx
  on public.whatsapp_message_queue(status, next_attempt_at, created_at);

create index if not exists whatsapp_message_queue_campaign_idx
  on public.whatsapp_message_queue(campaign_id, status);

alter table public.whatsapp_message_queue enable row level security;

-- Claims a small batch atomically so multiple workers cannot send the same job.
create or replace function public.claim_whatsapp_message_queue(p_limit integer default 10, p_worker text default 'worker')
returns setof public.whatsapp_message_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.whatsapp_message_queue
    where (
      status = 'queued'
      or (status = 'retry_wait' and next_attempt_at <= now())
      or (status = 'sending' and locked_at < now() - interval '10 minutes')
    )
    and attempts < max_attempts
    order by next_attempt_at asc, created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 100))
  )
  update public.whatsapp_message_queue q
  set status = 'sending',
      attempts = q.attempts + 1,
      locked_at = now(),
      locked_by = p_worker,
      updated_at = now()
  from candidates c
  where q.id = c.id
  returning q.*;
end;
$$;

revoke all on function public.claim_whatsapp_message_queue(integer, text) from public, anon, authenticated;

grant execute on function public.claim_whatsapp_message_queue(integer, text) to service_role;
