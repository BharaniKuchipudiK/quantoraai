alter table public.github_connections
  add column if not exists auto_deliver_enabled boolean not null default false;

comment on column public.github_connections.auto_deliver_enabled is
  'User opt-in: Quantora may run the evidence-gated Coding delivery controller through exact-head CI repair, merge, deployment verification, and production smoke. This is separate from auto_pr_enabled and defaults off.';
