-- Admin qualification: store the latest smoke-test outcome per model.

alter table public.model_registry
  add column if not exists smoke_test jsonb;

comment on column public.model_registry.smoke_test is
  'Latest admin smoke test: { passed, ran_at, results: [{ id, label, passed, latencyMs, error, snippet }] }';
