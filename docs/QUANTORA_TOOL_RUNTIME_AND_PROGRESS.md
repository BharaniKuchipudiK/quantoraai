# Quantora Tool Runtime, Persistence & Continuous Progress

> **Goal:** Quantora should behave like a persistent digital worker, not a single model call. A user gives it an outcome. Quantora chooses the right Skill, invokes the right tools, observes real evidence, repairs failures, resumes after interruption, and keeps going until the completion contract is satisfied or a genuine human decision is required.

This document extends the Skills roadmap with the execution substrate required to make Skills reliable in practice.

---

## 1. The core idea: models think; tools do; the Governor decides when the job is done

Quantora must never depend on one long model response surviving from beginning to end.

The runtime should treat a model call as **one bounded reasoning step** inside a durable work loop:

**Intent → Plan → Select Skill → Select Tool → Act → Observe → Evaluate → Recover → Verify → Deliver → Prove**

A model timeout, provider timeout, browser crash, shell failure, GitHub CI failure, deployment failure or worker restart must not erase the job.

The durable run owns the job. Models and tools are replaceable workers inside that run.

### Architectural consequence

A Quantora task should be able to survive:

- model-provider timeout
- OpenRouter timeout / rate limit / provider outage
- network interruption
- browser worker crash
- local/sandbox worker crash
- GitHub API transient failure
- CI failure
- Vercel build failure
- process restart
- lease expiry
- laptop/browser refresh by the user

The run resumes from durable evidence, not from memory of a still-running model call.

---

## 2. Tool Runtime

Skills should not implement integrations directly. They should call a common governed **Tool Runtime**.

A Tool is a versioned capability with a strict input/output contract, permission policy, timeout policy, evidence output and idempotency strategy.

Example definition:

```text
toolId
version
name
capability
inputSchema
outputSchema
requiredPermissions
executionBoundary
timeoutPolicy
retryPolicy
idempotencyPolicy
evidenceProduced
healthProbe
costClass
riskClass
```

The Skill asks for a capability. The Tool Runtime resolves the best available implementation.

Example:

```text
Skill need: inspect_repository
        ↓
Tool Runtime
        ↓
Git clone/fetch workspace tool
        ↓
Durable observation + files + commit SHA
```

This keeps Skills portable and prevents every workspace from building its own fragile connector logic.

---

## 3. Initial high-value tool families

### 3.1 Repository / Git tools

Coding Skills need real repository manipulation rather than simulated code snippets.

Capabilities:

- clone / fetch repository into isolated workspace
- checkout exact branch / commit / PR head
- inspect status / diff / history
- create branch
- read / search files
- edit files
- apply patch
- stage / commit
- push branch
- inspect PR metadata
- inspect changed files
- read PR comments / reviews
- create/update PR
- inspect exact-head CI
- merge only against expected head SHA

Every observation must record repository, branch and exact SHA.

### 3.2 Shell / command execution

Capabilities:

- run package-manager commands
- typecheck / lint / test
- build
- run targeted test files
- execute repository scripts
- run local dev / production-like servers
- inspect exit code, stdout and stderr

Requirements:

- isolated execution workspace
- command allow/deny policy
- bounded timeouts per command
- output truncation with artifact retention
- cancellation
- deterministic exit evidence
- no silent privilege escalation

### 3.3 Browser / UI verification

Capabilities:

- navigate web applications
- click / type / select
- inspect page state
- verify routes and visible UI
- capture screenshot evidence
- exercise responsive breakpoints
- run business/user journeys

The browser is a verifier and execution tool, not merely a screenshot generator.

### 3.4 HTTP / API tools

Capabilities:

- authenticated API requests through approved credentials
- health probes
- webhook calls
- structured response validation
- retry-safe GET/probe behavior

### 3.5 File / artifact tools

Capabilities:

- inspect uploads
- parse structured files
- create/edit documents, spreadsheets and presentations
- materialize build artifacts
- persist evidence and generated outputs

### 3.6 Search / retrieval tools

Capabilities:

- web search
- project-file search
- repository code search
- connected-source search
- citation/provenance capture

### 3.7 Deployment tools

Capabilities:

- inspect deployment target
- create preview deployment
- inspect build logs
- promote / verify production deployment through existing governed delivery policy
- verify production URL and health

### 3.8 Future integration tools

After Skills and Tool Runtime are stable:

- Gmail
- Google Drive / Docs / Sheets / Slides
- Google Calendar
- cloud storage
- issue trackers
- knowledge bases

These remain permissioned Tools, not globally available context.

---

## 4. The persistent work loop

A run is a durable state machine, not an HTTP request.

Suggested lifecycle:

