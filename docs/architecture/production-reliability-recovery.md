# Production reliability recovery: golden transactions and inference control plane

Status: feature freeze. This note governs the calculator and simple-website recovery. It does not authorize removing Canvas/Journey, Studio workspace/Preview, or model choice.

## Evidence baseline — 21 August 2026

- Production deployment `dpl_HB7GeMahtLPZ5M87DCetN4W5rzS2` was `READY` on commit `00c28df75f45dc5c3f5a524c18d2a662501e2d5d`.
- Vercel recorded 36 HTTP 500 responses and one 503 in the preceding 24 hours. `/api/chat` was the highest-volume API route.
- Recent `/api/chat` error clusters included Gemini quota exhaustion, a dead OpenRouter model endpoint, and repair timeouts.
- The current deployment later returned one HTTP 200 from `/api/chat`, but emitted no boundary evidence connecting that response to artifact parsing, compilation, iframe readiness, or interaction.
- The CI Studio gate intercepted every `/api/*` request. In particular it replaced `/api/chat` with a synthetic response and ran the compiler in the test process. It proved UI wiring against fixtures, not the deployed transaction.
- A request UUID existed only inside `/api/chat` and reached the browser only in the final SSE event. It was not sent by the browser, retained on the artifact, propagated to `/api/preview-compile`, or included in iframe readiness.
- Provider resilience and distributed circuit-store code existed, but `/api/chat` did not use it. Chat used a static two-attempt map and then filtered execution to the original gateway. The “paid emergency fallback” remained inside the same OpenRouter credential/quota/failure domain.
- The first exact-SHA Preview canary subsequently proved the new tracing contract: inference and VFS parsing succeeded, then `/api/preview-compile` returned 422 because Vercel file tracing had omitted the browser packages resolved dynamically by the runtime compiler. The compiler function now declares those runtime files explicitly.
- The next canary passed the calculator end to end and isolated the website failure to iframe execution (`ReferenceError: src is not defined`) after a successful compile. Build prompts now carry the opaque-sandbox execution contract explicitly, and the gate surfaces iframe diagnostics immediately instead of waiting for a selector timeout.
- The fail-fast gate then rejected a calculator at compile time because generated code requested the nonexistent `lucide-react` export `LuCircle`. The two golden contracts now deliberately use the minimum runtime surface—React, semantic text, and CSS—so they test Quantora's core outcome path without an unnecessary third-party symbol dependency.
- The following run reached neither VFS nor Preview because the primary route streamed no complete build before consuming the old 90-second turn budget. Build responses are now held until a route completes, the primary attempt has a bounded budget, and 45 seconds is reserved for a genuinely independent fallback domain before the 120-second turn deadline.
- The bounded-attempt run completed inference but generated a standalone HTML shell that loaded React from a CDN. That artifact took the legacy HTML preview path and rendered blank under production security headers, so it did not satisfy the React/VFS contract. React build prompts now require the compiler-owned VFS shape and bare package imports explicitly; the standalone HTML feature remains available only when requested.
- Pre-merge review found and closed six control gaps: BYOK circuit keys are credential-partitioned, build clients outlive the server failover budget, Gemini stream opening is abort-bounded, canary secrets are attached only to the Quantora origin, deployment polling leaves a separate transaction budget, and PR concurrency keys cannot cancel another PR's gate.
- CI evidence showed the platform long-task gate conflated variable bundle parse time (397–836 ms on unchanged frontend code) with post-ready interaction responsiveness. Shell startup remains bounded by its existing 4-second readiness SLA; long-task budgets now begin once the composer is usable, retain deferred startup work, and emit phase-specific diagnostics on every run.
- A subsequent canary proved the browser's coding-intent classification was not crossing the `/api/chat` boundary: normalized missing mode defaulted to `ask`, so the primary consumed the conversation budget for 119 seconds and left the independent fallback 0 ms. Coding turns now send `buildMode` explicitly, omitted mode is distinct from an explicit Ask override, and every provider-attempt trace records its enforced budget.
- The next exact-commit canary rendered the calculator but caught a generated website reading `localStorage` inside the opaque-origin iframe despite the prompt contract. Completed build responses now pass a deterministic executable-artifact contract before a route is committed, so invalid output can use the already-budgeted independent fallback; the compiler rejects unsupported storage as defense in depth, and iframe `rendered` is emitted only after the application mounts content rather than when the harness merely loads.

## Five Whys

