-- A pausa operacional da fila é independente do status comercial da campanha.
-- Assim não dependemos dos valores aceitos em whatsapp_campaigns.status e preservamos
-- o estado real (enviando/finalizada/erro) enquanto o worker fica impedido de reivindicar jobs.
alter table public.whatsapp_campaigns
  add column if not exists queue_paused boolean not null default false;

create index if not exists whatsapp_campaigns_queue_paused_idx
  on public.whatsapp_campaigns (queue_paused)
  where queue_paused = true;

-- Campanha com queue_paused=true preserva os jobs; o worker apenas deixa de reivindicá-los.
-- Mantém também a proteção de opt-out criada na migração anterior.
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
      and not exists (
        select 1
        from public.whatsapp_campaigns c
        where c.id = q.campaign_id
          and c.queue_paused = true
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
