# QIR Phase 0 — Completion Semantics and Release-Gate Map

Status: **IN PROGRESS**  
Audit target: production execution spine on `main` at `9540be8a5ac5c00f1dfe49e2038d5f7d04dd1d9d`  
Architecture authority: `QUANTORA_INTELLIGENCE_RUNTIME.md`

Earlier Phase 0 checkpoints were taken against the immediately preceding main commit (`2c19d6dc...`). PR #446 has now been merged forward to the current `main`; this pass verifies completion/release semantics against the refreshed baseline.

This is a behavior-neutral architecture audit. It does **not** rename production events, change CI, or change release policy yet.

---

## 1. Executive finding

Quantora already has many strong notions of *local success*, but the repository currently uses words such as `success`, `completed`, `clean`, `ready`, `verified`, `pass`, and `publish_completed` at different semantic levels.

That is not automatically wrong. A provider call can succeed, a tool invocation can complete, a compiler can pass, an artifact can verify, and a user mission can still remain unfinished.

The architectural problem is that those levels are not represented by one explicit hierarchy and one sovereign completion transition.

QIR therefore locks five distinct levels:

```text
LEVEL 1  ATTEMPT
         model/provider/tool attempt returned successfully

LEVEL 2  OPERATION / OBSERVATION
         a concrete tool operation executed and produced evidence

LEVEL 3  ARTIFACT / CLAIM VERIFICATION
         compiler, runtime, verifier, source check, assessment gate, etc. passed

LEVEL 4  PLAN STEP
         the current planned step satisfied its explicit step contract

LEVEL 5  OUTCOME / AGENT RUN
         the mission Outcome Contract is independently verified
         -> and only now may QIR transition the Run to COMPLETE
```

**A lower level may never silently promote itself to a higher level.**

---

## 2. Sole future authority for `Run.COMPLETE`

`api/_lib/outcome-contract.ts::evaluateProofOfDone(...)` is the correct existing seed for the universal completion authority.

It requires mission-level evidence including:

- a defined mission;
- an explicit Definition of Done;
- satisfied criteria;
- no unresolved material question;
- no unresolved safety flag;
- produced artifacts verified where applicable;
- evidence references;
- explicit mission achievement.

`conversation-engine.ts` already contains the complementary honesty rule: assistant prose that claims the work/site/app/document/project is done or ready is rejected when Proof of Done is not verified.

### QIR disposition

**PROMOTE `evaluateProofOfDone` into the Outcome Engine and make it the only authority that can emit `run.completed`.**

Domain verifiers remain inputs. The model that created the output does not own the transition.

---

## 3. Completion vocabulary — current authority classification

| Current concept | What it actually proves | QIR level | Future semantic role |
|---|---|---:|---|
| model quality `success` | a model/turn attempt completed according to its local contract | 1 | `model.attempt.completed` |
| provider HTTP 2xx / tool `status: success` | provider/tool returned a usable result | 1–2 | `tool.completed` + Observation |
| Travel SSE tool `state: completed` | one tool invocation finished | 2 | tool lifecycle only |
| Vercel deployment creation response | deployment resource was created | 2 | `deployment.created` evidence |
| domain `connected: true` | domain attachment operation succeeded | 2 | external-operation evidence |
| Coding `codingTurnMayClaimSuccess(...)` | coding-turn structural/proof contract passed | 3 | software evidence adapter |
| Preview `ready` / `clean` | current artifact compiled/rendered sufficiently for local runtime trust | 3 | runtime verification evidence |
| Office `verification.passed` | returned Office binary/spec/preview passed artifact checks | 3 | Office verifier evidence |
| Research `supported/contested/unverified` | source-backed claim verification state | 3 | Research claim evidence |
| Study `canClaimVerified` | required domain verifier set passed for that Study claim/item | 3 | Study verifier evidence |
| build-job `buildJobIsComplete` | all planned step file promises currently exist | 4 | plan-step evidence, not final software proof |
| project `status: completed` | semantic project status stored by project state | metadata | project lifecycle metadata; never sole Run proof |
| PCL external-action evidence statement “completed” | one approved side effect was provider-confirmed | 2 | Observation/evidence |
| `ProofOfDone.status === verified` | mission-level completion contract is satisfied | **5** | **only source of `run.completed`** |

