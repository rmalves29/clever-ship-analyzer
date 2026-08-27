-- Pop-up de captura de WhatsApp no site (menu Automações): configuração do pop-up, leads
-- capturadas e log de visitas (pra saber quando uma lead volta ao site sem comprar de novo).
create table if not exists popup_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default false,

  collect_name boolean not null default true,
  headline text not null default 'Ganhe um desconto especial!',
  body_text text not null default 'Deixe seu WhatsApp e receba um cupom exclusivo.',
  button_text text not null default 'Quero meu desconto',
  image_url text,

  trigger_time_seconds integer,               -- null = gatilho por tempo desativado
  trigger_exit_intent boolean not null default false,
  reshow_mode text not null default 'after_days' check (reshow_mode in ('once_ever', 'after_days')),
  reshow_after_days integer,                  -- usado só quando reshow_mode = 'after_days'

  coupon_mode text not null default 'none' check (coupon_mode in ('none', 'fixed', 'unique')),
  fixed_coupon_code text,
  discount_type text check (discount_type in ('percentage', 'fixed_amount')),
  discount_value numeric,
  discount_expires_days integer,

  template_id text,                           -- id do template aprovado na Meta
  template_name text,
  template_language text,
  template_var_mapping jsonb not null default '{}'::jsonb, -- {"token": "name" | "coupon_code" | "static:texto"}

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists popup_leads (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  visitor_token text unique,
  popup_campaign_id uuid references popup_campaigns(id) on delete set null,
  coupon_code text,
  customer_row_id text,                       -- id em shopify_customers (phone:... ou já reconciliado)
  first_captured_at timestamptz not null default now(),
  last_captured_at timestamptz not null default now(),
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists popup_leads_visitor_token_idx on popup_leads (visitor_token);

create table if not exists site_visits (
  id uuid primary key default gen_random_uuid(),
  visitor_token text not null,
  page_url text,
  created_at timestamptz not null default now()
);

create index if not exists site_visits_visitor_token_idx on site_visits (visitor_token, created_at desc);
