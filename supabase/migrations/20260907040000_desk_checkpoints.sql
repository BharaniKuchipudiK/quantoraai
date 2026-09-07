-- Durable rewind for the Coding Desk (Phase 7).
--
-- `desk-checkpoints.js` has given the desk an in-memory rewind history since it
-- shipped, and said in its own header what it could not give: "Durable,
-- cross-reload history is a later phase with a server-side home." This is that
-- home. Close the tab, lose the container, come back tomorrow -- the history is
-- still there.
--
-- THIS TABLE HOLDS THE PERSON'S WORK, AND THAT IS A STEP UP FROM EVERY LEDGER
-- BESIDE IT
--
-- turn_plan_events stores lanes and durations. paid_call_events stores an
-- opaque id and a timestamp. Both are operational data, and both say so. This
-- one stores FILE CONTENT: the actual source the person is writing, because
-- there is no way to give someone their work back without keeping it.
--
-- So it is scoped and revoked like the others, and one thing more is true of
-- it: every read path must filter on user_sub as well as session_id. A session
-- id is a handle, not an authorisation, and a query that trusts it alone would
-- hand one person's working tree to another. The index leads with user_sub for
-- that reason -- the cheap query is the safe one.
--
-- WHY DELTAS AND NOT SNAPSHOTS
--
-- Twenty full copies of a working tree, per session, per person, is not
-- something to put in a row. Consecutive checkpoints differ by a file or two,
-- so each row stores only what changed since the row before it, and `hash`
-- records what the whole tree should be once that change is applied. The
-- replay checks that hash at every step, so a lost or damaged row is reported
-- at the checkpoint that broke instead of quietly returning a working tree
-- assembled out of two different moments.

create table if not exists public.desk_checkpoints (
  id            bigserial primary key,
  user_sub      text not null,
  session_id    text not null,
  checkpoint_id text not null,
  -- Position in the chain, from 0. A gap here is a break, never a shorter
  -- history: replaying past one would apply a delta to the wrong tree.
  seq           integer not null check (seq >= 0),
  label         text,
  origin        text not null default 'commit',
  -- hashVfsContent of the tree this checkpoint restores to, as its hex string.
  hash          text not null,
  -- { changed: { path: content }, removed: [path] } against the previous row.
  delta         jsonb not null,
  created_at    timestamptz not null default now()
);

-- One row per checkpoint per session, so a retried write cannot fork the chain.
create unique index if not exists desk_checkpoints_unique_idx
  on public.desk_checkpoints (user_sub, session_id, checkpoint_id);

-- The chain, in order, for one person's session. user_sub leads so the cheap
-- query is the one that cannot cross accounts.
create index if not exists desk_checkpoints_chain_idx
  on public.desk_checkpoints (user_sub, session_id, seq);

alter table public.desk_checkpoints enable row level security;
revoke all on public.desk_checkpoints from anon, authenticated;