---

## 4. Coding / Preview — several useful local success states must remain evidence

### Coding proof

`proof-control-plane.js::codingTurnMayClaimSuccess(...)` returns true when the Coding proof verdict is `ok` and `status === 'pass'`.

That is useful: it prevents a coding turn from declaring success merely because the model emitted text. But it still does not prove the user's whole software goal.

A coding turn may pass while later runtime behavior, a requested feature, security gate, or another plan step remains outstanding.

**QIR mapping:** Coding proof -> `verification.completed(kind='software-structural')`.

### Build job

`build-job.js` deliberately calls a step complete only when every file promised by that step exists with content. This is an excellent anti-assertion rule.

But file existence is a **step contract**, not a software mission contract. A complete file set can still fail compile/runtime/behavioral verification.

**QIR mapping:** build-job completion -> `step.contract.satisfied`, followed by required verification before the step or artifact is promoted.

### Preview

`ProjectRuntimePreview` / `LivePreviewCanvas` expose local states such as compiling, ready, failed, running, healing, clean and degraded. These are valid observations about one artifact generation.

**QIR mapping:** Preview states -> verifier observations tied to an immutable artifact generation id. Preview must never directly close the Run.

---

## 5. Office / Research / Study — strong verifier semantics, still below mission completion

### Office

Office generation already withholds a degraded output when final artifact verification fails. A returned `verification.passed` is therefore meaningful evidence that the generated Office artifact itself is coherent.

It is still possible for a perfectly valid PPTX/DOCX/XLSX to fail the user's mission brief.

**QIR mapping:** Office verification -> artifact verification evidence -> Outcome Engine evaluates mission criteria.

### Research

Research verification separates proposer from adjudicator: the model proposes a passage/stance and deterministic verification checks that the passage exists in the fetched source. A claim is supported/contested/unverified rather than being accepted from model assertion.

**QIR mapping:** claim result -> evidence graph; Research Outcome Contract decides whether enough verified coverage/freshness/contradictions handling exists for the mission.

### Study

Study's verification runtime executes concrete numeric/symbolic/grounded/reviewed-assessment verifiers. Required missing evidence becomes `insufficient`, not success. `canClaimVerified` therefore has a precise domain meaning.

**QIR mapping:** verified Study claim/assessment -> domain evidence. Learner/session mission completion remains an Outcome Engine decision.

---

## 6. External actions — “operation completed” must not mean “mission complete”

PCL side-effect governance already has the right shape:

`exact human authorization -> tool/provider call -> provider evidence`

The resulting evidence may legitimately say an external action completed. For example:

- Vercel deployment created;
- custom domain attached;
- GCP deployment created.

Those are **operation-level facts**.

A mission such as “publish my working website at my domain” may require multiple independent facts:

- verified artifact generation;
- production deployment actually ready/serving;
- domain attached;
- DNS verified/working where requested;
- final URL behavior verified.

No individual endpoint may infer that composite outcome by itself.

---

## 7. Confirmed naming mismatch: `publish_completed` is emitted before deployment readiness is established

`api/deploy.ts` posts to Vercel's deployment-creation endpoint and, on a successful creation response, immediately:

1. records published-site ownership;
2. records product event `publish_completed`;
3. stores `data.readyState` merely as event metadata;
4. records PCL evidence using the more accurate statement `Vercel production deployment created`;
5. returns `readyState` to the client.

There is no server-side wait in this path proving that Vercel has transitioned the deployment to a serving `READY` state before the product event is named `publish_completed`.

### Classification

This is primarily a **semantic/observability mismatch**, not evidence that publishing itself is unauthenticated or fabricated. The endpoint correctly reports Vercel's creation response and separately returns the provider's `readyState`.

### QIR migration rule

Split these facts explicitly:

