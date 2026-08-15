# Quantora — Product Roadmap

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
- 🔜 **0.3 Efficiency wins.** Cache the model registry (TTL) on the chat hot
  path; strip base64 data-URIs from code sent to model on refine/repair/verify.
  *Accept:* lower p50 latency + token cost on refine.

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

Turn the existing seeds (`listening-layer`, `proactive-nudges`,
`domain-anticipation`, `conversation-engine`) from reactive into a persistent,
proactive operator. **Guardrails on every slice:** opt-in, transparent, a quiet
mode, human approval for consequential actions.

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

## Phase 5 — Architecture hygiene (continuous)

- ⏳ **5.1 Consolidate** frontend↔backend duplicates into a `shared/` core.
- ⏳ **5.2 Resolve `server.ts`** — remove or clearly mark the dead `/api/live`
  WS; make voice explicitly dev-only.
- ⏳ **5.3 Rename** the two colliding `conversation-policy` files.
- ⏳ **5.4 Smoke tests** for the `/api/chat` task routes (grounding, verify-build).

---

## Suggested order of attack

`0.1 sandbox` → `1.x Stripe` → `3.1 memory` → `2.1 best-of-N` → `3.2 monitoring`
→ `4.1 desktop`, with Phase 5 hygiene interleaved and Phase 0.2/0.3 as quick
wins between features.
