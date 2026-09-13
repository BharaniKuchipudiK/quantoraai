# Quantora — Architecture & Contracts

A shared map so that everyone working on this repo (humans and AI agents alike)
knows **where each concern lives, how the pieces fit, and the rules that keep
parallel work from drifting.** Read this before adding a feature.

Quantora is an **outcome-first AI studio**: you describe an intent in plain
language and get a real, running, verifiable artifact (a live website/app, a
research draft, a plan) — not just a chat reply. The intelligence is judged by
whether the *outcome* works, which is what makes autonomy and self-improvement
possible here.

---

## 1. Runtime topology (read this first)

The main application has these two runtime entry points. The isolated QIR
Workflow worker is a third deployment, described immediately below:

| | **Production (Vercel)** | **Dev / self-host (`server.ts`)** |
|---|---|---|
| Frontend | Static `dist/` from `vite build` | Vite middleware (HMR) |
| API | Each `api/*.ts` is a **serverless function** | One Express process serving the same routes |
| Long-lived connections | **Not possible** (functions are request-scoped) | Possible |

The limited browser worker pilot submits through authenticated `/api/qir-runs`
to `services/qir-workflow`, deployed as an isolated Vercel Workflow service.
Workflow owns durable continuation; Supabase stores runs/checkpoints; Sandbox
executes generated code. This does not activate server ownership for all users.
See [current release status](docs/architecture/RELIABILITY_CLOSEOUT_2026-09-13.md).

**Implications that bite if forgotten:**

- `server.ts` is a **dev / self-host mirror**, *not* deployed to Vercel. Vercel
  only runs `api/**` (as functions) and serves `dist/`. Anything that exists
  *only* in `server.ts` does **not** run in production.
- The **`/api/live` WebSocket voice bridge** lives only in `server.ts`, so voice
  works in dev but **not on serverless prod**. Treat it as dev-only until it has
  a persistent host.
- **Serverless function budget.** Every top-level `api/*.ts|js` is a function
  (target **≤12** on Hobby; thin routes fold into `pipeline` / `auth` / `admin`
  / `domains` via `vercel.json` rewrites — `/api/inference-health` rides on
  `domains`, deliberately NOT on `pipeline`, so the health probe outlives a
  pipeline failure). Do **not** add a new top-level file for a new
  capability — **fold it into an existing handler via task routing.** `/api/chat`
  already multiplexes `chat`, `repair`, `verify-build`, and `feedback` this way.
  Shared logic goes in `api/_lib/**`, which are modules, not functions.

---

## 2. Layer map

```
src/                      FRONTEND (bundled into dist/)
  components/             React UI (AiStudio, LivePreviewCanvas, LandingPage, …)
  hooks/                  useChatStream (the chat send loop), useStudioSession, usePCLMemory
  lib/                    Frontend logic (+ shims re-exporting shared/)
    communication/        routing / policy / evaluation (typed; imported by api/_lib too)
    (misc)                studio-choices, session-context, outcome-state, …

shared/                   PURE FE+BE modules (no DOM, no Node secrets/DB)
  build-intent, workspace-intent, coding-desk-auto-model
  travel/*, studio/domains, studio/domain-inference

api/                      BACKEND (each *.ts|js = a serverless function)
  pipeline.ts / auth.ts / admin.ts   hubs (thin routes fold here via rewrites)
  _lib/                   Shared BACKEND modules (NOT functions)
    chat-handler          THE hot path — chat + repair + verify-build + feedback
    conversation-policy   builds the SYSTEM PROMPT
    conversation-engine   snapshot → next-move decision → response verification
    …
```

### The `/api/chat` pipeline (the most important flow)

```
normalize request
  → selectModelsForTurn()            (routing)
  → buildConversationSnapshot()      (what do we know / what's the goal)
  → chooseNextConversationMove()     (ask? build? advise?)
  → buildResponseContract()          (what a good reply must satisfy)
  → buildConversationSystemPrompt()  (compose the system prompt + navigator directive)
  → stream from Gemini or OpenRouter (grounding on when "webSearch" + not building)
  → verifyConversationResponse()     (grade the reply)
```

Task branches short-circuit this: `task:"repair"`, `task:"verify-build"`,
`task:"feedback"` carry code/signals instead of a chat message.

---

## 3. Shared modules + remaining duplication

Cross-boundary **pure** logic now lives under **`shared/`** (Vite alias
`@shared/*`; API uses relative `../../shared/...`):

