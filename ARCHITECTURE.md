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

There are **two** ways the server code runs, and they are not the same:

| | **Production (Vercel)** | **Dev / self-host (`server.ts`)** |
|---|---|---|
| Frontend | Static `dist/` from `vite build` | Vite middleware (HMR) |
| API | Each `api/*.ts` is a **serverless function** | One Express process serving the same routes |
| Long-lived connections | **Not possible** (functions are request-scoped) | Possible |

**Implications that bite if forgotten:**

- `server.ts` is a **dev / self-host mirror**, *not* deployed to Vercel. Vercel
  only runs `api/**` (as functions) and serves `dist/`. Anything that exists
  *only* in `server.ts` does **not** run in production.
- The **`/api/live` WebSocket voice bridge** lives only in `server.ts`, so voice
  works in dev but **not on serverless prod**. Treat it as dev-only until it has
  a persistent host.
- **Serverless function budget.** Every top-level `api/*.ts|js` is a function
  (currently **12**). Do **not** add a new top-level file for a new capability —
  **fold it into an existing handler via task routing.** `/api/chat` already
  multiplexes `chat`, `repair`, `verify-build`, and `feedback` this way. Shared
  logic goes in `api/_lib/**`, which are modules, not functions.

---

## 2. Layer map

```
src/                      FRONTEND (bundled into dist/)
  components/             React UI (AiStudio, LivePreviewCanvas, LandingPage, …)
  hooks/                  useChatStream (the chat send loop), useStudioSession, usePCLMemory
  lib/                    Frontend logic
    communication/        intent / routing / policy / evaluation (typed)
    intelligence/         blueprint · executor · memory · orchestrator
    (misc)                studio-domains, studio-choices, session-context, outcome-state, …

api/                      BACKEND (each *.ts|js = a serverless function)
  chat.ts                 THE hot path — chat + repair + verify-build + feedback
  deploy.ts               Static publish to Vercel + Stripe checkout bridge
  deploy-gcp.ts           One-click GCP Cloud Run deploy
  models.js               Live model registry (cron-refreshed)
  classify-intent.ts, enhance.ts, moderate.js, domains.ts, autocomplete.ts,
  pipeline.ts, product-event.ts, deploy-status.ts
  _lib/                   Shared BACKEND modules (NOT functions)
    conversation-policy   builds the SYSTEM PROMPT
    conversation-engine   snapshot → next-move decision → response verification
    communication/        request normalizer
    verify-build          the build Verifier (quality score + issues)
    repair                self-heal
    store / session / rate-limit / safety-policy / model-store / …
  auth/, admin/           sub-route functions
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

## 3. Known duplication — the #1 drift risk

Several concerns exist as **two copies**: a **frontend** one in `src/lib/**` and a
**backend** one in `api/_lib/**`. Each side imports its own via relative paths, so
both are **live** — this is duplication, **not** dead code (do not "clean it up"
by deleting one; that breaks the side that imports it).

Duplicated concerns today: `session-context`, `studio-domains`, `studio-choices`,
`studio-continues`, `conversation-policy`, `conversation-engine`, `outcome-state`,
`repository-preview`.

**Rule until these are unified:** if you change the logic on one side, change the
other in the same PR. The end-state we want is a single **`shared/`** module per
concern that both sides import (see §5).

> Note: `api/chat.ts` currently imports a few `src/lib/communication/*` modules
> directly (backend importing frontend source). That works only because those
> modules are browser-free. **Keep anything `api/` imports free of `window`/DOM
> and heavy client deps**, or the serverless bundle breaks.

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
   good coverage (~30 `*.test` files) — lean on it.
2. **TypeScript** for new shared logic; colocate tests as `*.test.ts`.
3. **No duplicate basenames** for different concerns; **no new top-level `api/`
   function** for a capability that can be a task branch.
4. **`api/` never depends on browser-only code.** Prefer putting cross-boundary
   logic in `api/_lib` (or a future `shared/`) rather than importing `src/`.
5. **Model IDs**: don't hardcode a specific speculative version as a default.
   Default to the registry-backed safe slug (`gemini-flash-latest`) and let the
   live registry upgrade it.
6. When two agents touch the same area, the **smaller, additive** change merges
   first; the other rebases.

---

## 6. Security posture (current)

- **Keys**: signed-in users may use deployment keys (resolved server-side from
  the Supabase API Gateway); everyone can bring their own key (BYOK), stored
  client-side only. Server secrets never reach the client.
- **Headers**: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, referrer &
  permissions policy in `vercel.json`.
- **Abuse**: two-layer rate limiting (in-memory + durable) on `/api/chat`;
  moderation pass on prompts; safety-policy checks.
- **Published sites**: `/api/deploy` allows `*` CORS *only* so a published shop
  can call the Stripe checkout bridge; the Vercel/Stripe secrets stay server-side.

See §7 of the review notes for hardening suggestions.
