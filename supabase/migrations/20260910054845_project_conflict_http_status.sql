-- A stale expected version is an application conflict, not a transaction to retry.
-- PostgREST can repeatedly retry SQLSTATE 40001 until our 4s HTTP budget expires.
-- Keep the existing function, locking, validation, ownership, grants and writes;
-- change only the two deliberate project_version_conflict exception codes.
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
set local lock_timeout = '2s';

do $migration$
declare
  target oid := 'public.save_project(text,text,integer,text,text,text,text,text)'::regprocedure;
  original text := pg_get_functiondef(target);
  old_error text := 'raise exception ''project_version_conflict'' using errcode = ''40001'';';
  new_error text := 'raise exception ''project_version_conflict'' using errcode = ''PT409'';';
  patched text;
  before_metadata jsonb;
  after_metadata jsonb;
begin
  if original not like '%' || old_error || '%'
     and (length(original) - length(replace(original, new_error, ''))) / length(new_error) = 2 then
    return; -- Safe replay after the same migration, not a replacement of newer code.
  end if;
  if (length(original) - length(replace(original, old_error, ''))) / length(old_error) <> 2
     or original like '%' || new_error || '%' then
    raise exception 'save_project conflict clauses have drifted; review instead of overwriting';
  end if;

  select jsonb_build_object('owner', proowner, 'grants', proacl::text,
    'security_definer', prosecdef, 'settings', proconfig)
    into before_metadata from pg_proc where oid = target;
  patched := replace(original, old_error, new_error);
  execute patched;
  if pg_get_functiondef(target) <> patched then
    raise exception 'save_project definition changed beyond the reviewed substitution';
  end if;
  select jsonb_build_object('owner', proowner, 'grants', proacl::text,
    'security_definer', prosecdef, 'settings', proconfig)
    into after_metadata from pg_proc where oid = target;
  if before_metadata is distinct from after_metadata then
    raise exception 'save_project security metadata changed; rolling back';
  end if;
end
$migration$;
