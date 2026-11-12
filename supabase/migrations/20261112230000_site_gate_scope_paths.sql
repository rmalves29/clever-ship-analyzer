-- Onde a trava de senha aparece: site inteiro ou só em páginas/categorias específicas.
alter table crm.site_gate_settings add column if not exists scope text not null default 'site' check (scope in ('site','paths'));
alter table crm.site_gate_settings add column if not exists paths jsonb not null default '[]'::jsonb;
comment on column crm.site_gate_settings.scope is 'Onde a trava aparece: site = site inteiro; paths = só nas páginas listadas em paths.';
comment on column crm.site_gate_settings.paths is 'Caminhos (ex.: /collections/black-friday) onde a trava aparece quando scope = paths.';
