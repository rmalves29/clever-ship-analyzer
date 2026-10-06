-- Imagem da trava de acesso: moldura quadrada com tamanho, posição e zoom ajustáveis.
alter table public.site_gate_settings
  add column if not exists image_size integer not null default 280,
  add column if not exists image_pos_x integer not null default 50,
  add column if not exists image_pos_y integer not null default 50,
  add column if not exists image_zoom numeric not null default 1;
