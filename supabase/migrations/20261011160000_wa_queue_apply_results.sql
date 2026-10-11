-- Envio em alta vazão: grava o resultado de um LOTE de mensagens numa única chamada (antes eram ~6 chamadas por mensagem).
-- Cada elemento de p_results: {job_id, recipient_id, kind: sent|retry|failed|cancelled, wa_message_id, error, error_code,
-- next_attempt_at, phone (E.164, só quando kind=sent), body (texto renderizado, só quando kind=sent)}.
-- Atualiza fila (wa_jobs), destinatários (wa_campaign_recipients) e espelha os envios na caixa de entrada.
create or replace function public.wa_queue_apply_results(p_results jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  update public.wa_jobs j set
    status = case r.kind when 'sent' then 'done' when 'retry' then 'retry_wait' when 'cancelled' then 'cancelled' else 'failed' end,
    error = case when r.kind = 'sent' then null else r.error end,
    next_attempt_at = case when r.kind = 'retry' then r.next_attempt_at else null end,
    locked_by = null,
    locked_at = null
  from jsonb_to_recordset(p_results) as r(job_id uuid, kind text, error text, next_attempt_at timestamptz)
  where j.id = r.job_id;
  get diagnostics n = row_count;

  update public.wa_campaign_recipients rc set
    status = case r.kind when 'sent' then 'sent' when 'cancelled' then 'cancelled' else 'failed' end,
    wa_message_id = case when r.kind = 'sent' then r.wa_message_id else rc.wa_message_id end,
    sent_at = case when r.kind = 'sent' then now() else rc.sent_at end,
    error_code = case when r.kind = 'sent' then null else r.error_code end,
    error_message = case when r.kind = 'sent' then null else r.error end
  from jsonb_to_recordset(p_results) as r(recipient_id uuid, kind text, wa_message_id text, error text, error_code text)
  where rc.id = r.recipient_id and r.kind in ('sent', 'failed', 'cancelled');

  -- caixa de entrada: cria a conversa se não existir, grava a mensagem enviada e atualiza a prévia
  insert into public.whatsapp_inbox_threads (phone, contact_name, customer_id)
  select distinct on (r.phone) r.phone,
         nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
         c.id
  from jsonb_to_recordset(p_results) as r(kind text, phone text)
  left join public.shopify_customers c on c.phone = r.phone
  where r.kind = 'sent' and r.phone is not null
  order by r.phone, c.created_at desc nulls last
  on conflict (phone) do nothing;

  insert into public.whatsapp_inbox_messages (thread_id, direction, body, message_type, status, wa_message_id, sent_at)
  select t.id, 'outbound', r.body, 'template', 'sent', r.wa_message_id, now()
  from jsonb_to_recordset(p_results) as r(kind text, phone text, body text, wa_message_id text)
  join public.whatsapp_inbox_threads t on t.phone = r.phone
  where r.kind = 'sent' and r.phone is not null and r.body is not null
  on conflict (wa_message_id) do nothing;

  update public.whatsapp_inbox_threads t set
    last_message_at = now(),
    last_message_preview = left(m.body, 160),
    updated_at = now()
  from (
    select distinct on (r.phone) r.phone, r.body
    from jsonb_to_recordset(p_results) as r(kind text, phone text, body text)
    where r.kind = 'sent' and r.phone is not null and r.body is not null
  ) m
  where t.phone = m.phone;

  return n;
end;
$$;

revoke all on function public.wa_queue_apply_results(jsonb) from public, anon, authenticated;
grant execute on function public.wa_queue_apply_results(jsonb) to service_role;
