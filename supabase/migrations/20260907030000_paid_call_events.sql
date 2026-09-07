-- One row per paid model call, attributed to the person who caused it (Phase 6).
--
-- WHY A USER ID APPEARS HERE WHEN turn_plan_events DELIBERATELY HAS NONE
--
-- The turn-plan ledger measures a decision, and a decision can be counted
-- without knowing whose it was. A fairness quota cannot: "this person has
-- used their share" is a claim about a person, and there is no way to make it
-- without attribution. So the id is stored, and nothing else is — no prompt,
-- no reply, no model, no cost, no IP. The value is the opaque session subject,
-- never an email or a name, so a leak of this table names nobody.
--
-- WHY COUNTS AND NOT DOLLARS
--
-- All users share one OpenRouter key, so the provider publishes one meter for
-- all of them and cannot say who spent what. Reconstructing per-user dollars
-- would mean pricing each call from a catalogue that drifts from what is
-- actually charged -- the same arithmetic paid-route-gate.ts refused to build,
-- for the same reason. A call count is a number the platform can observe
-- exactly. It is therefore a FAIRNESS brake, not a cost brake: the dollar
-- ceiling on the key remains the thing that protects the wallet, and this
-- table only stops one person consuming the whole of it before the others
-- arrive.

create table if not exists public.paid_call_events (
  id         bigserial primary key,
  user_sub   text not null,
  created_at timestamptz not null default now()
);

-- The only query this table serves: how many calls has this person made since
-- a moment. Both columns, in that order, so the count is an index-only scan.
create index if not exists paid_call_events_user_window_idx
  on public.paid_call_events (user_sub, created_at desc);

alter table public.paid_call_events enable row level security;
revoke all on public.paid_call_events from anon, authenticated;
