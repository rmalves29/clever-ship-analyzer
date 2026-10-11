-- Devolve à fila itens reservados pelo worker mas não enviados (o prazo do tick acabou antes da onda deles),
-- sem gastar tentativa. E índice para contar a fila por campanha sem varrer a tabela inteira.
create or replace function public.release_wa_jobs(p_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare n integer;
begin
  update public.wa_jobs
     set status = 'queued', attempts = greatest(attempts - 1, 0), locked_by = null, locked_at = null
   where id = any(p_ids) and status = 'sending';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.release_wa_jobs(uuid[]) from public, anon, authenticated;
grant execute on function public.release_wa_jobs(uuid[]) to service_role;

create index if not exists wa_jobs_campaign_status_idx on public.wa_jobs (campaign_id, status);
