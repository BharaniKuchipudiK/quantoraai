# Quantora Skills Platform Roadmap

> **North star:** Quantora is not a collection of chatbots. It is one governed intelligence platform that assigns the right specialist capability to a job, carries that job through a durable workflow, shows progress, verifies outcomes, and continues until the work is genuinely done.

## 1. Why Skills can become a moat

A **Skill** is a reusable, governed specialist capability that combines:

- intent recognition and entry criteria
- requirement discovery
- domain instructions and operating playbook
- allowed tools and integrations
- project / workspace context
- workflow stages
- completion criteria
- verification strategy
- recovery behavior
- delivery / publishing behavior
- user-facing progress language

The user should not need to understand or manually configure most Skills. Quantora should infer the job, propose or activate the best Skill, and make the assigned specialist visible in a lightweight way.

A Skill is therefore more than a prompt preset. It is closer to assigning a senior specialist with a repeatable operating procedure and responsibility for an outcome.

## 2. Core interaction model

The product hierarchy should remain simple:

**Workspace = what kind of work is this?**  
Coding, Study, Travel, Finance, Research, etc.

**Project = what body of work does this belong to?**  
QuantoraAI, Biology Revision, Japan Trip, Personal Finance, etc.

**Chat / Session = this specific thread of work.**

**Skill = who / what operating capability should handle this job?**

Users may explicitly choose a Skill, but the default experience should be **automatic skill routing**.

Example:

> User enters Coding Desk and says: “Build me a website for my photography business.”

Quantora detects `website_build` and activates a **Senior Web Product Engineer** Skill.

The Skill should then own the job end to end instead of merely generating a page and stopping.

## 3. Coding example: Senior Web Product Engineer Skill

### Trigger examples

- Build me a website
- Create an online shop
- Make a landing page for my company
- Build and publish a portfolio
- Create a SaaS marketing site

### Phase A — Understand the job

The Skill should determine what is already known and ask only material missing questions.

Potential requirement areas:

- business / product name
- purpose of the site
- target users
- brand tone / colors / visual direction
- pages required
- products / services
- authentication requirement
- payment gateway requirement
- forms / lead capture
- CMS / editable content requirement
- analytics
- SEO expectations
- domain / hosting destination
- GitHub repository / branch destination
- existing assets, logos, product photos, copy
- legal / privacy / terms pages where relevant

Do not force a long questionnaire when the user has already supplied enough information. Quantora should infer safe defaults and ask only questions that materially affect the build.

### Phase B — Plan

Create a concise execution plan and definition of done.

Example completion contract:

- responsive website implemented
- required pages exist
- navigation works
- forms / checkout / requested functionality works
- visual quality checked
- desktop and responsive rendering verified
- accessibility basics checked
- no broken links / obvious runtime errors
- repository committed to the user-approved destination
- production deployment created
- production URL responds successfully
- key production journeys verified

### Phase C — Build

Use the Coding Desk toolchain and existing governed runtime.

The Skill should decide when it needs supporting sub-skills, for example:

- **UX / Visual Designer**
- **Frontend Engineer**
- **Commerce / Payments Specialist**
- **SEO Specialist**
- **Accessibility Reviewer**
- **Deployment Specialist**

These do not need to be separate agents initially. They can be composable capability modules behind one accountable Skill.

### Phase D — Observe and communicate progress

The user should see meaningful progress such as:

- Requirements ready
- Designing structure
- Building pages
- Wiring interactions
- Running checks
- Fixing verification issue
- Preparing deployment
- Production verification

Avoid generic spinners and avoid inventing activity that is not actually happening.

### Phase E — Verify

Verification must use deterministic evidence wherever possible:

- compilation
- browser journeys
- runtime checks
- link / route checks
- source-file evidence
- accessibility checks
- requested functionality probes
- production health

Model-as-judge should only handle criteria that genuinely require semantic / visual judgment.

### Phase F — Recover

If verification fails, the Skill should replan / repair rather than asking the user to restart the job.

Examples:

- build error → repair
- missing file → regenerate
- preview crash → recover
- payment integration incomplete → return to implementation
- production deploy failed → diagnose and retry safely
- CI failed → bounded repair path

### Phase G — Deliver and prove

When the user has explicitly allowed delivery:

