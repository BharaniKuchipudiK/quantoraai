-- Study evidence idempotency.
-- A network/tool retry must never count the same learner observation twice.

alter table public.study_mastery_events
  add column if not exists event_key text;

-- Backfill defensively for any rows created before the runtime is activated.
update public.study_mastery_events
set event_key = id::text
where event_key is null or btrim(event_key) = '';

alter table public.study_mastery_events
  alter column event_key set not null;

alter table public.study_mastery_events
  drop constraint if exists study_mastery_events_event_key_check;

alter table public.study_mastery_events
  add constraint study_mastery_events_event_key_check
  check (
    char_length(event_key) between 1 and 200
    and event_key ~ '^[a-z0-9][a-z0-9._:-]*$'
  );

create unique index if not exists study_mastery_events_owner_event_key_uidx
  on public.study_mastery_events (user_sub, event_key);