- `shared/build-intent.js`, `shared/workspace-intent.js`, `shared/request-kind.js`
- `shared/coding-desk-auto-model.js`
- `shared/{session-context,studio-choices,studio-continues}.js`
- `shared/travel/{flight-resilience,place-shortlist,hotel-location}.js`
- `shared/studio/{domains,domain-inference}.ts`

`src/lib/*` and `api/_lib/studio-domain-inference.ts` keep thin **re-export
shims** so existing imports keep working.

**Still duplicated (do not delete one side):** full `studio-domains` UI catalog
vs server directives, `conversation-policy` / `conversation-engine` (different
modules, same names), `outcome-state` (client `.js` vs server `.ts`).

**Rule for remaining forks:** change both sides in the same PR until each lands
in `shared/`. Keep anything `api/` or `shared/` imports free of `window`/DOM.

---

## 4. Single home per concern

| Concern | The one place it belongs |
|---|---|
| System prompt / build directives | `api/_lib/conversation-policy.ts` |
| Conversation navigator (ask/build/advise) | `api/_lib/conversation-engine.ts` |
| Response contract / evaluation | `src/lib/communication/**` |
| Model routing | `src/lib/communication/routing/*` |
| Build quality verification | `api/_lib/verify-build.ts` |
| Self-heal / repair | `api/_lib/repair.ts` |
| Model registry (source of truth) | `api/models.js` + `api/_lib/model-store.js` |
| Secrets resolution | `api/_lib` via `fetchApiGatewayKey` (server) / `client-secrets` (BYOK) |

**Naming rule:** two *different* concerns must not share a basename. (Today two
files are named `conversation-policy` — one builds the system prompt, the other a
response contract. Don't add a third.)

---

## 5. Conventions (so parallel work converges instead of colliding)

1. **Branch off the latest `main`** and run `npm test` before merging. There is
   good coverage (~270 `*.test` files) — lean on it.
2. **TypeScript** for new shared logic; colocate tests as `*.test.ts`.
3. **No duplicate basenames** for different concerns; **no new top-level `api/`
   function** for a capability that can be a task branch.
4. **`api/` never depends on browser-only code.** Cross-boundary logic goes in
   `shared/` (preferred) or stays browser-free under temporary `src/lib` shims.
   Do not put `localStorage` / DOM helpers in `shared/`.
5. **Model IDs**: don't hardcode a specific speculative version as a default.
   Default to the registry-backed safe slug (`gemini-flash-latest`) and let the
   live registry upgrade it.
6. When two agents touch the same area, the **smaller, additive** change merges
   first; the other rebases.

---

## 6. Security posture (current)

- **Keys**: signed-in users may use deployment keys (resolved server-side from
  the Supabase API Gateway); everyone can bring their own key (BYOK), stored
  client-side only and sent as `x-quantora-*-key` headers (never JSON body
  fields). Server secrets never reach the client. Dev Live WS authenticates to
  Gemini with `x-goog-api-key`, not a query-string key.
  **Outage posture:** the gateway read is per-turn with a process-local
  last-known-good cache (~1 h, served only when Supabase is unreachable or
  5xx; a 4xx or empty row drains it). Set `GEMINI_API_KEY` /
  `OPENROUTER_API_KEY` env vars in production alongside the gateway table —
  they are the fallback that keeps cold instances serving through a Supabase
  incident.
- **Headers**: CSP (app/`desk` `script-src` without `unsafe-inline`; `/preview/`
  keeps inline scripts for user artifacts), HSTS, `X-Frame-Options: DENY`,
  `nosniff`, referrer & permissions policy in `vercel.json`.
- **Abuse / control plane**: two-layer rate limiting (in-memory + durable) on
  cost-bearing routes; when Supabase RL is unreachable, those routes collapse
  to ~1/3 in-memory burst (`applyDurableCostBearingGuard`). Provider circuits
  are shared via Supabase when healthy; on outage they run `local-degraded`
  (open after ~half the normal failures) so cold instances do not keep hammering
  a broken upstream. `/api/inference-health` reports `circuitStore` mode.
  Moderation pass on prompts; safety-policy checks.
- **Published sites**: `/api/deploy` reflects CORS only for the exact `APP_URL`
  origin (via `applyCors`), like every other route; the Vercel/Stripe secrets
  stay server-side.

See §7 of the review notes for hardening suggestions.
