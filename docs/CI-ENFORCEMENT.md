# Keeping `main` green — required status checks

## The problem this prevents

`main` has been merged into while red more than once — e.g. a `StudioChatFeed.jsx`
JSX break and incomplete Stripe endpoints both reached `main` even though
`tsc` / eslint / tests failed. It slipped through because:

- **PR CI passing is not the same as the merge result passing.** A PR branch cut
  from an older, green `main` shows green checks, but once merged on top of other
  changes the combined tree can be red.
- **Nothing on GitHub currently blocks merging a PR whose checks are red**, and
  commits can land on `main` without a PR at all.

With two agents committing in parallel, this is the single biggest source of the
"main is broken again" churn.

## The fix: branch protection on `main` (one-time, ~2 min)

This is a **repository setting** — it cannot be changed from code, only by a repo
admin. Steps:

1. GitHub → the repo → **Settings → Branches → Add branch ruleset** (or
   "Add rule" under classic Branch protection).
2. Branch name pattern: `main`.
3. Enable **Require a pull request before merging** (blocks direct pushes to
   `main`).
4. Enable **Require status checks to pass before merging**, and add the check:
   - **`Typecheck, tests, build, and audit`** (the job name from
     `.github/workflows/ci.yml`).
5. Enable **Require branches to be up to date before merging.** *This is the key
   one* — it forces a PR branch to be rebased/merged onto the latest `main` and
   re-run CI before it can merge, so the *merge result* is what's verified, not a
   stale base.
6. (Recommended) Enable **Do not allow bypassing the above settings** so the rule
   applies to admins/bots too.

After this, a PR can only merge when its checks are green **against current
`main`** — the exact gap that let the breakages through.

## Why "up to date before merging" matters most here

The `StudioChatFeed` and Stripe breaks each passed on their own PR branch. They
became red only *on `main`*, after unrelated changes landed. Requiring branches
to be up to date means GitHub re-runs CI on the merge result, catching that class
of break before it lands — not after.

## Complementary guardrails already in the repo

- `.github/workflows/ci.yml` runs `tsc`, the `no-undef` eslint gate, the full
  test suite, `vite build`, and `npm audit` on every PR and on push to `main`.
- `eslint.config.mjs` (`no-undef`) catches the "X is not defined" class that
  `vite build` does not.

Branch protection is what turns those checks from *advisory* into *enforced*.
