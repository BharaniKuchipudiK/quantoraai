-- Admin access, decided by the account rather than by a shared password.
--
-- The dashboard was gated on ADMIN_API_KEY: a separate secret, held in Vercel,
-- retyped by hand, and the cause of two lockouts. It made sense when the app
-- had no real authentication. It does not now — Google sign-in is verified
-- server-side and backed by a session, so the person is already known by the
-- time they reach the dashboard. Asking them to prove it a second way, with a
-- different credential, was redundant complexity.
--
-- A flag on the user row instead. No new environment variable, nothing to
-- paste, nothing to lose. It is visible and editable in the Supabase table
-- editor, which means access can always be restored by the person who owns the
-- database — there is no state where the operator is locked out of their own
-- dashboard with no recourse.

alter table public.users
  add column if not exists is_admin boolean not null default false;

-- Deliberately no seeding. Granting the first admin is a manual, visible act:
--
--   update public.users set is_admin = true where email = 'you@example.com';
--
-- Anything automatic here would be a rule about who gets privileged access,
-- written by someone who cannot know the answer.
