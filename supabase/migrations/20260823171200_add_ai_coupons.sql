-- Cupons de desconto criados via Shopify Admin API pro slot especial de domingo do lote de IA
-- (Fluxo de Envio -> "Criar fluxo com IA"). Rastreia o que já foi criado pra manter histórico
-- e pra saber quando a criação na Shopify falhou (o item de conteúdo cai pra outra fonte).
create table if not exists ai_coupons (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  content_queue_item_id uuid references ai_content_queue(id) on delete set null,
  code text not null unique,
  percentage numeric not null check (percentage > 0 and percentage < 1),
  shopify_discount_id text,
  scheduled_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_coupons_batch_idx on ai_coupons (batch_id);
create index if not exists ai_coupons_scheduled_date_idx on ai_coupons (scheduled_date);
