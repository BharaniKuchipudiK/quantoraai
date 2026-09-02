# Quantora — Product Roadmap

**2026-08-22:** Travel and Study are parked. Next work is the Studio coding desk (IDE). Leftovers live in `docs/PRODUCT_BACKLOG.md`.

A living, prioritized plan. We tackle it **top to bottom, one item at a time.**
Pair this with `ARCHITECTURE.md` (how the system is built) — this is *what we
build next and why*.

**Principles (the North Star):**
- **Outcome-first** — the value is the finished, working thing, not the code.
- **Not another chatbot** — a proactive collaborator that remembers, watches,
  anticipates, and improves outcomes.
- **Human-in-the-loop** — proactive, never unilateral on consequential actions;
  transparent and steerable.
- **Privacy-first** — consent-gated memory, user owns their data and keys.
- **Trust is the product** — earned through verification, restraint, and safety.

Status key: ✅ shipped · 🔜 next · ⏳ planned · 🔴 critical

---

## Where we are (observations)

**Shipped to production:** reliable multi-model routing + self-updating
registry · self-healing preview loop · guided conversational build · real photo
uploads + paste · Prompt Engineer · custom domains · full home-page overhaul ·
dark theme default · **real web grounding with citations** · **the Build
Verifier** (quality score + one-click Improve) · architecture map · stream
timeout hardening · production crash hotfix.

**Known debt / risks (tracked below):** preview sandbox key-exfiltration (🔴),
frontend↔backend duplication, dead `/api/live` WS, client-price-trust in the
(future) checkout bridge, per-request registry reads, base64 payload bloat.

**Not yet built:** Stripe payments · best-of-N · vision verification · the
cognitive layer · desktop app.

---

## Phase 0 — Stabilize & Secure  *(do first)*

