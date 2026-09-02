# QIR Phase 0 — Architecture Doctrine Alignment and Precedence

Status: **REVIEWED — EXECUTION AUTHORITY PRECEDENCE LOCKED**  
Current production baseline reviewed through `main` `2bfdcb2c6b93bdb9241cd09f3fee621867354832`  
Canonical execution authority: `QUANTORA_INTELLIGENCE_RUNTIME.md`

Phase 0 cannot exit merely by writing a new architecture document. It must also answer whether older architecture, PCL, roadmap and domain documents still claim the same authority under different names.

This review distinguishes **compatible scoped truths** from **actual execution-authority conflicts** and locks precedence without deleting useful domain doctrine.

---

## 1. Precedence rule

Quantora has several legitimate architecture documents because they govern different truth classes.

The precedence is now explicit:

1. **QIR is canonical for execution mechanics** — Agent Run identity/state, executable plan cursor, Step/Attempt lifecycle, global recovery/stopping, Run/Step/recovery budgets, artifact generation/checkpoint promotion, and mission completion transition.
2. **PCL Constitution / Cognitive Kernel remain canonical for cognition and governance** — mission understanding, semantic continuity, decisions/rejections/corrections, human gates, execution authorization policy, consented memory, and cognitive evidence lineage.
3. **Domain truth layers remain canonical for domain facts** — e.g. Study learner/mastery evidence, Finance deterministic calculations/data freshness, Research source verification, Coding artifact/runtime verification.
4. **`ARCHITECTURE.md` remains canonical for deployed topology and module homes** — Vercel/serverless topology, module boundaries, file locations and current hot paths. A module being the “single home” for a concern does not make it the sovereign Agent Run authority.
5. **Roadmaps and blueprints express product direction**. They may not override shipped security, PCL governance, QIR runtime authority, or domain evidence contracts.

Short form:

> **PCL decides what should happen and under what human/governance constraints. QIR durably owns what is happening, what happened, what happens next, and whether the mission is complete. Domain verifiers decide whether their local claims are true.**

---

## 2. PCL Cognitive Kernel — compatible brain, one stale persistence sentence

`docs/PCL_COGNITIVE_KERNEL.md` is strongly aligned with QIR in its core doctrine:

- models are replaceable generators;
- adapters execute capabilities;
- PCL owns mission understanding/continuity, judgment history and human governance;
- browser SessionContext is not durable authority;
- consequential side effects pass through a shared authorization seam;
- evidence is required before claiming an external action happened.

Those are QIR inputs/invariants, not competing runtime machinery.

### The one statement that must be scoped

The document also says:

> “No second database is introduced. Existing Outcome State / Project persistence remains the authoritative durable store.”

That statement was correct for the **PCL memory implementation phase**: PCL was not supposed to invent a second semantic-memory database.

It is **not** authoritative for QIR operational persistence.

Phase 0 established that Outcome State is consented semantic memory and Project State is durable project continuity; neither stores the complete active execution machine. Reusing either as the Agent Run journal would incorrectly couple operational reliability to semantic-memory consent/retention and would mix project memory with attempt/recovery mechanics.

### Locked interpretation

- “no second database” continues to mean **no duplicate PCL semantic-memory authority**;
- QIR may add a **separate operational Run journal/storage schema** because it is a different truth class and retention contract;
- QIR should reference/projection-write selected semantic outcomes into PCL/Project state, not replace those stores.

This is a scope correction, not a rejection of the PCL architecture.

---

## 3. PCL Constitution — compatible if “Act/Verify” are cognitive governance, not Run ownership

`docs/pcl/PCL_CONSTITUTION.md` protects:

`Understand -> Judge -> Act -> Verify -> Remember`

and states that PCL owns continuity, judgment, human governance and the definition of the outcome.

This remains canonical.

The words **Act** and **Verify** do not mean that PCL becomes the durable executor or the universal verifier implementation. Under QIR:

- PCL/Cognition authorizes or selects the policy-level action;
- QIR creates/persists the Step and invokes the Model/Tool Fabric;
- the responsible domain/tool verifier produces evidence;
- QIR Outcome Engine applies the mission Outcome Contract;
- PCL may then remember the verified outcome transition according to its memory policy.

The Constitution's rule that every side-effect adapter passes the shared PCL execution-authorization seam is promoted into QIR's Tool Executor, not superseded.

### Completion wording

The Constitution says PCL owns “the definition of the outcome” and should “stop generating new work when the outcome is achieved.”

Locked interpretation:

- PCL/Outcome State may own or help formulate **Definition of Done / Outcome Contract semantics**;
- only QIR Outcome Engine owns the executable durable transition to `run.completed`;
- PCL consumes that verified transition as cognitive/semantic evidence.

No second completion authority is created.

---

## 4. Communication Layer — predecessor architecture, mostly maps directly into QIR

`docs/architecture/communication-layer.md` already states that Quantora is a model-independent outcome system and defines Understand, Remember, Anticipate, Govern, Verify and Learn responsibilities.

Its request lifecycle and “Orchestrator v1” are a predecessor vertical slice of the QIR control plane.

### Canonical Outcome State is not the Agent Run journal

The document names a server-side `OutcomeState` as “canonical outcome state.” That remains canonical **semantic outcome state** for goal/DoD/constraints/decisions/artifact references/safety/memory.

It is not the QIR operational journal because it does not own the complete:

- Plan/Step cursor;
- model/tool Attempt ledger;
- normalized failures/recovery state;
- idempotency/continuation state;
- Run and recovery budgets;
- artifact candidate/promotion chain;
- worker-resume event cursor.

### Orchestrator v1 disposition