- commit / push
- create or update PR as appropriate
- satisfy exact-head CI
- merge through the existing governed delivery path
- deploy to production
- verify the production deployment
- present URL + concise proof of done

The job is not complete merely because code was generated.

## 4. Skill architecture

A first implementation can model a Skill as a versioned definition with fields such as:

```text
skillId
version
name
workspace
intentMatchers
entryConditions
instructions
requiredContext
optionalContext
allowedTools
requiredPermissions
workflowStages
completionCriteria
verifiers
recoveryPolicy
deliveryPolicy
progressVocabulary
handoffSkills
```

### Principles

1. **Skills are versioned.** Existing runs should be traceable to the Skill version that executed them.
2. **Skills never bypass permissions.** Tool access, delivery, external writes and sensitive actions remain governed.
3. **Skills do not own truth.** Evidence and verifiers determine completion.
4. **Skills compose.** A parent Skill can invoke narrower capabilities.
5. **Skills remain workspace-aware.** A Finance Skill and a Coding Skill have different risk and verification requirements.
6. **Skills remain project-aware.** Project files, context and prior decisions should be available when permitted.
7. **The user can override routing.** Auto is default; explicit Skill selection remains possible.

## 5. Initial Skill catalogue

Keep the first catalogue deliberately small and high quality.

### Coding

- **Senior Web Product Engineer** — website/app from requirements through production verification
- **Debugger & Recovery Engineer** — diagnose broken builds / runtime failures and repair them
- **Code Reviewer** — inspect a codebase / PR, find meaningful defects, propose or implement fixes

### Study

- **Visual Explainer** — diagrams, labelled visuals, timelines, charts, geometry, circuits, scientific representations
- **Socratic Tutor** — teaches through guided questions rather than dumping answers
- **Exam Coach** — syllabus-aware revision, practice, weak-area targeting and schedule

### Travel

- **Trip Architect** — builds an itinerary around constraints, timing, transport and preferences
- **Local Explorer** — discovers places and creates contextual day plans

### Finance

- **Decision Analyst** — compares scenarios, assumptions, trade-offs and risks
- **Scenario Planner** — what-if modeling and structured alternatives

### Research

- **Evidence Analyst** — source-backed synthesis, comparison and uncertainty
- **Deep Research Planner** — decomposes larger investigations and tracks unanswered questions

## 6. Study Visual Intelligence — priority differentiator

Study must not feel like a text chatbot.

### Product capability

Provide an **Explain Visually** path that can be activated automatically when a visual materially improves understanding or explicitly by the learner.

Examples:

- labelled science diagrams
- circuit diagrams
- mathematical graphs
- geometry constructions
- process / lifecycle illustrations
- history timelines
- maps
- molecular / atomic structures
- comparison charts
- step-by-step concept cards

### Desired teaching loop

**Explain → Visualise → Ask a quick check → Adapt**

Visuals should be instructional, not decorative stock imagery.

The platform already contains Study-specific visual and interactive components. The goal is to make them a visible, reliable learner capability instead of buried implementation infrastructure.

## 7. Integrations roadmap

Integrations should come after the Skills foundation because Skills provide the operating context that makes integrations useful rather than becoming a toolbar full of disconnected connectors.

Future user-authorized integrations can include:

- Gmail
- Google Drive / Docs / Sheets / Slides
- Google Calendar
- GitHub
- cloud storage
- other work / learning systems where justified

### Integration principle

A Skill requests the minimum connected capability needed for the job.

Examples:

- Research Skill → read selected Drive project documents
- Study Exam Coach → use syllabus / notes stored in Drive
- Travel Skill → reference relevant itinerary email confirmations
- Coding Skill → GitHub repository and deployment systems

Never silently broaden access simply because an integration exists.

## 8. Immediate execution pipeline

### #731 — Landing + Navigation Finish

- remove unnecessary Workspace expand/collapse arrow from the landing / workspace presentation
- persist user-adjusted sidebar width
- complete Workspace `+` → choose Project / Default / New Project
- retain move-to-project capability
- centered cinematic landing composition rather than stretched hero content
- strong behavior at laptop, 1440p, 1920p and ultrawide aspect ratios

### #732 — Study actual latency + responsiveness