```text
deployment.created   -> provider accepted and created deployment resource
deployment.ready     -> provider/runtime proved it is serving
site.verified        -> final requested behavior/url verified
run.completed        -> entire mission Outcome Contract passed
```

Do not rename production telemetry during Phase 0; record the migration requirement.

---

## 8. Project `completed` status is lifecycle metadata, not proof

Project State permits `active / paused / completed / archived`.

That is useful project organization metadata. It may be user-directed or application-directed lifecycle state, but it does not carry the execution evidence necessary to prove an Agent Run's mission.

### QIR rule

A Project may contain many Runs. A Project may be marked completed as a workspace lifecycle choice, but that state cannot synthesize `Run.COMPLETE` for unfinished Runs.

Conversely, a Run can complete while the broader Project remains active.

---

## 9. Model-quality `success` is routing evidence, not outcome success

`model_quality_events` records turn-level `success/failure/helpful/not_helpful`, and `model-outcome-routing.js` uses accumulated samples to influence future routing.

This measured feedback is valuable and should be preserved.

The semantic hazard is the existing name “outcome”: a successful model attempt can later produce an artifact that fails verification; a failed primary model can also be rescued by a fallback and end in a verified mission.

### QIR mapping

Keep separate event levels:

```text
model.attempt.completed / model.attempt.failed
step.verification.passed / step.verification.failed
response.helpful / response.not_helpful
run.completed / run.failed_terminal / run.waiting_*
```

Only the last line represents mission/run state.

---

## 10. Current CI/release gates — what they prove

Quantora's CI is already substantially stronger than a unit-test-only release pipeline.

### Blocking `Quantora CI` verify job

The verify job covers:

- typecheck/lint;
- runtime import correctness;
- wiring ratchet;
- full test suite;
- Finance judgment;
- capability-claim truth;
- dead-control checks;
- shop catalog scale;
- production build;
- dependency audit.

These establish **repository/build/policy integrity**. They do not by themselves prove a deployed user mission.

### Blocking browser-release job

Individual browser journey steps are declared `continue-on-error: true`, but the final enforcement step reads every gate outcome and fails the job unless every listed gate succeeded.

The enforced journeys include Travel, Study, Finance, Studio, Coding Desk, guided intake, Preview-ready/Preview-shell and other interaction/regression contracts.

These establish **local production-build behavior under controlled browser scenarios**.

### Branch protection

Current `main` protection requires:

- `Typecheck, tests, build, and audit`;
- `Browser release gates`;
- `Vercel`.

This is a sound base but does not currently require the deployed golden workflow described next.

---

## 11. Deployed golden transactions — strongest current outcome-level evidence, but unevenly blocking

The `Deployed Golden Transactions` workflow contains two important layers.

### Blocking deployed readiness

The readiness gate verifies that the exact deployed commit boots and the inference plane is executable before expensive browser/model work proceeds.

This is **deployment/infrastructure readiness evidence**.

### Calculator + website golden chat transaction

`deployed-golden-transactions.mjs` exercises the real deployed path for the important parts of the mission:

- deployed `/api/chat`;
- inference routing;
- response parsing;
- `/api/preview-compile`;
- rendered iframe;
- user interaction.

The calculator transaction requires the generated app to render `0`, click `1`, and observe `1`. The website transaction requires the generated page to render the expected heading and a visible/clickable CTA. Interaction evidence is recorded.

This is much closer to a **goal-level golden transaction** than a unit/component gate.

### Confirmed release-governance gap

In the workflow, the calculator/website `golden_chat` step is still `continue-on-error: true` and is explicitly reported as **non-blocking**.

By contrast, the deployed shop Preview action gate is blocking.

Current branch protection also does not name the deployed golden workflow as a required status context.

### QIR interpretation

This does **not** mean current releases are untested: the blocking CI/browser/Vercel gates remain extensive.

It does mean that the repository's strongest deployed proof of “prompt -> generated artifact -> compiled runtime -> real interaction” can currently fail without blocking a merge/release through branch protection.

That is inconsistent with the QIR law:

