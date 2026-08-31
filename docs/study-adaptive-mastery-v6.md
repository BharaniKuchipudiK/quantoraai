# Study Adaptive Mastery / Next-Best-Action V6

## Purpose

V6 adds a graph-aware planning step to the existing evidence-backed Study learner model. It does **not** create another mastery model, another learner-state store, or a second source of truth.

The decision is deliberately narrow:

> When the active concept has a verified generic failure that requires guided repair, should Quantora repair that concept directly, verify a missing prerequisite, or step back to a prerequisite that already has a verified repair need?

## Existing authorities retained

- `study_mastery_events` remains the durable learner evidence ledger.
- `admittedStudyMasteryEvidence` remains the trust boundary for mastery evidence.
- `estimateStudyMastery` remains the mastery estimator.
- `buildStudyLearnerModel` remains the one-concept learner-state projection.
- `study_concept_edges` with `relation = prerequisite_of` remains the canonical dependency graph.
- The existing learner model remains authoritative for specific misconception, confirmation, evidence-variation, retention and transfer moves.

V6 only refines the existing `guided_repair` path.

## Decision order

1. **No verified evidence for the active concept** → keep the existing independent retrieval move. Do not descend the graph merely because evidence is missing.
2. **Active verified misconception / confirmation need** → keep that specific current-concept intervention. Specific evidence beats graph speculation.
3. **Active concept needs evidence variation** → keep the existing variation move.
4. **Active concept has a generic verified failure (`guided_repair`)** → consult the canonical prerequisite graph.
5. For each high-confidence active prerequisite:
   - no admitted evidence → recommend a prerequisite diagnostic, without promoting mastery from conversation;
   - specific verified misconception / confirmation need → repair that prerequisite first;
   - generic verified failure → descend again, bounded by depth/node limits;
   - non-blocking state such as evidence variation / retention / transfer → do not manufacture a prerequisite gap.
6. If graph or verified prerequisite evidence cannot be read, fail closed: repair only inside the active concept and explicitly forbid inventing a prerequisite.

## Graph safety limits

- prerequisite edges must have confidence >= 0.80;
- maximum prerequisite depth: 4;
- maximum inspected prerequisite concepts: 12;
- every prerequisite frontier is capped before concept fan-out;
- uncached sibling prerequisite concepts are resolved in one bounded PostgREST `in.(...)` request rather than N+1 reads;
- shared concept, learner-model and prerequisite-frontier reads are cached across converging branches;
- only active canonical concepts are eligible;
- cycles are bounded with branch-local path state, so one sibling cannot suppress a valid shared prerequisite reached through another branch;
- storage/provider unavailability never becomes a guessed prerequisite.

## Evidence boundary

V6 reads prerequisite learner state through `readVerifiedStudyMasteryEvidence`, so the same V4/V5 admission policy applies. Assessment-shaped rows without authoritative receipts do not count. Retrieval/application/transfer/teach-back/retention/misconception rows still fail closed until their own verifier-backed admission path exists.

A conversational prerequisite question may guide the lesson, but it is **not** allowed to promote durable learner truth unless it enters the governed evidence path.

## Deliberately not in V6

- no DB/schema migration;
- no `src/` changes;
- no new mastery score;
- no separate learner graph store;
- no resurrection of the deleted `study-mastery-intelligence` / `study-learning-map` orphan path;
- no retention/transfer evidence admission;
- no UI redesign;
- no provider/model-routing changes;
- no Travel, Finance or Coding changes.

## Acceptance gates

- active specific misconception always outranks prerequisite speculation;
- a generic verified miss can select a missing prerequisite evidence frontier;
- a prerequisite with a verified misconception can become the next repair target;
- unverified non-assessment rows cannot make a prerequisite look mastered;
- converging prerequisite DAGs remain sibling-order independent;
- prerequisite concept resolution does not regress into per-concept N+1 reads;
- graph/store unavailability cannot invent a prerequisite;
- wiring gate proves the planner is reachable from the production Study adaptive path;
- Study evidence/assessment suites, full regression, synthetic Studio checks, outcome navigation, wiring, typecheck/lint and production build are green;
- Studio entry payload ceiling is unchanged because V6 adds no `src/` dependency.
