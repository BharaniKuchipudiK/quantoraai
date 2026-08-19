-- Cover the self-referential supersession foreign key so corrections and
-- lifecycle cleanup do not require scanning a user's context history.
create index if not exists user_context_supersedes_idx
  on public.user_context_nodes (supersedes)
  where supersedes is not null;
