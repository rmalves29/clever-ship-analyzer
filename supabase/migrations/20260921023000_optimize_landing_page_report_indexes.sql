-- Acelera os filtros/paginação usados pelos relatórios das Landing Pages.
create index if not exists landing_page_events_created_at_idx
  on public.landing_page_events (criado_em);

create index if not exists landing_page_events_page_created_at_idx
  on public.landing_page_events (landing_page_id, criado_em);

create index if not exists landing_page_events_page_type_created_at_idx
  on public.landing_page_events (landing_page_id, event_type, criado_em);

create index if not exists landing_page_leads_page_created_at_idx
  on public.landing_page_leads (landing_page_id, criado_em);
