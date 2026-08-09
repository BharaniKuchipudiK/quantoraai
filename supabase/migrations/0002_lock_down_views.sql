-- Close a hole opened by migration 0001.
--
-- growth_daily and usage_daily were created as plain views over users and
-- usage. Both base tables have row-level security enabled with no policies, so
-- the anon/publishable key can read nothing from them directly.
--
-- A view does not inherit that. By default a Postgres view executes with the
-- permissions of the role that CREATED it, not the role querying it, so the
-- view reads the base tables as its owner and RLS never applies. Supabase
-- flags exactly this in the dashboard as UNRESTRICTED.
--
-- The practical consequence: anyone holding the publishable key — which ships
-- to every browser by design — could GET /rest/v1/growth_daily and read total
-- signups, daily growth, active users and request volume.
--
-- Two independent fixes, deliberately belt-and-braces:
--
--   1. security_invoker makes the view run as the CALLER, so RLS on users and
--      usage applies normally. This is the correct fix, and needs PG15+.
--   2. Revoking the grants removes access even if security_invoker is
--      unavailable or is ever turned off again.
--
-- Either alone would do. Both means a single mistake later does not reopen it.

alter view public.growth_daily set (security_invoker = on);
alter view public.usage_daily  set (security_invoker = on);

revoke all on public.growth_daily from anon, authenticated;
revoke all on public.usage_daily  from anon, authenticated;

-- The service-role/secret key bypasses RLS and grants, so the server keeps
-- working. Nothing in the application reads these views with a public key.