- intent/risk classification -> **KEEP/WRAP into Cognition**;
- next-best-action policy -> **KEEP as Cognition proposal/policy**;
- capability router -> **KEEP/WRAP into Model/Tool Fabric**;
- confirmation gates -> **KEEP/PROMOTE PCL governance**;
- tool evidence -> **KEEP/PROMOTE as QIR Observation/Evidence**;
- request-lifetime orchestration as the whole mission runtime -> **MOVE to Durable Agent Runtime**.

So QIR is the completion of this architecture, not a competing product thesis.

---

## 5. `ARCHITECTURE.md` — topology/module ownership, not durable control-plane sovereignty

`ARCHITECTURE.md` correctly describes the system that actually ships today:

- Vercel serverless request lifetime;
- `pipeline.ts`/`chat-handler` hot paths;
- conversation navigator;
- model-routing modules;
- build verifier/repair modules;
- provider and security boundaries.

Its “single home per concern” table remains useful for **code ownership**.

QIR does not mean copying those implementations into a new directory.

Examples:

- model routing can stay physically in its current module while QIR Model Fabric invokes it;
- `conversation-engine.ts` can remain the home of conversation-move logic while no longer owning the durable Run cursor;
- `verify-build.ts` remains the build verifier while the Outcome Engine decides how that evidence affects the mission;
- `repair.ts` remains repair mechanics while QIR Recovery decides whether repair is the next attempt.

Therefore there is no need for a rewrite to make the topology document “look QIR-shaped.” Authority changes before file locations do.

---

## 6. Product/roadmap north stars — metrics are not runtime completion contracts

Several roadmap/product documents use “north star” for a product metric or local experience principle. Examples include:

- weekly users who “complete something meaningful”;
- proactive-suggestion acceptance;
- percent of sessions that materially advance a real-world goal;
- Study conversation-first UX.

These are compatible product/UX metrics, but they must not be used as QIR completion evidence by definition.

In particular, analytics proxies such as:

- Preview opened;
- publish event emitted;
- three prompts in a session;
- suggestion accepted;

may be useful engagement/product signals but are not equivalent to `run.completed`.

QIR completion remains evidence-backed Outcome Contract satisfaction.

---

## 7. Study architecture — domain-local north stars are compatible

Study documents explicitly resist creating a second learner model/orchestrator and maintain separate canonical knowledge, learner evidence and mastery-estimate semantics.

That is exactly the right QIR relationship:

- Study truth/mastery store remains authoritative for Study evidence;
- Study planning/adaptive logic remains a domain capability/verifier;
- QIR owns cross-domain Run mechanics;
- Study verifier evidence can satisfy Study-specific clauses of a mission Outcome Contract;
- engagement, notebook activity or self-report do not become mastery proof merely because the Run uses them.

No Study rewrite is implied.

---

## 8. Local “orchestrator” names are not automatically conflicts

The repository uses “orchestrator” for several bounded implementations, e.g. market-data ingestion and Travel tool execution.

A local orchestrator is compatible when it owns a **bounded adapter-internal workflow** such as:

- fetch several market-data providers and persist normalized rows;
- resolve one Tool invocation through provider-specific substeps;
- compile one Office artifact deterministically.

It conflicts only if it claims sovereignty over the **whole user mission** — Run lifetime, global recovery, global budget, or mission completion.

QIR should not rename every local orchestrator. It should wrap them as atomic/compound Tools with explicit observations and failure boundaries.

---

## 9. Resolved doctrine matrix

| Existing doctrine | Keep? | QIR interpretation |
|---|---:|---|
| PCL remembers the mission | yes | cognitive/semantic continuity + governance |
| one canonical PCL memory authority | yes | semantic memory only; not operational Run persistence |
| PCL exact side-effect authorization | yes, promote | mandatory QIR Tool Executor policy input |
| Outcome State is canonical | yes, scoped | canonical semantic outcome state, not Run journal |
| Conversation/Outcome Navigator chooses next move | yes, wrap | Cognition proposal, not durable executable cursor |
| model router chooses qualified/healthy model | yes | Model Fabric implementation |
| domain verifier owns local truth | yes | evidence source for Outcome Engine |
| `ARCHITECTURE.md` single home per concern | yes | physical/module ownership, not Run sovereignty |
| Project State is durable continuity | yes | Project Memory, not Attempt/Recovery journal |
| “no second database” for PCL | yes, scoped | no duplicate semantic store; separate operational Run store allowed/required |
| product north-star completion proxies | analytics only | never sufficient mission-completion evidence |
| request-local/domain orchestrator owns whole mission | no | MOVE Run ownership to QIR |

---

## 10. Architecture review verdict

There is **no need to discard PCL, Communication Layer, domain truth layers or the current topology**.

The only material doctrine collision found is the older PCL implementation statement that existing Outcome/Project persistence is the authoritative durable store **for everything** if read without its original semantic-memory scope. Phase 0 resolves that ambiguity explicitly: it remains authoritative for PCL/Project memory, while QIR adds a distinct operational Run journal.

The remaining apparent conflicts are vocabulary collisions (`outcome`, `completed`, `orchestrator`, `north star`, `source of truth`) across different semantic levels. QIR resolves them by assigning each term an authority scope instead of renaming working modules.

### Gate result

**Architecture doctrine gate: PASS WITH PRECEDENCE LOCKED.**

QIR is the single North Star for durable execution mechanics. PCL remains the cognitive/governance brain. Domain truth remains domain truth. Existing modules are wrapped progressively rather than rewritten.

Phase 1 is still not authorized until the separately discovered GitHub shared-credential security blocker (#452) is contained and its security PR is green/reviewed.
