-- Trava de acesso por senha do site (pop-up de tela cheia sem botão de fechar).
-- RLS ligado e sem policies: só o backend (service role) lê/grava; a senha nunca vai pro navegador.
create table if not exists public.site_gate_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  headline text not null default 'Área exclusiva',
  body_text text not null default 'Para entrar no site, digite a senha. Ela é enviada no nosso grupo VIP.',
  image_url text,
  password text not null default '',
  password_placeholder text not null default 'Digite a senha',
  button_text text not null default 'Entrar',
  group_url text,
  group_button_text text not null default 'Entrar no grupo VIP para receber a senha',
  background_color text not null default '#0f172a',
  text_color text not null default '#ffffff',
  button_color text not null default '#25d366',
  gate_version uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

alter table public.site_gate_settings enable row level security;

insert into public.site_gate_settings (id) values (1) on conflict (id) do nothing;
