create or replace function public.get_landing_page_funnel_report(
  p_landing_page_id uuid default null,
  p_since timestamptz default null
)
returns table (landing_page_id uuid, visits bigint, submissions bigint, clicks bigint, joins bigint)
language sql stable security definer set search_path = public
as $$
  with filtered_events as (
    select e.id, e.landing_page_id, e.event_type, e.visitor_id, e.phone
    from public.landing_page_events e
    where (p_landing_page_id is null or e.landing_page_id = p_landing_page_id)
      and (p_since is null or e.criado_em >= p_since)
  ),
  event_keys as (
    select landing_page_id, event_type,
      case
        when nullif(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), '') is not null
          then 'phone:' || right(regexp_replace(phone, '\\D', '', 'g'), 11)
        when nullif(visitor_id, '') is not null then 'visitor:' || visitor_id
        else 'event:' || id::text
      end as person_key
    from filtered_events
  ),
  metrics as (
    select landing_page_id,
      count(distinct person_key) filter (where event_type = 'view') as visits,
      count(distinct person_key) filter (where event_type = 'form_submit') as submissions,
      count(distinct person_key) filter (where event_type = 'link_click') as clicks
    from event_keys group by landing_page_id
  ),
  click_phones as (
    select distinct landing_page_id, right(regexp_replace(phone, '\\D', '', 'g'), 11) as phone_key
    from filtered_events
    where event_type = 'link_click' and nullif(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), '') is not null
  ),
  page_groups as (
    select
      p.id as landing_page_id,
      nullif(p.conteudo->'integracoes'->>'whatsappGroupId', '') as group_id,
      fg.group_jid
    from public.landing_pages p
    left join public.fe_groups fg
      on fg.id::text = nullif(p.conteudo->'integracoes'->>'whatsappGroupId', '')
    where (p_landing_page_id is null or p.id = p_landing_page_id)
      and nullif(p.conteudo->'integracoes'->>'whatsappGroupId', '') is not null
  ),
  joined as (
    select distinct c.landing_page_id, c.phone_key
    from click_phones c
    join page_groups pg on pg.landing_page_id = c.landing_page_id
    where exists (
      select 1
      from public.fe_group_events g
      where g.event_type = 'join'
        and g.phone is not null
        and right(regexp_replace(g.phone, '\\D', '', 'g'), 11) = c.phone_key
        and (p_since is null or g.created_at >= p_since)
        and (
          g.group_id::text = pg.group_id
          or (
            pg.group_jid is not null
            and (
              g.group_jid = pg.group_jid
              or exists (
                select 1
                from public.fe_groups eq
                where eq.id = g.group_id
                  and eq.group_jid = pg.group_jid
              )
            )
          )
        )
    )
  ),
  join_counts as (
    select landing_page_id, count(*) as joins
    from joined
    group by landing_page_id
  )
  select m.landing_page_id, m.visits, m.submissions, m.clicks, coalesce(j.joins, 0)
  from metrics m
  left join join_counts j using (landing_page_id);
$$;

revoke all on function public.get_landing_page_funnel_report(uuid, timestamptz) from public;
grant execute on function public.get_landing_page_funnel_report(uuid, timestamptz) to service_role;

create index if not exists fe_group_events_join_group_jid_phone_created_at_idx
  on public.fe_group_events (group_jid, phone, created_at)
  where event_type = 'join' and phone is not null and group_jid is not null;
