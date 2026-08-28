create table if not exists public.popup_social_proof_settings (
  id integer primary key default 1,
  enabled boolean not null default true,
  delay_after_capture_seconds integer not null default 10,
  interval_seconds integer not null default 50,
  visible_seconds integer not null default 3,
  position text not null default 'top-left',
  updated_at timestamp with time zone not null default now(),
  constraint popup_social_proof_singleton check (id = 1),
  constraint popup_social_proof_delay_range check (delay_after_capture_seconds between 1 and 300),
  constraint popup_social_proof_interval_range check (interval_seconds between 10 and 3600),
  constraint popup_social_proof_visible_range check (visible_seconds between 2 and 30),
  constraint popup_social_proof_visible_before_next check (visible_seconds < interval_seconds),
  constraint popup_social_proof_position check (position in ('top-left', 'top-right', 'bottom-left', 'bottom-right'))
);

insert into public.popup_social_proof_settings (
  id,
  enabled,
  delay_after_capture_seconds,
  interval_seconds,
  visible_seconds,
  position
)
values (1, true, 10, 50, 3, 'top-left')
on conflict (id) do nothing;

alter table public.popup_social_proof_settings enable row level security;

revoke all on table public.popup_social_proof_settings from anon, authenticated;
grant select, insert, update on table public.popup_social_proof_settings to service_role;

comment on table public.popup_social_proof_settings is
  'Singleton configuration for the storefront recent-purchase social proof popup. Accessed only by authenticated server functions and service-role routes.';
