-- Permite esconder o botão "Entrar" da trava de senha (a senha segue sendo enviada pela tecla Enter).
alter table crm.site_gate_settings add column if not exists show_enter_button boolean not null default true;
comment on column crm.site_gate_settings.show_enter_button is 'Mostra o botão "Entrar" da trava de senha. Desligado, a senha continua sendo enviada pela tecla Enter do campo.';
