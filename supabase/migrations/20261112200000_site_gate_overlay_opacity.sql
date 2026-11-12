-- Opacidade do fundo da trava de senha do site (pop-up de senha).
alter table crm.site_gate_settings add column if not exists overlay_opacity numeric not null default 0.7;
comment on column crm.site_gate_settings.overlay_opacity is 'Opacidade do fundo escurecido da trava (0.3 a 1). 1 = fundo fechado (cor sólida); abaixo disso o fundo fica translúcido com o conteúdo num cartão.';
