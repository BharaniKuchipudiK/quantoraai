-- Whether this user has opted in to letting Quantora write to GitHub on its
-- own — push a fix, open it as a pull request — rather than only read.
--
-- Defaults to false. Connecting GitHub only ever grants Quantora the ability
-- to act as the user; it must not also grant permission to act without being
-- asked. This is a second, separate decision, and it stays false until the
-- user turns it on themselves.

alter table public.github_connections
  add column if not exists auto_pr_enabled boolean not null default false;

comment on column public.github_connections.auto_pr_enabled is
  'User opt-in: Quantora may push_files_to_repository / create_pull_request without further confirmation. Merging is never covered by this flag.';