- ✅ **Fix production crash** — missing `useCallback` import (#112).
- 🔴 **0.1 Preview sandbox isolation.** Untrusted generated code runs
  same-origin (`allow-same-origin` + `allow-scripts` + `document.write`), so it
  can read the user's API keys from `localStorage`. **Fix:** separate preview
  origin *or* nested sandbox. *Accept:* generated code cannot read app storage;
  preview + WebContainer still work.
  → **Shipped.** Generated code runs opaque-origin (no `allow-same-origin`); a
  `buildPreviewSandbox()` helper + regression tests lock the invariant so it
  can't silently regress.
- ✅ **0.2 Privacy — data control.** User-facing export + real account deletion
  (`api/account.ts`) and a 30-day retention TTL on telemetry (folded into the
  daily cron). No prompt/response bodies persisted; no raw IP; keyed on `sub`.
  *Accept met:* a user can export and erase their footprint. Live published
  sites are intentionally left running on delete.
- ✅ **0.3 Efficiency wins.** `readModelRegistryCached()` (60s TTL) removes a
  Supabase round-trip from the chat hot path (was read up to twice/request);
  base64 data-URIs are stripped from the verify critic's copy and
  tokenized+restored on repair (images preserved, never re-sent). *Accept met:*
  lower token cost + latency on verify/repair, no behavior change.

## Phase 1 — Monetization (Stripe, done right)

- ⏳ **1.1 Stripe Connect onboarding** — owner attaches their own account.
- ⏳ **1.2 Real checkout in published shops** — cart → Stripe on the owner's
  account. **Must include server-side price validation** (never trust
  client-sent amounts — today's bridge lets a shopper pay $0.01).
- ⏳ **1.3 Order recording** — persist orders in Supabase; owner can see sales.
  *Accept:* a real card charge lands in the owner's Stripe with a correct price.

## Phase 2 — Quality Flywheel (build on the Verifier)

- ⏳ **2.1 Best-of-N** — generate N attempts, the Verifier ships the best.
  Biggest quality jump with no model change.
- ⏳ **2.2 Vision verification** — judge the rendered *screenshot*, not just HTML.
- ⏳ **2.3 Reward dataset** — persist Verifier scores + thumbs feedback into a
  per-vertical store; the seed of a self-improving model. *Accept:* measurable
  build-quality lift over time per vertical.

## Phase 3 — The Cognitive Layer  *(the differentiator — not a chatbot)*

> **Reality check (2026-08, honest audit).** Of the "cognitive" modules, only
> `conversation-engine` (wired into `api/chat.ts`), `listening-layer` (studio
> session + inline suggestions) and `outcome_states` (memory) are actually
> connected. `proactive-nudges`, `domain-anticipation` and
> `capability-intelligence` shipped code **and passing tests but had zero
> non-test importers** — dead placeholders. Shipping "intelligence" that is
> wired to nothing is the fastest way to become the wrapper we claim not to be.

- ✅ **3.0 Connect-or-cut the dead cognitive modules.** Audit outcome: all three
  were **stale duplicates** of concepts already live under other names
  (`getProactiveNudge`, `enrichContinues`, the `capabilityProposals` prompt
  surface, `communication-intelligence`, `conversation-engine`). **Cut** all
  three modules + tests — zero importers, so no runtime change and no capability
  lost. The genuinely good but unwired ideas are **preserved, not discarded**:
  the capability proposer's design lives on in
  `docs/architecture/capability-intelligence-v1.md` (to be built for real in
  3.x / 8.1), and domain-specific "next-step" beats belong with the Outcome
  Graph (8.1). *Accept met:* no module in `src/lib` claims to be intelligence
  while importing into nothing.

Turn the existing seeds (`listening-layer`, `conversation-engine`,
`outcome_states`) from reactive into a persistent, proactive operator.
**Guardrails on every slice:** opt-in, transparent, a quiet mode, human approval
for consequential actions.

- ⏳ **3.1 Living project memory** — a structured model of *what you're building
  and why*, persistent across sessions. On return: "here's where you were, and
  the best next step." *(Build on `outcome_states`.)*
- ⏳ **3.2 Ambient outcome monitoring** *(the killer feature)* — once published,
  watch the live site (traffic, errors, conversion) and proactively propose
  fixes: "mobile visitors bounce on the menu — add a sticky Order button?"
- ⏳ **3.3 Anticipatory briefings** — notice the current goal, gather relevant
  context via grounding, hand over an unprompted brief.
- ⏳ **3.4 Self-learning preference model** — learn the user's taste from
  accept/reject + thumbs; pre-tune every future output.

*Architecture:* durable memory (Supabase) · scheduled trigger passes (cron,
since serverless can't hold a loop) · a notification channel · a **restraint
policy** so it's proactive, not noisy.

## Phase 4 — Desktop App (the persistent host)

- ⏳ **4.1 Tauri/Electron shell** — the body the cognitive layer needs:
  background presence, local notifications, optional file access. **Gated on
  Phase 0.1** (don't distribute a binary over an unfixed sandbox).
  → **Designed** (2026-09-02): `docs/architecture/desktop-client-v1.md` —
  Electron shell, bundled renderer on `quantora://app`, bearer carrier for the
  existing HMAC session, a `DeskRuntime` seam so the Coding Desk gets a real
  shell/git/folder, and the gate extensions each phase must ship with.

## Phase 5 — Architecture hygiene (continuous)

- ⏳ **5.1 Consolidate** frontend↔backend duplicates into a `shared/` core.
- ⏳ **5.2 Resolve `server.ts`** — remove or clearly mark the dead `/api/live`
  WS; make voice explicitly dev-only.
- ⏳ **5.3 Rename** the two colliding `conversation-policy` files.
- ⏳ **5.4 Smoke tests** for the `/api/chat` task routes (grounding, verify-build).

---

# The North-Star Bets  *(the "liquid-gold" list)*

If we had unlimited resources, these are the swings that make Quantora a
category-definer instead of one of a dozen prompt-to-app tools. The thesis:
**everyone can generate an app now — that race is over. The moat is the
*outcome operator*: a system that builds it, proves it works, remembers why you
wanted it, watches it in the wild, and acts to make the outcome better.** No
competitor (v0, Lovable, Bolt, Replit, Copilot, Fello) ties
generate → verify → remember → monitor → act into one loop. We already own the
rare pieces (Verifier, `outcome_states`, grounding). These bets connect them.

## Phase 6 — Agentic Automations  *(from a tool you visit → an operator that works while you sleep)*

The paradigm shift. Fello/Copilot "automations" are generic dev-ops (issue
triage, changelogs). Ours must be **outcome-native**: agents that act on *the
user's published thing*, powered by the cron infra we already run + grounding +
the Verifier. This is Phase 3.2 made concrete and user-facing.

- ⏳ **6.1 Automations surface** — a first-class "Automations" area: create,
  schedule (cron) or event-trigger, pause, and see run history. Reuse the
  existing cron + `CRON_SECRET` pattern; each run is a bounded agent pass with a
  transcript.
- ⏳ **6.2 Outcome-native recipes** (not dev-ops clones):
  - *Watcher:* "watch my site; when mobile bounce/error spikes, draft a fix PR."
  - *Growth:* "every Monday, check conversion and propose one concrete change."
  - *Market radar:* "when a competitor's pricing/page changes (grounding), brief
    me and draft a response section."
  - *Freshness:* "keep the menu/hours/stock in sync from a source I point to."
- ⏳ **6.3 The restraint policy** — proactivity budget, quiet hours, and
  human-approval gates for anything consequential (deploys, spend, emails).
  *Accept:* an automation ran overnight and produced a reviewable, reversible
  proposal — not a surprise change. **This is the "not a gimmick" bar.**

## Phase 7 — The Generative Studio  *(generation beyond code)*

Today we generate markup. A launch-ready outcome needs identity, content, and
data. Lean on multi-modal + image models, all judged by the Verifier.

- ⏳ **7.1 Generative brand system** — from a one-line brief, generate a coherent
  identity (palette, type pairing, logo via image gen, voice) and apply it
  across the whole build, not per-page guesses.
- ⏳ **7.2 Launch-ready content** — real copy, product descriptions, and images
  (image models) instead of lorem-ipsum/stock; consent-gated.
- ⏳ **7.3 Realistic seed data** — generate demo data so an app *feels* alive on
  first render.
- ⏳ **7.4 Multi-modal input** — sketch/screenshot → app (extends the existing
  paste-image); "make it look like this" from a reference.
- ⏳ **7.5 Generative variants** — pairs with 2.1 Best-of-N: show 3 distinct
  directions, Verifier-ranked, user picks the taste.

## Phase 8 — World-class product IA  *(the left nav that signals a platform)*

The current nav reads like a builder; it should read like an operating system
for outcomes. Proposed spine (each a real surface, no dead entries):

- ⏳ **8.1 Projects = the Outcome Graph** — promote `outcome_states` from a hidden
  table to the primary object: each project a living card (goal, status, last
  action, **next best step**), resumable across sessions. This is Phase 3.1 made
  visible and becomes the nav's backbone.
- ⏳ **8.2 Automations** — Phase 6, surfaced in nav.
- ⏳ **8.3 Insights / Monitoring** — post-launch outcomes (traffic, errors,
  conversion) feeding Phase 3.2.
- ⏳ **8.4 "Quantora is working…" activity rail** — a persistent, honest view of
  what agents are doing right now (the proactive layer made visible, never
  faked). Models & Vault stay as-is.
  *Accept:* every nav item maps to a live capability; nothing is a placeholder.

## Phase 9 — PCL, Cursor-grade  *(validated external input, 2026-08)*

An outside "Cursor co-founder" critique of the ProActive Communication Layer.
Audited against the code; most of it **validates the direction we're already on**
— captured here so the good parts become tracked work, not vibes.

**Already real in Quantora (validation, not to-do):**
- *"Interaction = Action, not text / the Diff philosophy"* — **shipped**:
  `src/lib/diff-patcher.js` + `vfs-parser` already stream edits as diffs for
  zero-click execution. This is the essay's centrepiece and we have it.
- *Intent memory* — `outcome_states` already stores structured outcome state,
  not transcripts (the seed of the "Context Graph").
- *Acceptance signal* — `recordModelQualityEvent` already logs helpful /
  not_helpful.

**New / sharpened to-dos:**
- ✅ **9.1 Acceptance Rate as the North-Star metric.** Shipped: a
  `suggestion_events` table (isolated migration `0015`) records every proactive
  act — shown / accepted / dismissed, per surface — written fire-and-forget from
  the inline-suggestion hook via `/api/product-event` (anonymous-allowed, no
  prompt text). `suggestion_acceptance_7d` view + `getSuggestionAcceptance()`
  surface the per-surface 7-day rate in the admin metrics endpoint; swept by the
  same retention TTL. *Accept met:* we can now measure whether the PCL is
  accepted, not just how often it's shown.
- ⏳ **9.2 "Interaction = Action" as a product principle.** Make diff-apply +
  accept/reject the *default* interaction mode beyond code (tasks, content,
  config), not text the user copies. Extends the shipped diff engine.
- ⏳ **9.3 Two-speed PCL (fast-path / deep-path).** Formalize routing: a
  Gemini-Flash **fast-path** for constant low-latency monitoring / constraint
  validation ("does this contradict the last 5 decisions?"), and Pro only for
  the **deep-path** reasoning. Target: proactive hints feel instant.
- ⏳ **9.4 Ambient "Ghost" surface.** A non-intrusive indicator ("I checked your
  past work — you likely need to update X") with Tab/Enter to execute. This is
  8.4's activity rail turned proactive; kill the chat-window-as-only-surface.
- ⏳ **9.5 Index intent, not text.** Sharpen `outcome_states` to store
  *decisions, rationale, dependencies* — the Context Graph — feeding 3.1 / 8.1.
- ⏳ **9.6 Specialized SLM for the PCL** *(later; moat play).* Use Vertex credits
  to fine-tune a small, fast model on our own reward dataset. **Gated on 2.3** —
  needs the data flywheel first; premature without it.

**Honest caveats (so we don't chase a mirage):**
- *The <200ms "local, instant" bar* fights our serverless + browser topology:
  cloud round-trips can't reliably hit 200ms. True instant recall needs the
  desktop app (4.1) or aggressive client-side caching — track it there, don't
  pretend serverless will feel local.
- *SLM fine-tuning* is powerful but worthless without data — it follows 2.3, not
  precedes it.

**Open strategic question (founder's call, not a code task):** the critique says
*"focus on ONE workflow, not a platform for everything"* (Cursor won by owning
coding). Quantora today spans websites, research, students, professionals.
Narrowing could sharpen the moat — but that's a positioning decision for you,
flagged here rather than silently chosen.

---

## Suggested order of attack

**Foundations first, then the swing.**
`0.3 efficiency` ✅ → `3.0 connect-or-cut` ✅ → `9.1 Acceptance-Rate metric`
(cheap, proves value, feeds the flywheel) → `1.x Stripe` → `3.1 memory` /
`8.1 Outcome Graph nav` (same object) → `9.3 two-speed PCL` + `2.1 best-of-N` +
`7.5 variants` → `6.x Automations` (the flagship) → `3.2 monitoring` /
`8.3 insights` + `9.4 Ghost surface` → `7.x Generative Studio` → `4.1 desktop` /
`9.6 SLM`, with Phase 5 hygiene interleaved.

*Sequencing logic:* **3.0 is non-negotiable and early** — we do not build new
intelligence on top of dead intelligence. Memory (3.1) and the Outcome-Graph nav
(8.1) are the same object seen two ways, so they ship together. Automations
(Phase 6) is the headline bet but depends on memory + monitoring being real, so
it comes after them, not before.
