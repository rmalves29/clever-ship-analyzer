-- Configuração visual do construtor de pop-ups. Mantém compatibilidade com campanhas antigas:
-- o backend normaliza '{}' para o preset Essencial quando a campanha é lida.
alter table public.popup_campaigns
  add column if not exists design_config jsonb not null default '{}'::jsonb;

comment on column public.popup_campaigns.design_config is
  'Layout, cores, jornada, placeholders, tela de resultado e configuração de interação do construtor visual de pop-ups.';
