-- Product completion events for north-star KPIs (preview opened, publish completed).

create table if not exists public.product_events (
  id          bigserial primary key,
  user_sub    text references public.users(google_sub) on delete set null,
  event_type  text not null check (event_type in ('preview_opened', 'publish_completed')),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists product_events_type_time_idx
  on public.product_events (event_type, created_at desc);

alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;
