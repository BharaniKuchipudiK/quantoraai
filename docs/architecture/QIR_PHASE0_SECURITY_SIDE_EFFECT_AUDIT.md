# QIR Phase 0 — Security and Consequential Side-Effect Audit

Status: **IN PROGRESS — P0 SECURITY FINDING RECORDED**  
Audit target: production execution spine on `main` at `c6dd9e93276a3ab9f2c6c76c9c5435211cc162bf`  
Architecture authority: `QUANTORA_INTELLIGENCE_RUNTIME.md`  
Tracked blocker: **#452 — shared GitHub write credential subject-authorization gap**

This pass answers one narrow but important Phase 0 question: **which current capabilities can make consequential state changes, who is authorized to invoke them, and what evidence/approval seam exists before and after the side effect?**

The audit is based on executable code, not capability labels or UI presence.

---

## 1. Executive finding

Quantora already has a good reusable pattern for consequential external actions:

```text
active authenticated user
-> exact first-party human confirmation where required
-> PCL action authorization
-> provider call
-> provider result
-> execution evidence
```

That pattern is implemented by `guardPclSideEffect(...)`, `pclHumanConfirmation(...)`, and `recordPclExecutionEvidence(...)` and is used by Vercel publishing, custom-domain connection and GCP deployment.

The main exception found is the GitHub write path.

`github-create-pr` and `github-merge-pr` require:

- an active Quantora session;
- a configured shared server GitHub token;
- a repository on `GITHUB_ALLOWED_REPOS`.

But they do **not** require that the signed-in Quantora user is an administrator, a maintainer/member of the target GitHub repository, the owner of a user-bound GitHub installation, or otherwise authorized to exercise Quantora's shared GitHub credential.

That is not merely architectural inconsistency. It is a **subject-authorization defect across a shared privileged credential**.

Issue #452 records the security blocker separately from this behavior-neutral QIR PR.

---

## 2. Authorization vocabulary used by this audit

The existing controls answer different questions and must not be conflated.

| Control | Question it answers | What it does **not** answer |
|---|---|---|
| `requireActiveSession` | Is this a signed-in, non-blocked Quantora account? | Is this user authorized to mutate the target external resource? |
| `GITHUB_ALLOWED_REPOS` | May Quantora's shared token ever write to this repository? | May **this Quantora user** use that token against it? |
| PCL exact-action approval | Did the user approve this exact consequential action? | Does the user possess the external-resource authority being delegated? |
| provider credential | Can the platform technically perform the operation? | Should this user be allowed to cause it? |
| provider success | Did the external provider accept/perform the operation? | Is the user's whole mission complete? |

QIR must preserve all five distinctions.

---

## 3. Vercel publish/share-preview — strong existing pattern

`api/deploy.ts` requires an active session and computes an owner-scoped deployment project name.

Before calling Vercel it constructs an exact PCL action using:

- tool identity (`vercel.preview` or `vercel.deploy`);
- project/content hash;
- external side-effect classification;
- risk + reversibility;
- explicit first-party confirmation source;
- stronger approval requirement for production publish.

The provider call is deadline-bounded. On success, ownership metadata is recorded and PCL execution evidence is written when durable Outcome Memory exists.

### QIR disposition

**KEEP/PROMOTE.** This is the seed of the universal external Tool Executor.

### Separate completion correction

The operation produces `deployment.created` evidence. It does not by itself prove `deployment.ready`, `site.verified`, or `run.completed`.

---

## 4. Custom-domain connection — strong existing pattern

`api/domains.ts` uses the same PCL side-effect seam for domain attachment and scopes the operation to a published-site owner.

The important architectural property is that provider capability alone is insufficient: the user/resource ownership check and exact action authorization exist before the Vercel mutation.

### QIR disposition

**KEEP/PROMOTE** as `domain.connect` behind the universal side-effect executor.

---

## 5. GCP Cloud Run deployment — strong existing pattern

`api/deploy-gcp.ts` requires active authentication, exact confirmation through `gcp-deploy-button`, PCL authorization, and provider evidence after Cloud Build is triggered.

The adapter itself performs several provider-level mutations (GCS bucket/object and Cloud Build/Cloud Run work), but these are subordinate operations of one approved deployment action.

### QIR disposition

**KEEP/PROMOTE** the adapter; represent its provider sub-operations as attempt/observation records under one QIR Tool invocation.

---

## 6. GitHub create PR — authenticated resource allowlist, missing subject authorization

### Confirmed execution path

`vercel.json` rewrites `/api/github/create-pr` into `api/pipeline.ts`.

The stage:

1. calls `requireActiveSession(...)`;
2. requires `GITHUB_TOKEN` / `GITHUB_PAT` / `GH_TOKEN`;
3. validates the repository against `GITHUB_ALLOWED_REPOS`;
4. calls `createGithubPullRequest(...)` with the shared server credential.

The Coding Desk exposes Create PR as a first-party button. That UI intent is useful evidence of user intent, but the backend does not route the action through `guardPclSideEffect(...)` and, more importantly, does not prove the caller owns/maintains the target GitHub resource.

### Security classification

**P0 subject-authorization gap when a privileged shared token is configured.**

A repo allowlist constrains the object; it does not authorize every Quantora account as a principal on that object.

### Immediate containment requirement

Shared-token GitHub writes must be restricted to administrators or another explicit server-side principal binding until user/repository-bound GitHub authorization exists.

### Permanent QIR mapping

`github.pull_request.create`:

- side effect: external;
- reversibility: partial/reversible;
- authorization: resource principal + exact action policy;
- observation: created PR number/URL/head/base/provider response;
- completion: operation evidence only.

