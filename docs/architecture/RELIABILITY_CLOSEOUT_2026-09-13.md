# Reliability and architecture closeout — 13 September 2026

This is the current ordering of work. Historical phase numbers and unchecked
boxes in older proposals are not evidence that the corresponding implementation
is absent. Conversely, code, unit tests and a deployment do not prove a complete
customer journey.

Audit baseline: main `4a3235f8` (#716), pilot `3d3d6e54` (#717). Main production
and the isolated worker are separate deployments. The owner has authorized
shipping #717 with general customer worker execution disabled. This release
does not close the unfinished live worker acceptance gates below.

## Release order

| Priority | Work | Evidence / remaining acceptance |
|---|---|---|
| 1 | Authenticated browser-to-worker handoff | The real chat fixture gate passes 202 and uncertain 503 responses without browser model fallback. Finish deployed admission, browser closure, server completion and restored saved files. |
| 2 | Recovery and controls on that same path | Prove provider failure, worker restart, pause/resume/cancel and exhausted initialization retries with visible outcomes. Existing synthetic restart proof and unit tests do not close this entire journey. |
| 3 | General submission identity and bounded rollout | The pilot pins one account, desk and run. Add stable per-submission identities, deliberate identical follow-ups, admission recovery and tenant budgets before general customer activation. |
| 4 | Verification and delivery | Bind acceptance to the source revision and protect independent tests; verify failed-candidate repair, concurrent local editing, authorized Git delivery and real deployment verification. |
| 5 | Repeated production stability | Record repeated successful and failed journeys, duplicate suppression, recovery latency, spend and no lost edits. A single successful run is not a soak. |
| 6 | Other existing product journeys | Close the uncovered journeys in the generated journey inventory, then revisit deferred product capabilities. |

## What is already established

- **Atomic safe saving:** #716 installs database compare-and-swap for the desk
  checkpoint chain. The live isolated-worker conflict proof produced one saved
  revision and one conflict; a stale retry did not replace the winner.
- **Real worker execution:** the isolated Vercel Workflow worker can use the
  production QIR journal, retain a candidate, run its Node test/build commands
  in Sandbox and publish only verified output. The journal proof completed with
  306 unchanged quantity assertions. Earlier implementation failures needed
  operator recovery; they were not automatic self-healing successes.
- **Synthetic infrastructure recovery:** a separate live proof injected a 503
  and process exit after durable generation. It is distinct from a real provider
  outage or a customer closing their browser.
- **Original cart:** live quantity-99 and Undo checks passed. Its source was not
  published. Manual conversation selection restored it after reload; automatic
  last-chat selection and cross-browser history were not established.
- **Exact pilot code validation:** CI run `34722443188` is green for
  `3d3d6e54`; primary, browser and desktop logs were inspected. Local full suites,
  build and type checks passed. This evidence predates later documentation edits.

Evidence is preserved under [services/qir-workflow](../../services/qir-workflow/README.md).

## QIR completion boundary

QIR is **not complete as a production-wide runtime**. Contracts, persistence,
leases, budgets, tools and verification mechanisms exist. Production activation
and end-to-end acceptance must be tracked separately from those mechanisms.

The original QIR document calls phases 1–4 closed, phases 5–6 closing, and phase 7
"closed with three items open". That final phrase is historical, not a release
decision. Phase 7 remains open until its remaining delivery and customer
execution criteria pass. Sandbox execution and atomic checkpoint publication
have since been implemented, so describing them as entirely unbuilt is stale.

Still material: latency-aware routing and tenant budgets; revision-bound outcome
contracts; general browser ownership cutover; visible pre-journal workflow
failure; live cancellation; external mutation crash reconciliation; deployment
verification; and the multi-capability recovery proof in QIR section 18.
Creative/3D, robotics/simulation, broad artifact dependency revalidation and
adaptive scale are future phases, not prerequisites to shipping this limited
coding reliability pilot.

## Design-document disposition

The review covers the architecture documents, root architecture/roadmap,
product backlog, release standard and generated journey inventory. Implementation
references were checked for the principal claims below. This is not a new live
verification of every domain or every older checkbox.

| Documents / family | Disposition and actual next work |
|---|---|
| `ARCHITECTURE.md` | Add the isolated Workflow execution path to the main API/dev topology. Keep shared boundaries and handler routing. |
| `ROADMAP.md`, `docs/PRODUCT_BACKLOG.md` | Historical product backlog. Reliability takes precedence; old "desktop not built" and preview-isolation risk summaries are stale. Do not implement all future phases as this release's scope. |
| `QUANTORA_INTELLIGENCE_RUNTIME.md` | Governing runtime design; phase status needs the completion boundary above. |
| `QIR_SERVER_EXECUTION_ACCEPTANCE.md` | Release checklist, with implementation evidence separated from live acceptance. |
| `QIR_SERVER_EXECUTION_CUTOVER.md`, `QIR_BROWSER_OWNERSHIP_CUTOVER.md`, `QIR_709_IMPLEMENTATION_SEQUENCE.md` | Partially implemented; broad cutover, control/recovery journeys, Git delivery and soak remain open. |
| `QIR_STABILIZATION_STATUS.md` | Historical #713 findings; atomic saves and worker deployment have since advanced. Test-body integrity, cancellation and general identity remain open. |
| `QIR_REPOSITORY_RUNTIME_EXECUTION.md`, `QIR_710_VERIFICATION_REPAIR_LOOP.md` | Runtime/repair mechanisms exist; do not equate fixture gates with all deployed recovery journeys. |
| `QIR_RAILWAY_WORKER.md` | Alternative host runbook. Vercel Workflow is the chosen pilot; no Railway subscription or parallel worker is needed now. |
| `QIR_MILESTONE1_HANDOVER.md`, all `QIR_PHASE0_*` documents | Historical discovery and audit evidence. Preserve findings; consult current code and this ledger before treating old PR-specific instructions as unfinished work. |
| `session-continuity-handover.md` | Handover mechanism and browser gate exist. Old attachment statements are superseded by text/PDF ingestion. Cross-browser transcript recovery remains distinct from durable desk checkpoints. |
| `production-reliability-recovery.md` | Preserve failure semantics and deterministic/live gate separation. Its August baseline is historical. |
| `coding-turn-planner.md`, `communication-layer.md`, `proof-control-plane.md` | Existing architecture contracts. Continue regression coverage; no replacement orchestrator is proposed. |
| `outcome-navigator-v1.md`, `studio-platform-v2.md` | Implemented policy/choice foundations with forward-looking telemetry, output enforcement and learning proposals. Audit each proposal's production caller before activating it. |
| `capability-intelligence-v1.md` | Explicitly design-only; prior unreferenced implementation was removed. Do not resurrect dead code merely to tick a document box. |
| `PCL_CROSS_DOMAIN_INTELLIGENCE.md` | Proposed source-registry/conflict architecture. The named `CrossDomainSourceRegistry` implementation was not found in current `api`, `src` or `shared`; connector assembly and real callers need verification before claiming this shipped. |
| `PCL_ADVISOR_INTELLIGENCE.md`, `STUDY_TRUTH_LAYER.md` | Truth/evidence/mastery code exists. Calibration, source intelligence, retention scheduling and learning-gain evaluation remain product work. |
| `STUDY_REPOSITORY_RUNTIME.md`, `STUDY_CURRICULUM_PILOT_2026.md` | Named `createStudyRepositoryAdvisorAdapter` and `buildStudyCurriculumBridge` implementations were not found in current production source. Existing Study store/evidence loaders are not proof those proposed adapters or all curriculum overlays are wired. Reconcile before expanding Study. |
| `TRAVEL_AGENTIC_WORKSPACE_CLOSEOUT.md` | Narrow conversation/domain closeout, not proof of booking autonomy or all connector journeys. Keep existing approval and provider boundaries. |
| `RESEARCH_ANALYST_WORKSPACE.md` | Text-layer PDF ingestion exists despite an older paragraph saying no PDFs. Scholarly APIs, DOI/BibTeX, cross-device investigations and board verify/watch/deep-dive journeys remain open. |
| `PCL_PRESENTATION_DIRECTOR.md` | Benchmark-led quality proposal. No new paid model routing until its measured benefit is established. |
| `desktop-client-v1.md`, `desktop-client-shipping.md` | Desktop code and smoke gate exist. Signed distribution, updates and operational support are a separate release, with account/certificate costs; defer that spend during web stabilization. |

## Untested existing journeys must stay visible

The generated [journey inventory](../engineering/JOURNEY_GATE_INVENTORY.md)
currently records 41/57 proven journeys, 14 with helper coverage only and two
with no coverage; only 13 have deployed gates. Those are inventory classifications,
not a guarantee of current production success. Do not hand-edit the generated
counts. Update its source and run its generator when new journey evidence lands.

Uncovered areas include custom-domain connection, OAuth, password reset, account export/delete, prompt
enhancement/autocomplete, plan/build switching, older preview controls, Cloud
Run delivery, research board actions, BYOK, feedback/admin surfaces and the
isolated desk route. These are existing reliability work, ahead of more models,
GPT-like specialists or new connectors.

## Defect found during this closeout

The dedicated deployed fixture exposed a Rewind mismatch: the browser restored
four files at hash `99007f83`, while the latest durable checkpoint still held
the pre-Rewind tree (`ecc8fb1d`). Worker admission must refuse that mismatch.
`planDeskRestore` now appends the restored tree after preserving the prior state.
A regression test failed on the old implementation and passes on the fix; the
real Studio Rewind browser gate now checks the saved server head as well as
the rendered Preview. The deployed retest passed: the latest database checkpoint matched the restored
four-file fixture at hash `99007f83`.

Further live findings:

- Authenticated run `qir-browser-close-20260913` completed at
  `2026-09-12T22:48:57.129Z`; the tab closed at `22:49:00.507Z`. This proves
  admission/execution, but **not** execution after closure.
- Reopening revealed raw stored file strings being installed directly into the
  editor, which expects `{ content, language }`. The file tree then appeared
  empty and a subsequent local snapshot lost the file entries. The durable
  server copy remained intact. The fix converts stored text into editor files;
  the real Studio regression gate now verifies file visibility and another reload.
  The gate failed before the fix and passed afterward.
- Review before the next run found a fixed action ID shared by all browser
  pilot runs. Desk-scoped publication keys must vary per run while remaining
  stable for retries; a regression test rejects collisions, including long IDs.

## Cost and operating decision

Keep the existing main host plus one isolated Vercel Workflow worker and bounded
Sandbox execution. Sandbox runs generated code; Workflow owns continuation.
Neither a model gateway nor a browser tab replaces durable scheduling. Keep the
dedicated Gateway pilot limit at $5 total, no reset/auto-reload. Model spend and
Vercel compute/Sandbox charges must be reported separately. No Railway host,
additional model subscriptions, desktop signing purchases or new specialist
features are required to complete the immediate reliability proof.