> A release cannot claim an end-to-end capability when its golden transaction stops before the actual verified outcome.

### Phase 0 decision

**Record this as a release-governance migration gap. Do not flip it to blocking in this documentation PR.**

Before QIR runtime cutover, end-to-end golden transactions for promoted capabilities should become blocking only when they are deterministic enough that failure has a clear product meaning and the gate itself has proven stable.

---

## 12. Release evidence taxonomy for QIR

| Gate/evidence | Proves | Does not prove |
|---|---|---|
| typecheck/lint/import gate | code/static/runtime-import integrity | deployed user outcome |
| unit/integration suites | local contract behavior | deployed provider/browser path |
| wiring gate | feature is actually reachable in code | correct real-world outcome |
| capability-claims gate | advertised capability has a backing implementation | implementation succeeds for a real goal |
| browser release journey | production-build UI/component behavior | exact deployed server/provider environment |
| Vercel status | platform produced deployment status | user mission behavior |
| deployed readiness | exact deployment boots + inference control plane ready | generated artifact meets a user goal |
| deployed golden interaction | selected end-to-end user goal works on deployment | all possible goals/domains |
| domain verifier | one artifact/claim/domain criterion is evidenced | whole mission complete |
| Outcome Engine | all required mission criteria/evidence pass | — this is the completion authority |

---

## 13. Target release architecture

QIR should gradually make release gates mirror the same architecture as runtime verification:

```text
CAPABILITY CONTRACT
      |
      v
DETERMINISTIC UNIT/INTEGRATION GATES
      |
      v
LOCAL BROWSER / TOOL CONTRACT GATES
      |
      v
DEPLOYED GOLDEN TASK
      |
      v
OUTCOME VERIFIER
      |
      v
PROMOTION ELIGIBLE
```

Not every feature requires a model-spending deployed golden on every commit. The Resource Governor / release policy can tier them by risk and change surface. But a capability marketed as end-to-end must have at least one maintained golden path that reaches its real verified outcome.

---

## 14. Completion claims QIR must explicitly prohibit

The migration must make these invalid by construction:

- model returned text -> mission complete;
- HTTP 200 -> mission complete;
- tool returned `success` -> mission complete;
- files exist -> software complete;
- compile passed -> software complete;
- Preview rendered -> requested app complete;
- Office file opened -> document mission complete;
- source was fetched -> research claim verified;
- assessment was answered -> mastery verified;
- deployment object exists -> published site ready;
- project metadata says completed -> active Run complete;
- one provider action produced evidence -> multi-action mission complete.

Each may be necessary evidence. None is sufficient unless the Outcome Contract says that exact evidence set satisfies the mission.

---

## 15. Phase 0 decisions locked by this pass

1. **One word, one level:** QIR runtime state uses `COMPLETE` only for mission/Run completion. Lower layers use attempt/operation/verification/step vocabulary.
2. **Outcome Contract remains sovereign.** Domain success feeds it; domain success does not replace it.
3. **Deployment creation and deployment readiness become distinct observations.**
4. **Project completion remains separate from Run completion.**
5. **Model quality remains routing evidence, not mission truth.**
6. **Current blocking CI/browser gates are retained during migration.**
7. **The non-blocking deployed calculator/website golden is a confirmed release-governance gap to close when deterministic/stable promotion criteria are met.**
8. **Do not change CI/release policy inside Phase 0 architecture documentation.** First finish the truth audit, then make the release-policy change as a separately reviewed implementation step.

---

## 16. Remaining Phase 0 work before exit

The audit is now close to the point where the final authority matrix can be closed, but Phase 0 is **not yet complete**.

Remaining work:

- finish consequential side-effect inventory across executable endpoints;
- reconcile all mainline changes since the first checkpoint into the final authority table;
- produce the final repository-wide `KEEP / MOVE / WRAP / DERIVE / DELETE` migration table;
- answer all twelve Phase 0 exit questions with direct evidence;
- identify any unresolved architecture contradiction that would make Phase 1 unsafe;
- only then decide whether PR #446 is ready for architecture review/merge.
