-- Rate limit persistente (compartilhado entre instâncias do servidor): contador por chave numa janela fixa.
-- Usado no login e nas rotas públicas (captura de lead, desbloqueio do gate). O servidor chama a função com a
-- chave de serviço; ninguém mais tem acesso. Se a função não existir, o código cai para um limite em memória.
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_limit integer)
returns table(allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rate_limits;
begin
  insert into public.rate_limits as t (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when t.window_start < now() - make_interval(secs => p_window_seconds) then now() else t.window_start end,
    count        = case when t.window_start < now() - make_interval(secs => p_window_seconds) then 1 else t.count + 1 end
  returning * into r;

  -- faxina oportunista: ~1% das chamadas apagam contadores com mais de 1 dia
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  allowed := r.count <= p_limit;
  remaining := greatest(p_limit - r.count, 0);
  retry_after := greatest(ceil(extract(epoch from (r.window_start + make_interval(secs => p_window_seconds) - now())))::integer, 1);
  return next;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant all on public.rate_limits to service_role;
