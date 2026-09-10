# Study PR12 — cloud lesson positions and fresh return context

Extends #689 without replacing the Study mission reducer, existing visuals or verified learner-model authority.

## Learner journey
An active mission saves a bounded UI checkpoint locally and attempts an authenticated cloud save. Reopening its saved chat offers the existing Resume/Discard controls. A different browser can start the same Study topic, open Study AI → Where next? → Your learning across topics, and choose Resume saved lesson. The source is reread on that click: an intervening discard or expiry cannot be accepted from an old list. The stage binds to the current chat; this is **not transcript synchronization**.

Only Explain, Guided practice and Verified check are restored. A saved review requires a new server check. Resume does not send a model message or issue an assessment. Browser-provided grades, attempt IDs and canonical concept identities never become learning authority.

## Persistence and conflict handling
The existing authenticated Compass endpoint handles continuity actions. The session's subject is the only database owner selector. Per-chat actions additionally require an account-email equality precondition to reject queued writes after account changes. JSON-only writes and no-store responses preserve the existing auth boundary.

Apply `supabase/study-session-checkpoints.sql` as a reviewed additive migration. The new table has RLS enabled, no anon/authenticated/public grants, a user foreign key and cascading deletion. The SECURITY INVOKER RPC is callable only by service_role. It serializes an account's checkpoint set and compares opaque revisions. Stale writers stop on conflict; a clear is a new revision with a null checkpoint, not a row deletion. A pre-hydration action cannot borrow a newly discovered server revision to overwrite an existing record. Cloud errors never produce a successful cloud-save claim. Same-browser recovery remains available; cloud retries are not automatic.

Checkpoint lifetime is seven days, at most twelve active lessons and twenty-four total records per account. Expired records are excluded on reads and cleaned during subsequent account writes. This is not a global scheduled cleanup job.

## Historical hint boundary
Hint clicks are synchronously captured only by one mounted authenticated Study owner. Multiple owners fail closed. History is account/chat/topic scoped and expires twenty minutes after its original observation. Restoring or saving a lesson does not refresh that observation or rehydrate temporary adaptive working state. It is support history, never independent evidence of correctness or mastery.

## Verified return context
The Compass history panel refreshes misconception signals to recheck, recently verified concepts (seven days), and retention checks due. Candidate discovery is bounded to 500 recent evidence rows and twelve concepts; each displayed state is reconstructed through the existing verified projection loader. Partial refreshes explicitly say partial, and unavailable history is not displayed as an empty account. The panel does not invent confirmed misconceptions from signals, or turn saved lesson positions/hints into mastery. Selecting a history topic uses the existing explicit Compass mission action.

## Verification
Pure JS and dependency-injected server regressions cover separate device stores, serialized writes, revision conflicts, discard tombstones, account selectors, malformed/future input, canonical-authority stripping, hint isolation/expiry, and verified-only summary projection. Repository CI must also pass typecheck/build and the actual browser journeys.

The stable native Study browser-proof entrypoint retains both existing proofs and adds a two-independent-browser/new-chat journey on desktop and mobile. Only API replies are fixtures. The new journey checks cloud retrieval, fresh pre-resume reread, concurrent discard refusal, target-chat binding, reload/discard, account isolation, partial-history wording and zero automatic model/assessment calls. Database RPC assertions are checked separately in a rollback-only transaction. CI/production evidence and exact SHAs are recorded on the PR, not fabricated here.

Paid-model acceptance remains paused. This change does not close #677 or complete PR13 closed-loop integration or PR14 learner-profile evaluation.
