# Session Continuity v2 — PR12 saved-mission slice

This slice restores an unfinished mission's **UI position** when the learner
reopens the same saved Study chat on the same browser/device. It is not a new
learner-model, assessment, evidence or durable agent-runtime authority.

## Implemented

- The existing Study workspace passes its real session ID to the shell.
- A read-only authenticated session lookup supplies the account scope. Cached
  localStorage user objects are not used as account identity.
- Active, topic-aligned mission position is saved on transition. A returning
  learner explicitly chooses Resume lesson or Discard saved position.
- Scope is account + saved chat + matching lesson topic. A record lasts at most
  seven days; only twelve saved chats per account are retained.
- Prior hint use is a bounded historical observation with a twenty-minute
  display window. It is never injected as fresh working state or mastery.
- Resume uses the existing mission reducer. Review resumes at verified_check,
  not at a claimed pass. Attempt IDs, grades, answers, mastery, and confirmed
  misconceptions are never restored. Stored canonical concept keys are not
  trusted: the next explicit server check resolves the visible topic again.
- Completion/discard removes the saved position. Blocked storage, invalid JSON,
  oversized payloads, invalid versions and expired/future dates fail closed.
- No model call, assessment issuance, or automatic lesson message is made by
  hydration or Resume. Paid model-spend containment remains unchanged.

## Not claimed by this slice

Cross-device mission persistence, account-wide unresolved-misconception and
recent-mastery summaries, fresh retention prioritisation on entry, and full
closed-loop runtime integration remain PR12/PR13 follow-through. Existing
Learning Compass and server assessment/learner-model authorities remain the
source of those verified facts; browser checkpoints are not a substitute.

## Evidence

Pure checkpoint tests cover scope isolation, retention, corrupt storage,
allowlisted fields, safe progress-only replay, support expiry and quota failure.
Integration tests replay saved phases through the actual mission reducer and
check the mounted session/hook wiring. Full repository CI and an actual browser
reload/resume journey are release requirements, not inferred from unit tests.
Live-model acceptance remains NOT RUN under the spending pause. This change
must not close #677 or be described as completion of all PR12 requirements.
