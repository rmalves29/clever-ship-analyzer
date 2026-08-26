alter table public.whatsapp_automations
  add column if not exists reentry_mode text not null default 'once',
  add column if not exists reentry_after_days integer null;

alter table public.whatsapp_automations
  drop constraint if exists whatsapp_automations_reentry_mode_check;
alter table public.whatsapp_automations
  add constraint whatsapp_automations_reentry_mode_check
  check (reentry_mode in ('once', 'per_order', 'per_checkout', 'after_days'));

alter table public.whatsapp_automations
  drop constraint if exists whatsapp_automations_reentry_after_days_check;
alter table public.whatsapp_automations
  add constraint whatsapp_automations_reentry_after_days_check
  check (reentry_after_days is null or (reentry_after_days between 1 and 3650));

alter table public.whatsapp_automation_runs
  add column if not exists enrollment_key text;

update public.whatsapp_automation_runs
set enrollment_key = coalesce(enrollment_key, 'once')
where enrollment_key is null;

alter table public.whatsapp_automation_runs
  alter column enrollment_key set default 'once',
  alter column enrollment_key set not null;

alter table public.whatsapp_automation_runs
  drop constraint if exists whatsapp_automation_runs_automation_id_customer_id_key;

create unique index if not exists whatsapp_automation_runs_enrollment_unique_idx
  on public.whatsapp_automation_runs (automation_id, customer_id, enrollment_key);

create index if not exists whatsapp_automation_runs_customer_history_idx
  on public.whatsapp_automation_runs (automation_id, customer_id, enrolled_at desc);

comment on column public.whatsapp_automations.reentry_mode is
  'once=uma vez; per_order=uma vez por pedido; per_checkout=uma vez por checkout; after_days=após intervalo.';
comment on column public.whatsapp_automation_runs.enrollment_key is
  'Chave idempotente da matrícula: once, order:<id>, checkout:<id> ou after_days:<data>.';