- instrument request start, first feedback, first content and completion
- record P50 / P95 time-to-first-content and total response time
- identify slow routes / fallbacks
- paint streamed text immediately
- parallelize independent enrichment where safe
- keep assessment / evidence correctness intact
- keep fast teaching answer off non-essential enrichment critical path

### #733 — Study Visual Intelligence

- ship Explain Visually as a first-class Study capability
- automatic visual recommendation when helpful
- explicit student-triggered visual explanation
- diagrams / graphs / timelines / concept visuals
- visual → explanation → quick check loop
- browser / accessibility / representation gates

### #734 — Skills Foundation

- introduce versioned Skill definitions
- Skill registry
- deterministic intent-to-skill routing foundation
- permissions / tool-policy integration
- progress vocabulary
- completion contracts
- Skill telemetry
- no uncontrolled external execution

### #735 — Coding Senior Web Product Engineer proving vertical

Prove the full Skills concept with one important end-to-end workflow:

**User asks for website → requirement discovery → plan → design/build → verify → repair → GitHub → CI → deployment → production verification → DONE.**

Success means the Skill can own the job through completion without pretending generated code equals a finished product.

### #736 — Skill UX + composition

- lightweight “Assigned: Senior Web Product Engineer” / Skill indicator
- optional explicit Skill selection
- transparent reasons for automatic selection when helpful
- composed sub-skills without cluttering the user interface
- Project-aware Skill context

### #737 — Coding Desk inner experience

- editor / preview hierarchy
- progress and evidence placement
- tool/action density
- empty / working / repairing / verifying / completed states
- preserve governed runtime behavior

### #738 — Cross-workspace Skill expansion

- Study initial Skills
- Travel initial Skills
- Finance initial Skills
- Research initial Skills
- consistent Skill lifecycle and UX across workspaces

### Later — Connected Intelligence

- Gmail / Drive / Calendar and other integrations
- Project knowledge sources
- Skill-scoped connector permissions
- connected context with strong provenance
- integration-aware verification and delivery

## 9. Existing governed foundation Skills must reuse

Skills are an extension of the reliability foundation already shipped, not a second orchestration system.

The existing lifecycle remains:

**Intent → Plan → Act → Observe → Evaluate → Recover → Verify → Deliver → Prove**

Recent foundation work includes:

- Runtime Governor
- deterministic Outcome Evaluator
- continuity / self-recovery
- Governor metrics
- Auto Deliver invocation
- Coding Desk / workspace UX consistency
- Projects-first navigation direction
- fluid workspace / Study progress improvements

Skills should plug into this loop and provide domain operating policy, not replace its completion authority.

## 10. Product principles

### Outcome over answer

A strong Quantora session should end with a completed outcome where possible, not merely a sophisticated response.

### Useful output early

Do not make the user wait for optional enrichment before presenting useful progress or partial value.

### Truthful progress

Only describe observed work. Never fabricate “checking,” “researching,” or “verifying” activity.

### Deterministic proof first

Use tools, runtime results and verifiers before semantic judgment.

### Recovery is part of the product

Failures should transition into bounded recovery rather than forcing users to begin again.

### Connected but permissioned

Integrations enhance a Skill; they never grant it blanket access.

### Calm UX

Do not expose every implementation detail. The user should understand:

- who / what capability is handling the task
- what stage the work is at
- what input is needed from them
- whether the result has been verified
- what has actually been delivered

## 11. Long-term vision

A future Quantora interaction could look like this:

> “Build a website for my new tutoring business. Use the logo and brochure from my Drive. I need bookings and Stripe payments. Put it in my existing GitHub org and launch it.”

Quantora should be able to:

1. recognize the website-build intent
2. assign the Senior Web Product Engineer Skill
3. request permission for the necessary Drive / GitHub access
4. inspect the supplied brand material
5. ask only genuinely missing product questions
6. create a definition of done
7. build the site
8. progressively show working output
9. verify responsive behavior and requested functionality
10. recover from failures
11. obtain any required delivery consent
12. commit and pass CI
13. deploy
14. verify production
15. return the live result and evidence

That is the moat:

**not a model that can answer many questions, but a governed platform that can assign the right specialist capability and reliably carry real work to a verified outcome.**

---

## Roadmap status

This document is the durable product-direction source for the Skills phase. Individual PRs may refine implementation details, but changes should preserve the core principles above unless the roadmap is deliberately updated.