1. **Why could a user receive no working outcome while all checks were green?** The release checks did not execute prompt → live provider → generated files → deployed compiler → iframe → interaction.
2. **Why did the checks stop at fixtures?** The browser suite intercepted `/api/chat` and `/api/preview-compile`, while Vercel `READY` only established deployment readiness.
3. **Why did provider incidents trigger sequential model patches?** Routing expressed model IDs, not executable routes with capability, gateway, credential/quota domain, cost, health, and circuit state.
4. **Why could the first broken boundary not be located?** There was no correlation identity shared by the browser, API, provider attempt, response parser, VFS, compiler, and iframe.
5. **Why was this allowed to recur?** Release policy gated components independently and had no deployed golden-transaction proof attached to the exact deployment SHA.

Root cause: **Quantora treated models as interchangeable before it had a route control plane, an end-to-end outcome contract, and deployed transaction evidence.** Provider failures were symptoms amplified by those missing foundations.

## Boundary contracts

| Boundary | Success contract | Observable failure |
|---|---|---|
| Browser → `/api/chat` | One opaque correlation ID is generated before send and carried in header/body. | Missing/invalid ID is replaced server-side and returned in a response header. |
| Chat intake | Auth/canary authorization, safety, rate limit, and request normalization complete before provider execution. | HTTP 4xx/429 with correlation ID and `api.chat failed` boundary. |
| Route plan | Selected model remains primary if executable; every attempt declares capability, health, gateway, upstream, quota domain, failure domain, cost class, and circuit state. | No capability-qualified route returns a correlated 4xx; open/offline routes are not attempted. |
| Credentials/quota/circuit | Only routes with usable credentials run; 429 opens the shared quota-domain circuit; endpoint loss opens the route circuit. | Correlated provider failure records status and operational code without prompt/response content. |
| Provider stream | A route is committed only after a usable first token. Maximum two bounded attempts. | Pre-stream retryable failure may move to a different failure domain; post-stream failure terminates once as structured SSE. |
| SSE → response parser | Stream must end with `[DONE]`; final event carries correlation and selected route metadata. | Missing `[DONE]`, structured error, or empty response becomes visible UI failure. |
| Response → artifact/VFS | The current response must contain runnable fenced files/code; stale VFS alone is not success. | `artifact.vfs` is absent/failed; Preview cannot be claimed as complete. |
| VFS → compiler | `/api/preview-compile` receives the same correlation ID and returns compiled self-contained HTML or 422. | Compiler logs a correlated contract failure; UI shows the exact preview error surface. |
| Compiler → iframe | The compiled harness posts `ready` or runtime `error` with the same correlation ID. | Mismatched IDs are ignored; runtime errors are correlated and visible. |
| Render → interaction | Calculator changes `0 → 1`; website renders `Sunrise Bakery` and a usable CTA. | The deployed golden gate fails and uploads screenshot/evidence for the exact deployment SHA. |

No event accepts prompt text, generated source, credentials, or user data. Boundary telemetry is operational metadata only.

## Inference-control-plane policy

- Model choice is preserved: an executable selected model remains the first attempt.
- Capability qualification precedes availability or price. Travel tools remain on the direct Gemini tool domain; text/code may fail over across gateways.
- Independent failover means a different gateway and credential/quota domain. Another OpenRouter model under the same account is not independent from an OpenRouter account-level 429.
- Route health combines registry availability and distributed route/domain circuits. Unknown health is explicit; it is never labeled healthy merely because a model is listed.
- Cost is part of every route record (`free`, `low`, `standard`, `unknown`) and is used only after capability and independent-domain preference.
- Attempts are bounded to two. There is no catalogue-wide retry storm.

## Release gate

The existing synthetic browser suite remains valuable for deterministic UI regressions. It is not production proof.

The `Deployed Golden Transactions` workflow waits for the exact Vercel Preview SHA on pull requests, then runs again for a successful Production deployment event after merge. It checks out that deployed SHA and drives the deployed Studio through Vercel's automation-only protection bypass; Preview remains SSO-protected for ordinary traffic. Only `/api/auth/session` is isolated with a synthetic canary identity. `/api/chat`, route selection, provider calls, SSE parsing, VFS extraction, `/api/preview-compile`, iframe rendering, and interactions are real. It uploads correlations, timings, and screenshots for both golden transactions.

A production fix may be declared only when:

1. typecheck, frontend lint, all tests, production build, and dependency audit pass;
2. deterministic browser gates pass;
3. the exact production commit is Vercel `READY`; and
4. both deployed golden transactions pass against that deployment with end-to-end correlation evidence.