```text
QUEUED
  ↓
INTENT_RESOLVED
  ↓
SKILL_ASSIGNED
  ↓
REQUIREMENTS_READY
  ↓
PLANNED
  ↓
ACTING
  ↓
OBSERVING
  ↓
EVALUATING
  ├── needs_more_work → ACTING
  ├── recoverable_failure → RECOVERING → PLANNED/ACTING
  ├── needs_user_input → WAITING_FOR_USER
  └── candidate_complete → VERIFYING
                               ├── failed → RECOVERING
                               └── passed → DELIVERY_POLICY
                                               ├── no delivery needed → PROVING
                                               └── deliver → DELIVERING → PROVING
                                                                     ↓
                                                                  COMPLETE
```

The durable snapshot should include at least:

```text
runId
projectId
workspaceId
skillId + skillVersion
originalIntent
completionContract
currentStage
planVersion
activeActionId
activeToolInvocationId
observations[]
evidenceRefs[]
recoveryCount
lastHeartbeatAt
leaseOwner
leaseExpiresAt
modelAttempts[]
toolAttempts[]
verificationState
deliveryState
terminalState
```

---

## 5. No single model timeout can kill the job

Provider calls must be disposable.

### Rule

**A model response is never the source of durability.**

Before a model/tool action begins, the Governor persists:

- current run state
- action intent
- action ID
- expected output/evidence
- lease ownership

After completion, the result is persisted before the next action begins.

If the call dies:

1. lease expires or failure is observed
2. replacement worker loads durable snapshot
3. evaluator classifies the failed step
4. recovery policy chooses retry / fallback / replan / user input
5. execution continues

### Provider fallback

Fallback should be capability-based, not a blind provider carousel.

Example:

```text
need: code-reasoning, medium context, tool plan
preferred model → timeout
fallback model with same required capability → retry bounded once
still unavailable → checkpoint + delayed retry / alternate path
```

Never repeatedly hammer a broken provider.

Use circuit breakers, cooldowns and route health.

---

## 6. Self-healing

Self-healing is **diagnose → choose repair → verify repair**, not simply retrying the same operation.

### Failure taxonomy

Every failure should be classified into a small deterministic vocabulary where possible:

- transient_network
- provider_timeout
- provider_rate_limit
- provider_unavailable
- auth_or_permission
- invalid_tool_input
- dependency_install
- compile_error
- test_failure
- runtime_error
- browser_assertion
- stale_repository_head
- merge_conflict
- deployment_build
- production_health
- missing_requirement
- semantic_uncertainty
- policy_block
- unknown

### Recovery policy examples

**Compile error**

1. capture compiler diagnostics
2. map diagnostics to changed files
3. invoke repair reasoning with exact evidence
4. patch minimal surface
5. rerun targeted compiler/test
6. only then rerun broader gates

**PR CI failure**

1. verify exact head SHA
2. identify failed job and failed step
3. retrieve relevant logs
4. determine whether failure is product defect, test-contract mismatch or infrastructure flake
5. change code only for a real defect
6. rerun exact-head checks

**Infrastructure flake**

Retry the failed infrastructure step/job within a strict budget without modifying product code.

**Deployment failure**

Inspect build logs, classify, repair only the deployment blocker, redeploy and verify exact commit.

### Recovery budgets

Recovery must be persistent but bounded.

Example:

```text
same_action_retry: 1–2
same_failure_signature: max 2 repair cycles
full_replan: max 2
provider fallback: bounded by route policy
human escalation: when policy, permissions, ambiguity or exhausted recovery requires it
```

Persistent perseverance is not an infinite loop. It is **bounded autonomous recovery with durable continuation**.

---

## 7. Workspace execution environments

For Coding, a Skill should be able to request an isolated **Worktree/Workspace Runtime**.

A workspace can contain:

- repository checkout
- exact base/head SHAs
- dependency cache
- terminal processes
- local service ports
- generated artifacts
- browser session against local server
- evidence files

### Example website workflow

```text
Senior Web Product Engineer Skill
        ↓
Requirement discovery
        ↓
Repo tool: clone/open target repo
        ↓
Shell: install dependencies
        ↓
File tools: inspect architecture
        ↓
Plan
        ↓
File edit / patch tools
        ↓
Shell: targeted tests
        ↓
Browser: visual/function checks
        ↓
Repair loop if needed
        ↓
Git: commit/push
        ↓
GitHub: PR + exact-head CI
        ↓
Governor evaluation
        ↓
Auto Deliver policy
        ↓
Vercel deployment
        ↓
Production browser/health proof
        ↓
DONE
```

This is how the phrase **“Senior Web Product Engineer assigned”** becomes a real operating capability instead of persona copy.

---

## 8. Tool selection and planning

A Skill should declare the capabilities it may need; the planner chooses tools based on observed state.

Example:

```text
User: Fix PR #812 and ship it.

Intent: repair_and_deliver_pull_request
Skill: Debugger & Recovery Engineer
Required capabilities:
  repository.read
  repository.write
  shell.execute
  github.pr.read
  github.actions.read
  github.pr.merge
  deployment.read
  browser.verify

Plan:
  1. inspect PR exact head
  2. inspect required CI
  3. diagnose failed step
  4. reproduce/target locally if possible
  5. minimal fix
  6. targeted validation
  7. push
  8. exact-head CI
  9. merge when green
 10. verify exact production deployment
 11. prove live health
```

The planner may revise the plan when observations invalidate assumptions.

---

## 9. Continuous progress UX — replace the spinner

The user should never stare at a generic animation while twenty seconds of real work happens invisibly.

Quantora should expose a **continuous activity stream** based on real runtime events.

### Principle

Show **observed actions and state changes**, not private reasoning and not invented activity.

Good:

- Understanding the request
- Assigned Senior Web Product Engineer
- Checking project files
- Repository loaded at `abc1234`
- Running typecheck
- Typecheck passed
- Running 42 tests
- 41 passed · 1 failed
- Diagnosing failed checkout test
- Applied a focused fix
- Re-running checkout test
- Checkout test passed
- Waiting for GitHub CI
- CI 3/4 checks passed
- Browser release gate still running
- All required checks passed
- Deploying production
- Production is live
- Verifying health
- Done · verified

Bad:

- Thinking deeply…
- Carefully reasoning…
- Doing magic…

The UI must be truthful and evidence-backed.

---

## 10. Activity event model

The backend should emit durable, user-safe events such as:

```text
run.started
intent.resolved
skill.assigned
requirements.missing
requirements.ready
plan.created
plan.revised
tool.started
tool.progress
tool.completed
tool.failed
observation.recorded
evaluation.updated
recovery.started
recovery.action_selected
verification.started
verification.check_passed
verification.check_failed
delivery.scheduled
delivery.ci_waiting
delivery.merged
deployment.building
deployment.ready
production.verified
run.waiting_for_user
run.completed
run.failed
```

Each event can carry:

```text
timestamp
runId
stage
safeLabel
detail
progressCurrent
progressTotal
evidenceRef
recoverable
```

This activity stream should be stored durably so refresh/reconnect shows the same history.

---

## 11. Rendering pattern

Instead of one orange spinner and then a large final dump, use three layers.

### Layer A — compact live status

At the assistant turn location:

```text
✦ Building your result
  Running verification · 18s
```

### Layer B — expandable activity trail

```text
✓ Requirements understood
✓ Repository loaded
✓ Built responsive pages
● Running browser checks
  7 / 11 checks passed
○ Production deployment
```

The user can expand this if interested. Do not force operational noise into every conversation.

### Layer C — streaming useful output

As soon as useful answer/content is available, render it progressively.

For Study:

```text
Tutor request sent
Waiting for first content · 2s
Answer is arriving…
[paragraph begins streaming]
Preparing visual explanation…
[visual appears when ready]
```

For Coding:

```text
I found the failing CI step.
[short explanation appears]

Fixing `checkout.ts`…
[diff/evidence card appears]

Targeted test passed.
Waiting on exact-head CI…
```

The platform must not hold the entire final response merely because secondary enrichment is still running.

---

## 12. Progress must survive reconnects

The activity stream is derived from durable runtime events, not local animation state.

If a user:

- refreshes the browser
- closes and reopens a Project
- switches devices
- returns 20 minutes later

Quantora should reconstruct:

- what was requested
- assigned Skill
- current stage
- completed actions
- current blocker/wait
- latest evidence
- whether recovery is active

A long-running job should feel like a persistent project worker, not a chat request that disappears when the socket closes.

---

## 13. Streaming architecture

Recommended split:

1. **Durable event log** — canonical truth
2. **Realtime transport** — SSE/WebSocket/subscription for low-latency updates
3. **Replay endpoint** — fetch events after a cursor/sequence
4. **UI reducer** — converts raw events into calm user-facing status

Transport can disconnect without losing work because the event log remains canonical.

### Event sequence

Every event receives a monotonically increasing sequence number for the run.

Client reconnect:

```text
GET /runs/{runId}/events?after=183
```

Then resumes live subscription.

---

## 14. Heartbeats, leases and stalled-run recovery

A worker executing a long action must renew a durable lease/heartbeat.

If heartbeat expires:

1. Governor marks action ownership stale
2. replacement worker examines activeActionId
3. it must not blindly replay side effects
4. classify whether action is observable/idempotent
5. recover/replan

This extends the continuity protections already implemented in Quantora.

### Stall detector

Potential triggers:

- no heartbeat beyond lease threshold
- provider call exceeds timeout budget
- tool process silent beyond tool-specific budget
- CI/deployment wait exceeds expected window

Response:

- emit `run.stalled`
- probe actual external state
- recover based on evidence
- show truthful UI: `This step is taking longer than usual — checking its status.`

---

## 15. Idempotency and side-effect safety

Never equate persistence with repeated side effects.

Before operations such as:

- send email
- merge PR
- create payment
- create deployment
- publish artifact
- update external record

persist an idempotency key / scheduling marker first.

On resume, observe whether the external action already happened before reissuing it.

The #727 Auto Deliver scheduling marker is the pattern to generalize.

---

## 16. Human checkpoints

Autonomy should stop for genuinely human decisions, for example:

- destructive action requiring consent
- missing credentials/permission
- ambiguous business requirement that materially changes outcome
- financial/legal/high-impact approval
- exhausted bounded recovery

The UI should ask one precise question and preserve all completed work while waiting.

Example:

> Checkout is implemented and verified in preview. Stripe production credentials are not connected. Connect Stripe, or choose “launch without payments” to continue.

Not:

> Something went wrong. Please try again.

---

## 17. Tool observability

For every tool family collect:

- invocation count
- success/failure rate
- P50/P95 duration
- timeout rate
- retry count
- recovery success rate
- common failure signatures
- cost where measurable

For every Skill collect:

- time to first useful output
- total time to verified completion
- user-input wait time
- autonomous recovery count
- completion rate
- verification failure rate
- delivery success rate

This makes “platform feels slow” measurable rather than anecdotal.

---

## 18. Capability routing rather than vendor coupling

Quantora should request capabilities, not vendors.

Examples:

```text
reasoning.code.high
reasoning.study.medium
web.search
repository.workspace
browser.interactive
image.generate
python.execute
document.create
email.read
calendar.write
```

The runtime resolves the permitted implementation based on:

- user/account configuration
- provider health
- capability quality
- latency
- cost policy
- privacy/data boundary
- current circuit-breaker state

This reduces dependency on any one model/provider and helps the platform continue when a route is degraded.

---

## 19. What to borrow from modern AI work systems

We should not depend on undocumented/private internals of another product. The useful public pattern is clear: advanced AI systems combine models with **function/tools, web/search/retrieval, file access, computer/browser interaction and structured execution environments** rather than expecting the model to perform every action in text.

Quantora's differentiator should be the governed layer above those capabilities:

- durable jobs
- Skills
- deterministic evidence
- self-recovery
- exact completion contracts
- controlled side effects
- transparent progress
- delivery proof

Tools are necessary. The moat is how Quantora orchestrates them until the outcome is complete.

---

## 20. Implementation roadmap extension

The Skills roadmap should now include these execution slices.

### Tool Runtime Foundation

- versioned Tool registry
- schemas and permission metadata
- timeout/retry/idempotency policy
- durable invocation records
- evidence references
- health probes

### Coding Workspace Tools

- isolated repository checkout/worktree
- file read/search/edit/patch
- shell/process execution
- local server lifecycle
- targeted test execution
- Git operations
- GitHub PR/CI actions
- browser against local/preview/prod

### Persistent Job Runner

- durable queue
- leases/heartbeats
- event log
- reconnect/resume
- stalled-run detector
- bounded retry/fallback/replan

### Self-Healing Engine

- normalized failure taxonomy
- diagnostic evidence collection
- recovery policy registry
- repair → targeted verify → broader verify
- escalation rules

### Continuous Progress UI

- replace generic spinner-only experience
- realtime activity event rendering
- compact + expandable progress
- streaming useful output immediately
- reconnect/replay
- visible recover/verify/deliver stages

### Senior Web Product Engineer proving vertical

The proving vertical must use the Tool Runtime rather than custom one-off code:

**Requirements → repo workspace → build → local checks → browser verify → repair → GitHub → exact-head CI → merge → deployment → production proof.**

---

## 21. Definition of success

A user should eventually be able to say:

> “Fix this GitHub PR and get it to production.”

Then leave the browser.

Quantora should be able to:

- load the exact PR head
- inspect CI
- reproduce/diagnose the real failure
- make the smallest correct repair
- validate locally
- push
- watch exact-head CI
- recover from a flaky job without changing code
- repair another genuine failure if one appears
- merge only when policy allows
- watch production deployment
- verify the exact commit live
- preserve the entire evidence trail
- notify the user that the outcome is actually complete

Likewise, a student should be able to ask a difficult question and immediately see a responsive tutor experience while enrichment continues rather than waiting for a blank UI and receiving a final wall of text.

The long-term target is not **longer model calls**.

It is **durable, tool-using, self-healing work that keeps moving until the verified outcome is reached.**
