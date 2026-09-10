# Automated model spending pause — 10 September 2026

The owner requested immediate containment of unaffordable Google/Gemini spend.
This changes automation only. Production application code, credentials, model
routing, user quotas and provider spending limits are unchanged.

## Default behaviour

- Deployed Golden Transactions keeps automatic readiness, QIR durability and
  fixture-based shop checks. It does not execute the real-model script (including
  its live probe, application builds, critic/repair and fallback activity).
- Provider health keeps half-hourly no-generation readiness checks. It no longer
  makes scheduled Gemini generation probes.
- Desk Eval no longer has a daily paid schedule.
- Study live visual tests also require per-run manual consent; its automatic
  deterministic native-component job is preserved unchanged from #684.
- Each real-model workflow requires a manual dispatch and an explicit boolean
  `confirm_live_model_spend=true` for that run. The default is false. No PR title,
  opening, ready event, merge, deployment, or schedule grants that consent.

## Evidence and release policy

`NOT RUN` is not a pass. Automatic jobs identify themselves as non-model checks.
They do not establish live generation or provider availability under load.
Ordinary CI, browser/desktop tests, persistence and native Study fixture checks
remain unchanged. Paid test failures remain failures when a run was requested.

This workflow-only containment release does not require spending money to prove
that automated spending is off. Further application releases must not claim live
verification without fresh, explicitly budgeted evidence for the exact revision.
Do not lift this pause or bulk-merge parked application PRs to obtain green badges.

## Remaining boundary

This is an automation pause, not a combined monthly cloud budget or completed
per-call accounting system. User-initiated calls still consume provider credit.
Already-running jobs and workflows from older branch revisions are not rewritten
by this commit. Cancel old paid runs and integrate this policy into any branch
before triggering or rerunning its paid workflows. Do not rerun historical jobs.

Keep current provider caps in place. Do not increase caps or enable automatic
credit reload. Reconcile charges by provider/service before choosing any new
allowance. Separate test/user attribution and concurrency-safe budget reservation
remain subsequent work, not claims of this change.
