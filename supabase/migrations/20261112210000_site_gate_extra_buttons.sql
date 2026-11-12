-- Botões extras da trava de senha (além do "Entrar"): lista de {id, text, url, color}.
alter table crm.site_gate_settings add column if not exists extra_buttons jsonb not null default '[]'::jsonb;
comment on column crm.site_gate_settings.extra_buttons is 'Botões extras da trava de senha, além do "Entrar": lista de {id, text, url, color}. Substitui group_url/group_button_text/group_button_color.';
update crm.site_gate_settings
   set extra_buttons = jsonb_build_array(jsonb_build_object('id', 'grupo', 'text', group_button_text, 'url', group_url, 'color', group_button_color))
 where group_url is not null and group_url <> '' and extra_buttons = '[]'::jsonb;
