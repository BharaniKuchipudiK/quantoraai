# Quantora Study V7 — Production Proof

**Status:** H0.3 production-proof contract  
**Verified:** 2026-09-01  
**Applies to:** Quantora Study V7 assessment, retention and transfer evidence path

## Purpose

This document closes the gap between repository intent and production database reality.

V7 is considered production-compatible only when all three layers agree:

1. committed Supabase migrations;
2. Study server/runtime expectations;
3. the live production Postgres catalog and behavior.

A green TypeScript suite alone is not sufficient evidence for migration-sensitive learning truth.

## Live production parity verified on 2026-09-01

The live Quantora Supabase database was inspected directly before H0.3 changes were authored.

### Assessment-attempt schema

Verified present and correctly typed:

- `evidence_kind text not null default 'assessment_item'`;
- `evidence_concept_id uuid` referencing `study_concepts`;
- `retention_anchor_at timestamptz`.

Verified and validated constraints:

- `study_assessment_attempts_evidence_kind_check`;
- `study_assessment_attempts_retention_anchor_check`;
- `study_assessment_attempts_transfer_concept_check`.

The transfer constraint matches the canonical contract:

- transfer evidence requires a non-null evidence concept distinct from the item concept;
- every non-transfer evidence kind requires `evidence_concept_id is null`.

### Required indexes

Verified present:

- `study_assessment_attempts_evidence_concept_time_idx`;
- `study_assessment_attempts_owner_item_submitted_idx`;
- `study_assessment_attempts_owner_item_open_idx`;
- `study_assessment_attempts_evidence_concept_idx`.

The first three cover learner receipt lookup, learner-global item/version freshness and active-attempt conflict lookup. The fourth is deliberately concept-leading: Supabase's performance advisor correctly identified that `(user_sub, evidence_concept_id, submitted_at)` cannot cover referential checks for the `evidence_concept_id` foreign key by concept alone.

The narrow FK-support index was applied in production as migration `study_v7_evidence_concept_fk_index` and recorded in the repository as `20260901075807_study_v7_evidence_concept_fk_index.sql`.

### Issue/grade functions and trigger

Verified in production:

- `study_assessment_attempts_issue_guard` trigger is enabled;
- `guard_study_assessment_attempt_issue()` is `SECURITY INVOKER`;
- `complete_study_assessment_attempt(text, uuid, text, timestamptz)` is `SECURITY INVOKER`;
- the grade RPC returns V7 evidence kind, evidence concept and retention delay fields;
- issue and grade use the same learner + item/version advisory-lock key;
- the grade RPC writes the authoritative mastery event atomically with attempt completion.

Function ACLs were verified as service-role-only: `anon` and `authenticated` cannot execute the V7 grading RPC.

### Table access boundary

The Study tables checked in this proof are RLS-enabled. `anon` and `authenticated` do not have direct SELECT access; `service_role` has the required explicit table privileges.

This remains compatible with Supabase's 2026 move toward explicit Data API grants. H0.3 does not introduce a new table or broaden any browser-accessible privilege.

### Production migration history

Production contains the named V7 migrations for:

- retention/transfer evidence rollout;
- transfer-constraint drift repair;
- evidence-concept foreign-key support index.

The first two production migration-history timestamps differ from the older repository filenames because the production rollout recorded generated migration versions. Parity checks therefore compare the named contract and live catalog, not timestamp equality. The H0.3 FK-support migration uses the production-recorded version `20260901075807` in the repository as well.

## Rollback-only production canary

`supabase/canaries/study_v7_production_canary.sql` is the canonical production smoke test.

It runs inside one explicit transaction and always ends with `rollback`.

The canary proves:

- ordinary issue -> atomic grade -> mastery ledger event;
- active duplicate issuance is blocked;
- replay returns `already_submitted` without a second event;
- learner-global item/version reuse is blocked even across concepts;
- a delayed retention probe produces the authoritative integer delay and ledger event;
- transfer grading routes the event to the source/evidence concept while retaining the target item concept in the attempt receipt;
- malformed retention metadata fails the database constraint;
- a transfer to the same concept fails the database constraint;
- non-transfer evidence carrying an evidence target fails the database constraint.

The canary was executed against production on 2026-09-01 and completed without an assertion error. A post-run check confirmed zero canary users, attempts and mastery events remained.

## Governed transfer: current product-level truth

The live concept graph contains active `supports_transfer_to` edges at the required confidence threshold. However, as of this proof, no governed target edge lands on a concept that also has a released reviewed **application** item in the current small static assessment bank.

Therefore:

- database transfer semantics are live and canaried;
- the server resolver still requires an active governed edge, a distinct evidence-clear target, a reviewed released application item and learner-global item freshness;
- user-facing transfer issuance correctly remains fail-closed when those content conditions are not met.

This is an assessment-corpus breadth gap for H2, not a reason to weaken transfer governance in H0.3.

## Partial rollout and fallback contract

V7 rollout intentionally distinguishes a positive missing-schema signal from general database failure.

### Allowed temporary fallback

Ordinary assessment/retrieval/application evidence may use the legacy ordinary-assessment issuance path only when PostgREST positively reports the known V7-column/schema-cache absence.

### Never fall back

Retention and transfer never downgrade to legacy evidence. They remain unavailable until V7 schema is present.

Network failure, timeout, constraint failure, unknown database errors and validation-store unavailability all fail closed.

## Rollback order

A destructive database rollback must never be the first response to an application problem.

Safe order:

1. stop/disable the affected V7 feature path or roll application code back to a version that does not require the V7 return shape;
2. verify no active code expects V7 columns or V7 RPC result fields;
3. audit persisted V7 evidence kinds and transfer/retention receipts before any destructive schema reversal;
4. only then consider reverting functions/constraints/columns if the incident genuinely requires it;
5. rerun the production catalog proof and rollback-only canary after recovery.

Do not drop V7 columns or replace the V7 grade function while V7 application code is still live.

## Release gate

Before declaring a future Study schema-sensitive release production-safe:

- `npm run test:study` must pass, including `study-v7-production-contract.test.ts`;
- normal repository type/build/wiring/browser gates must pass;
- production catalog/function/index/ACL parity must be checked through a privileged server-side channel;
- Supabase security/performance advisors must be reviewed for new Study findings;
- the rollback-only V7 canary must pass;
- no canary data may remain afterward.

Production credentials do not belong in public pull-request CI. The production canary is intentionally a privileged release proof rather than a GitHub Actions secret dependency.