---

## 7. GitHub merge PR — confirmed higher-risk authorization defect

### Confirmed execution path

`vercel.json` exposes `/api/github/merge-pr` and rewrites it into the pipeline.

The server stage requires the same three controls as Create PR — active Quantora account, configured shared token, allowlisted repository — and then calls `mergeGithubPullRequest(...)`, which sends GitHub's merge `PUT` using the shared token.

`docs/GITHUB.md` explicitly documents the route and request shape. The fact that there is currently no one-click desk merge button does **not** make the server capability unreachable.

### Impact boundary

If the configured shared token can merge PRs in an allowlisted repository, a normal signed-in Quantora account is currently sufficient to ask the server to perform that merge.

GitHub's own branch protection/checks still apply unless the configured credential has bypass capability. Those controls reduce what GitHub will accept; they do not repair Quantora's missing principal authorization.

### Security classification

**P0 / release blocker for broad GitHub-write enablement.** Tracked in #452.

### Permanent QIR requirements

`github.pull_request.merge` must require all of the following:

1. an explicitly authorized external-resource principal;
2. exact first-party approval immediately before the action;
3. `guardPclSideEffect(...)` or its QIR successor;
4. a bound repository + PR identity;
5. an expected PR head SHA so approval cannot silently apply to a later revision;
6. idempotency/duplicate protection where practical;
7. provider-confirmed merge evidence;
8. no inference from merge success to mission completion.

Until that exists, merge must remain fail-closed for ordinary users and must not be promoted in the UI.

---

## 8. Travel transactions — correctly fail-closed

Travel includes names for transactional actions such as reservation/booking, but executable tool code deliberately returns `TRANSACTION_DISABLED` and states that nothing was booked, purchased, ticketed, scheduled or monitored.

Tests assert the disabled path remains non-executing.

### QIR disposition

**KEEP FAIL-CLOSED.** Future booking/payment work must enter QIR as a transactional side-effect class with explicit approval, idempotency and provider confirmation; never convert today's disabled tool names directly into live provider calls.

---

## 9. Internal user-owned mutations

Several endpoints mutate Quantora-owned state rather than an external third-party resource:

- Project save/delete/resource/session sync;
- Outcome State + Cognitive Ledger writes;
- Study Notebook create/update/delete;
- Study onboarding/self-confidence/evidence state;
- Finance profile/user-context writes;
- account export/delete.

These are generally owner-scoped using the authenticated session subject and/or optimistic versioning.

They are still QIR tools when used inside an Agent Run, but they are a different risk class from delegating a shared external credential.

### QIR disposition

**KEEP owner scoping; wrap as internal reversible/destructive tools according to operation.**

Account deletion remains a destructive user action and appropriately requires explicit confirmation at its dedicated endpoint; it should not become autonomously callable by a planner.

---

## 10. External side-effect inventory — current production finding

| Capability | External mutation? | Subject/resource authorization | Exact approval seam | Provider evidence | Finding |
|---|---:|---|---|---|---|
| Vercel share preview | yes | active user + owner-scoped project name | PCL supervised | yes | strong pattern |
| Vercel production publish | yes | active user + owner-scoped project name | PCL approval | yes | strong pattern |
| custom domain connect | yes | published-site ownership | PCL approval | yes | strong pattern |
| GCP deploy | yes | active user + deployment scope | PCL approval | yes | strong pattern |
| GitHub Create PR | yes | **repo allowlist only; caller principal not bound** | no common PCL seam | GitHub response | **security gap #452** |
| GitHub Merge PR | yes, hard-to-reverse | **repo allowlist only; caller principal not bound** | no exact approval | GitHub response | **P0 security gap #452** |
| Travel booking/payment | no — disabled | n/a | n/a | none | correctly fail-closed |
| Stripe user checkout/account actions | no executable production write path found in this pass | n/a | n/a | n/a | do not advertise as live transaction authority |

Model-provider requests, search/read APIs and telemetry writes are excluded from this table unless they change an external user/business resource.

---

## 11. Shared credential law for QIR

A universal invariant is now required:

> **Possession of a platform credential is never authorization for every authenticated user to exercise it.**

For each side-effecting Tool invocation, QIR must separately prove:

```text
WHO        authenticated principal
CAN        principal-to-resource authorization
WHAT       exact intended action + bounded arguments
APPROVED   human/policy gate appropriate to risk
EXECUTED   provider actually performed the operation
EVIDENCED  immutable provider/resource reference returned
VERIFIED   downstream criterion checked when required
```

No stage may collapse two of these facts into one boolean.

---

## 12. Immediate security work outside PR #446

Issue #452 is intentionally separate because PR #446 is an architecture/truth-audit PR.

Required was-red cases for the security fix:

- ordinary active account + valid shared token + allowlisted repo -> **Create PR denied**;
- ordinary active account + valid shared token + allowlisted repo -> **Merge denied**;
- blocked/unsigned account -> denied as today;
- authorized administrator/principal -> operation can reach adapter;
- non-allowlisted repository -> denied even for privileged principal;
- merge without exact confirmation -> denied once merge is productized;
- expected-head mismatch -> denied before merge;
- provider error -> no false execution evidence.

---

## 13. Phase 0 conclusion from this pass

The side-effect architecture does **not** need a second approval framework.

The correct direction is:

- **preserve PCL's exact-action side-effect guard**;
- add explicit subject/resource authorization as a first-class Tool Executor input;
- wrap every external mutation behind the same QIR protocol;
- keep Travel transactions disabled until that protocol exists;
- fix the GitHub shared-token authorization defect before broadening that capability;
- treat provider success as Observation evidence, never as Run completion.
