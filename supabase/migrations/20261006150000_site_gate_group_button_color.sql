-- Cor própria do botão "Entrar no grupo" da trava de acesso (independente do botão de entrar).
alter table public.site_gate_settings
  add column if not exists group_button_color text not null default '#25d366';
