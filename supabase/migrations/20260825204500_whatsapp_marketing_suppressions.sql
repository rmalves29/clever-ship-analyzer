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

grant all on public.whatsapp_suppressions to service_role;
alter table public.whatsapp_suppressions enable row level security;

comment on table public.whatsapp_suppressions is
  'Bloqueio central de mensagens de marketing do WhatsApp. Utilidades transacionais continuam permitidas.';

-- Impede que um novo job de MARKETING entre em estado enviável se o telefone já pediu opt-out.
create or replace function public.guard_whatsapp_marketing_suppression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('queued', 'retry_wait')
    and new.campaign_id is not null
    and exists (
      select 1
      from public.whatsapp_suppressions s
      join public.whatsapp_campaigns c on c.id = new.campaign_id
      where s.phone = new.phone
        and s.marketing_opt_out = true
        and c.message_type = 'marketing'
    )
  then
    new.status := 'skipped';
    new.error := 'opt-out de marketing';
    new.next_attempt_at := null;
    new.locked_by := null;
    new.locked_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_queue_marketing_suppression_guard on public.whatsapp_message_queue;
create trigger whatsapp_queue_marketing_suppression_guard
  before insert or update of status, next_attempt_at on public.whatsapp_message_queue
  for each row execute function public.guard_whatsapp_marketing_suppression();

-- Se o opt-out chega depois de a mensagem ter sido enfileirada, cancela imediatamente os jobs
-- ainda não enviados. Isso cobre queued e retry_wait sem tocar em mensagens transacionais (utility).
create or replace function public.apply_whatsapp_marketing_suppression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.marketing_opt_out = true then
    update public.whatsapp_message_queue q
    set status = 'skipped',
        error = 'opt-out de marketing',
        next_attempt_at = null,
        locked_by = null,
        locked_at = null,
        updated_at = now()
    where q.phone = new.phone
      and q.status in ('queued', 'retry_wait')
      and exists (
        select 1
        from public.whatsapp_campaigns c
        where c.id = q.campaign_id
          and c.message_type = 'marketing'
      );
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_suppressions_apply_to_queue on public.whatsapp_suppressions;
create trigger whatsapp_suppressions_apply_to_queue
  after insert or update of marketing_opt_out on public.whatsapp_suppressions
  for each row execute function public.apply_whatsapp_marketing_suppression();

-- Runs de automação que tiveram o job suprimido não podem ficar presos em waiting_send.
create or replace function public.close_automation_run_for_suppressed_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'skipped'
    and new.error = 'opt-out de marketing'
    and new.campaign_id is not null
    and new.customer_id is not null
  then
    update public.whatsapp_automation_runs r
    set status = 'failed',
        last_error = 'opt-out de marketing',
        next_run_at = null,
        updated_at = now()
    where r.campaign_id = new.campaign_id
      and r.customer_id = new.customer_id
      and r.status in ('waiting_send', 'pending_approval', 'active');
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_queue_close_suppressed_automation on public.whatsapp_message_queue;
create trigger whatsapp_queue_close_suppressed_automation
  after insert or update of status on public.whatsapp_message_queue
  for each row execute function public.close_automation_run_for_suppressed_job();

-- Defesa final no claim: mesmo em corrida entre opt-out e worker, marketing suprimido nunca é claimado.
create or replace function public.claim_whatsapp_message_queue(p_limit integer, p_worker text)
returns setof public.whatsapp_message_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.whatsapp_message_queue q
  set status = 'skipped',
      error = 'opt-out de marketing',
      next_attempt_at = null,
      locked_by = null,
      locked_at = null,
      updated_at = now()
  where q.status in ('queued', 'retry_wait')
    and exists (
      select 1
      from public.whatsapp_suppressions s
      join public.whatsapp_campaigns c on c.id = q.campaign_id
      where s.phone = q.phone
        and s.marketing_opt_out = true
        and c.message_type = 'marketing'
    );

  return query
  with picked as (
    select q.id
    from public.whatsapp_message_queue q
    where q.status in ('queued', 'retry_wait')
      and q.scheduled_at <= now()
      and (q.next_attempt_at is null or q.next_attempt_at <= now())
      and not exists (
        select 1
        from public.whatsapp_suppressions s
        join public.whatsapp_campaigns c on c.id = q.campaign_id
        where s.phone = q.phone
          and s.marketing_opt_out = true
          and c.message_type = 'marketing'
      )
    order by q.priority asc, q.next_attempt_at asc nulls first, q.created_at asc
    limit greatest(coalesce(p_limit, 20), 0)
    for update skip locked
  )
  update public.whatsapp_message_queue t
  set status = 'sending',
      attempts = t.attempts + 1,
      locked_by = p_worker,
      locked_at = now(),
      updated_at = now()
  from picked
  where t.id = picked.id
  returning t.*;
end;
$$;

revoke all on function public.claim_whatsapp_message_queue(integer, text) from public;
grant execute on function public.claim_whatsapp_message_queue(integer, text) to service_role;
