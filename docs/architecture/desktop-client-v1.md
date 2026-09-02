# Quantora Desktop Client — v1 design

**Status:** proposal (2026-09-02). Answers ROADMAP Phase 4.1 ("Tauri/Electron
shell — the body the cognitive layer needs"). Nothing here is built yet; every
claim about the current platform below was read from the code and cites the file.

Read `ARCHITECTURE.md` first. This document only adds what a native client
changes, and it is deliberately additive: the web app stays the product, the
desktop is a second *host* for the same frontend and the same API.

---

## 0. Why a desktop client at all

Three things the serverless + browser topology cannot do, each already named
in the roadmap:

| Need | Why the browser cannot | Roadmap item |
|---|---|---|
| A real shell, real git, real files for the Coding Desk | WebContainer needs cross-origin isolation, an HTTPS origin and a `/desk` document split away from Google Sign-In (`src/lib/studio-isolation.js`, `vercel.json` COOP/COEP rules). It is an emulation, and the terminal blocks unless `window.crossOriginIsolated` is true (`src/lib/studio-terminal.js`). | Studio coding desk (2026-08-22 note) |
| Background presence: watch outcomes, notify, run automations | Vercel functions are request-scoped; nothing can hold a loop (`ARCHITECTURE.md` §1). `/api/live` voice exists only in `server.ts`. | 3.2, 3.3, 4.1, 5.2, 6.x |
| "Local, instant" recall (< 200 ms) | Cloud round-trips cannot reliably hit it (`ROADMAP.md`, ideas critique). | 4.1 |

Everything else — chat, verify/repair, deploy, Travel, Finance, Study — works
in the desktop exactly as on the web, because the desktop reuses the web
bundle. **The desktop is not a second product.** It is the web product plus a
local runtime.

## 1. Decision summary

| Decision | Choice | Reversible? |
|---|---|---|
| Shell | **Electron** (Chromium + Node). Tauri is the fallback if binary size ever matters more than engine determinism. See §2. | Only before D2 — the local runtime bridge is shell-specific. |
| Renderer | **Bundled `dist/`** served on a custom secure scheme `quantora://app`, never `file://`, never a remote page with a local bridge. See §3. | Yes, but the auth story in §4 assumes it. |
| API | The existing hosted API (`https://quantoraai.app/api/*`), reached through one `apiFetch()` wrapper. No business logic in the desktop. See §5. | — |
| Identity | Existing HMAC session (`api/_lib/session.ts`) carried as a **bearer header** instead of a cookie, obtained via a system-browser + PKCE flow. See §4. | — |
| Local runtime | A **`DeskRuntime`** interface with two implementations: `webcontainer` (today's code) and `desktop` (real processes on a real folder). See §6. | — |
| Model calls | Always through `/api/chat`. The desktop never holds server keys; BYOK stays in the OS keychain. | — |

## 2. Shell: Electron, and why not Tauri

| Criterion | Electron | Tauri v2 |
|---|---|---|
| Web engine | One engine (Chromium) on every OS. Matches the ~20 Playwright browser gates in `scripts/*-browser-gate.mjs`; Playwright drives Electron directly. | WebView2 (Chromium) on Windows, **WKWebView on macOS**, WebKitGTK on Linux. Monaco workers, COEP behaviour and `MediaRecorder` differ per OS. `tauri-driver` has no macOS support. |
| Host language | Node/TypeScript. `scripts/runtime-import-gate.mjs` already adjudicates Node ESM — the exact runtime of an Electron main process. | Rust for anything beyond shipped plugins. The repo has no Rust toolchain or Rust reviewers. |
| Process spawning (terminal, git, `npm run dev`) | `child_process` + `node-pty`. | Rust `Command` / sidecars; a pty needs a plugin. |
| Security defaults | Must be configured (§9). Well-documented. | Capability-scoped by default. |
| Binary size | ~120 MB installed. | ~10 MB. |
| Updates, signing, notarisation | `electron-builder` + `electron-updater`, mature. | Tauri updater plugin, mature. |

The deciding line is the first row. `CLAUDE.md` §3 and §10 are about
measuring in the runtime that will actually run. One engine means one set of
measurements; three engines means three, and the repo's gate suite would be
the thing that pays. Tauri's advantages (size, Rust safety) are real but do
not change what the user can do.

## 3. Renderer: bundled, on a custom scheme

Three options were considered:

1. **Load the hosted site** (`https://quantoraai.app`) in a window and inject
   a local bridge. Zero CORS/cookie work, always current. **Rejected:** the
   bridge would hand shell and filesystem access to whatever the remote origin
   serves. An XSS on the website would become code execution on the user's
   machine. Also useless offline, and the bridge protocol would have to be
   versioned across every deploy.
2. **Bundle `dist/` and load it from `file://`.** **Rejected:** `file://` is a
   null origin — no CSP, no cookies, no `crossOriginIsolated`, and Google
   Identity Services refuses it.
3. **Bundle `dist/`, serve it from `quantora://app` via
   `protocol.handle()`** registered as `standard` + `secure`. The renderer
   gets a real, stable origin; CSP and the `vercel.json` header set can be
   replayed on it from `src/lib/vercel-headers.js` (already the single source
   of headers for dev and prod). **Chosen.**

Consequence: the origin is `quantora://app`, not `APP_URL`, so the API must
learn to trust it (§5) and the cookie session does not apply (§4).

Routing needs no change. `src/lib/studio-isolation.js` routes on
`window.location` + `?tab=`; the custom protocol serves `index.html` for
every path exactly like the SPA rewrite in `vercel.json`. The `/desk`
document split exists only because the browser cannot have both
`COOP: same-origin` (WebContainer) and `same-origin-allow-popups` (Google
popup) on one page. On desktop the shell handles both concerns (§4, §6), so
`/desk` simply becomes another path served by the same handler.

## 4. Identity: same session, different carrier

Today (`api/_lib/session.ts`): Google/GitHub/email sign-in ends in
`issueSessionResponse`, which sets `quantora_session=<base64url>.<hmac>` as
an `HttpOnly; SameSite=Lax; Secure` cookie. `getSessionUser(req)` reads only
that cookie. `@react-oauth/google`'s `GoogleLogin` widget
(`src/components/AuthModal.jsx`) needs an authorised JavaScript origin, which
`quantora://` can never be.

Desktop flow (standard native-app OAuth, reusing every existing provider):

```
Desktop                              System browser                     API (api/auth.ts)
  │ generate code_verifier, state      │                                   │
  │─ open https://quantoraai.app/?desktop_auth=1&challenge=…&state=… ─────►│  (SPA, existing AuthModal)
  │                                    │ user signs in with Google/GitHub/email — unchanged
  │                                    │─ POST /api/auth/desktop/grant {challenge,state} (cookie) ─►│
  │                                    │◄─ 302 quantora://auth/callback?code=…&state=… ────────────│
  │◄─ deep link ───────────────────────│                                   │
  │─ POST /api/auth/desktop/exchange {code, code_verifier} ───────────────►│
  │◄─ { token, user }   (token = the same HMAC session token) ─────────────│
  │ store token in safeStorage (OS keychain)                               │
```

Server changes (all fold into `api/auth.ts` via two new `vercel.json`
rewrites — no new function, per `ARCHITECTURE.md` §1):

- `route=desktop-grant` — requires a live cookie session; stores
  `{ challenge, sub }` for ≤ 60 s (Supabase `rate_limits`-style short row or a
  signed, expiring code — the code itself can be an HMAC blob like the
  session, so no table is required); redirects to the deep link.
- `route=desktop-exchange` — verifies `code`, checks
  `SHA256(code_verifier) == challenge`, single-use, returns
  `createSessionToken(user)` in the body.
- `getSessionUser(req)` additionally reads `Authorization: Bearer <token>`
  and runs the identical `readSessionToken` path. One function, one token
  format, two carriers. `authz.ts` `requireActiveSession` needs no change.
- `/api/auth/logout` must accept the bearer carrier too and the desktop
  discards its stored token.

What does *not* change: token format, TTL (7 days; the desktop refreshes by
repeating the flow, silently when the browser still has a cookie), the
`blocked_at` check, admin gating, BYOK header names.

## 5. API access from a foreign origin

Two one-line facts today:

- `applyCors` (`api/_lib/rate-limit.ts:47`) reflects `Access-Control-Allow-Origin`
  only when `Origin === process.env.APP_URL` exactly.
- Every client call is a relative `fetch('/api/…')` — 50 sites across
  `src/`, no base-URL indirection anywhere.

Changes:

1. **`DESKTOP_ORIGIN` env** (`quantora://app`) joins `APP_URL` in `applyCors`.
   Any other origin stays blocked, as now. Add `Authorization` to the
   `Access-Control-Allow-Headers` list.
2. **`src/lib/api-client.js` — `apiFetch(path, init)`.** On the web it is
   `fetch(path, { credentials: 'include', ...init })`. On desktop it prefixes
   the configured base URL and attaches the bearer token from the bridge.
   Callers keep writing the literal `'/api/chat'`, which keeps
   `scripts/platform-dead-control-gate.mjs` working unchanged: the gate greps
   for `/api/...` string literals and would silently stop seeing a
   template-string base URL. Migrating the 50 sites is a mechanical,
   behaviour-preserving PR that lands on the web first (D0 in §11).
3. **SSE unchanged.** `/api/chat` streams `data:` lines parsed from
   `res.body.getReader()` (`src/hooks/useChatStream.js`); `fetch` streaming
   works identically in Electron's renderer.
4. **Base URL is a build-time constant** per channel (`stable` →
   `https://quantoraai.app`, `dev` → `http://localhost:3000`), never a
   user-editable field — a user-editable base URL is a phishing surface for
   the bearer token.

## 6. The local runtime (the reason the desktop exists)

### 6.1 Today's seam

`src/lib/webcontainer.js` already exposes exactly the surface a runtime
needs — `syncVFSToWebContainer(vfs)`, `runCommandInWorkspace(vfs, line)`,
`runGitInWorkspace(vfs, { action, message })` — and `StudioTerminal.jsx`,
`StudioGit.jsx` and `LivePreviewCanvas.jsx` call it. Extract that surface into
an interface and keep the WebContainer code as its first implementation:

```ts
// shared/desk-runtime-contract.ts  (pure types; no DOM, no Node)
export interface DeskRuntime {
  kind: 'webcontainer' | 'desktop';
  capabilities(): { shell: boolean; git: boolean; devServer: boolean; folder: boolean };
  sync(vfs: Vfs): Promise<void>;                         // VFS → runtime FS
  run(line: string, opts: { cwd?: string; signal?: AbortSignal }): AsyncIterable<RunEvent>;
  git(action: GitAction): Promise<GitResult>;
  devServer(): Promise<{ url: string } | null>;
  onExternalChange(cb: (paths: string[]) => void): () => void;   // desktop only
}
```

`studioTerminalBlocker` / `studioGitBlocker` then read
`runtime.capabilities()` instead of `window.crossOriginIsolated`. Their rule
stays: no fake output, ever.

### 6.2 Desktop implementation

Lives in the **Electron main process** (or a `utilityProcess` per workspace so
a runaway `npm install` cannot stall the UI), reached from the renderer through
a `contextBridge` API in the preload. IPC shape is the `DeskRuntime` contract
above, serialised.

| Concern | Implementation |
|---|---|
| Workspace | A real folder the user picks (`dialog.showOpenDialog`) or `~/Quantora/<project>/`. The desk's `vfs` (persisted today in `localStorage.quantora_projects_v1`, `src/hooks/useStudioSession.js`) is written to disk on sync; disk is the truth once a folder is attached. |
| External edits | `fs.watch`/chokidar → `onExternalChange` → the desk reloads those files. Users will open the same folder in VS Code; that must not corrupt the desk. |
| Terminal | `node-pty` spawning the user's shell in the workspace. Output streams to `StudioTerminal` as `RunEvent`s. Every command the model or user runs is visible in the terminal panel — no hidden execution. |
| Git | The system `git` binary via the same pty. If git is missing, `capabilities().git === false` and the blocker says so. `SHARED_GITHUB_WRITES_AVAILABLE = false` (`StudioGit.jsx`, #452) is untouched; PR creation still goes through the API when that seam is re-enabled. |
| Preview | Run the project's real dev server (`npm run dev`) and point `LivePreviewCanvas` at `http://127.0.0.1:<port>`. No COEP/COOP requirement, no `embed.html` shim, no blob URL. The existing `buildPreviewSandbox()` invariant (no `allow-same-origin` for generated code) stays for the static-HTML preview path. |
| Confinement | Every path from the renderer is resolved and checked to be inside the attached workspace root before any fs call. `..`, symlinks out of root and absolute paths are rejected in the main process, not the renderer. |
| Consent | Attaching a folder is an explicit native dialog. The desk shows the attached path permanently. Detach clears runtime state. |

### 6.3 The model still lives on the server

The verify → repair loop (`api/_lib/verify-build.ts`, `api/_lib/repair.ts`),
the QIR run journal (`api/qir-runs.ts`) and every planner stay where they are.
What the desktop adds is a **richer observation channel**: real exit codes, real
stderr and real dev-server errors flow back into the same `task: "repair"` and
`observations[]` shapes that WebContainer feeds today. The doctrine in
`CLAUDE.md` ("Detect → diagnose → propose → verify → apply") is unchanged; the
detector just becomes honest about the machine it runs on.

Direct model calls from the desktop with a BYOK key are **out of scope for
v1**. It would create the second implementation of chat policy that
`server.ts`'s header comment warns about.

## 7. The persistent host (Phase 3 and 6 land here)

Serverless cannot hold a loop; the desktop can. v1 ships the body, not the
brain:

- **Tray + background window.** Closing the window keeps the process; a
  preference turns this off.
- **Notification channel.** Electron `Notification` bound to the restraint
  policy (ROADMAP 6.3: budget, quiet hours). The web has no `Notification`
  usage today, so the desktop is the first and only channel.
- **Watch loop.** A scheduler polls existing endpoints on a bounded cadence
  (`/api/outcomes`, `research_watches` via the research desk API) and raises a
  notification only for events the user opted into. Nothing acts
  unilaterally; a notification opens the desk at the relevant outcome.
- **Local recall cache.** A JSON/SQLite mirror of `outcome_states` and
  `projects` for the current user, refreshed from `/api/projects
  {action:'list'}` on focus. This is what makes the "< 200 ms" bar reachable;
  the server stays authoritative and the cache is dropped on logout.
- **Voice (`/api/live`).** The dev-only WebSocket bridge in `server.ts` can
  finally have a host, but the bridge needs a Gemini key. Two honest options:
  BYOK Gemini from the keychain, or a server-minted ephemeral token endpoint.
  Neither is v1; ROADMAP 5.2 still applies.

## 8. Repository layout and gates

Single-package repo, no workspaces. Add one top-level directory and teach the
gates about it in the same PR (`CLAUDE.md` §7: fix the instance, close the
class):

```
desktop/
  main/           Electron main: window, protocol handler, updater, tray, auth broker
  preload/        contextBridge surface (the only renderer↔host boundary)
  runtime/        DeskRuntime desktop implementation: fs, pty, git, dev server, watcher
  build/          electron-builder config, icons, entitlements
shared/
  desk-runtime-contract.ts     (types shared by src/ and desktop/)
  desktop-bridge-contract.ts   (IPC message schema, versioned)
src/lib/
  api-client.js                apiFetch()
  desk-runtime/{webcontainer,desktop}.js
```

| Gate | Today | Change |
|---|---|---|
| `scripts/runtime-import-gate.mjs` | `ROOTS = ['api','shared']` + `server.ts` | Add `desktop`. The main process is Node ESM in production — the archiver class of bug applies verbatim. |
| `scripts/wiring-gate.mjs` | `SOURCE_DIRS = ['src','shared','api','scripts']` | Add `desktop`; regenerate `src/lib/wiring-baseline.json` with `--update` once, and read the diff. |
| `scripts/platform-dead-control-gate.mjs` | greps `src/` for `/api/...` literals | No change needed **because** `apiFetch` keeps literals. Add a contract test asserting `api-client.js` never builds paths from templates. |
| `npm run lint` | repo-wide `tsc` | Add `desktop/**` to `tsconfig.json` `include`; keep `--stack_size=8192`. |
| `eslint 'src/**/*.{js,jsx}'` | | Widen to `desktop/**`. |
| Browser gates (`scripts/*-browser-gate.mjs`) | drive `vite preview` in Chromium | Unchanged for the web. Add `scripts/desktop-smoke-gate.mjs` (§10). |
| `src/lib/vercel-headers.test.js` | asserts the header set | Extend: the protocol handler must serve the same header set for `/` and `/desk`. |
| `src/lib/deployed-gate-contract.test.js` pattern | | New `desktop-bridge-contract.test.js`: renderer and preload agree on every IPC channel name and payload version, so they cannot drift silently. |

## 9. Security posture

The desktop widens the blast radius of any renderer bug from "your session"
to "your machine". Non-negotiables:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
  `webSecurity: true`. The renderer never sees Node.
- The preload exposes a **fixed, enumerated** API; no `ipcRenderer` passthrough,
  no `eval`-shaped channel. Every message validated with `zod` (already a
  dependency) against `shared/desktop-bridge-contract.ts` in the main process.
- Navigation and `window.open` are denied except to `quantora://app` and the
  system browser (`shell.openExternal`) for auth/links. The preview iframe
  keeps its sandbox.
- Bearer session and BYOK keys live in `safeStorage` (Keychain / DPAPI /
  libsecret). BYOK keys stay memory-only in the renderer, as
  `src/lib/client-secrets.js` enforces today.
- Deep-link handler validates `state`, and `exchange` is PKCE-bound and
  single-use. A deep link with no pending auth is dropped.
- Filesystem and process access are confined to the attached workspace root;
  the main process enforces it, not the renderer.
- CSP served for `quantora://app` is the `/desk` policy from `vercel.json`
  plus the loopback dev-server origin for preview, generated from
  `src/lib/vercel-headers.js` — never hand-copied (the COEP drift incident in
  that file's header comment is the reason).
- Updates are signed and delivered over HTTPS; the updater rejects unsigned
  builds. No update, no shell — a compromised update is a compromised machine.
- Telemetry stays on the existing `/api/product-event` with the same
  privacy rules (no bodies, no raw IP). Add `host: 'desktop'` and app version.

## 10. Verification: what proves it works

Per `CLAUDE.md`, a gate must be shown failing with the bug present before it
counts. For each phase the acceptance is a runnable check, not a demo:

| Check | What only it catches |
|---|---|
| `scripts/desktop-smoke-gate.mjs` (Playwright `_electron`) | The shell boots, serves `quantora://app`, signs in with a synthetic token, opens the Coding Desk, runs `echo quantora-$RANDOM` in the **real** terminal and asserts that exact string appears. Fails if the terminal ever prints something the shell did not. |
| Existing browser gates run against the Electron window (same scripts, different launcher) | The bundled renderer behaving differently from `vite preview` — Monaco workers, COEP, clipboard. |
| `desktop-bridge-contract.test.js` | Preload and renderer disagreeing on an IPC channel. |
| `api/_lib/session.test.ts` additions | Bearer and cookie carriers yielding the same user; a tampered bearer rejected; `exchange` refusing a reused code and a wrong verifier. |
| `api/_lib/rate-limit` CORS test | `quantora://app` reflected, any other origin not. |
| Path-confinement unit test in `desktop/runtime` | `../`, symlink escape and absolute paths rejected with the workspace attached. |
| Manual, recorded per release | Notarised macOS build launches on a clean machine with Gatekeeper on; Windows SmartScreen shows the publisher. |

## 11. Phasing

Each phase ships to `main` independently and leaves the web untouched or
better.

**D0 — Server and seam prep (web-only, no behaviour change).**
`apiFetch()` and the 50-site migration · bearer carrier in `session.ts` ·
`DESKTOP_ORIGIN` in `applyCors` · `desktop-grant` / `desktop-exchange` routes
folded into `api/auth.ts` with rewrites · `DeskRuntime` contract extracted,
WebContainer as implementation #1 · gate extensions from §8.
*Accept:* `npm run test:all` green, every browser gate green, `curl` with a
bearer token returns the same `/api/auth/session` body as the cookie.

**D1 — Shell MVP.** Electron main + preload, custom protocol serving `dist/`,
system-browser auth, tray optional. All desks work exactly as on the web.
WebContainer is *not* wired on desktop (its origin-bound licence and the
COEP replay are not worth it when D2 replaces it); the terminal blocker says
"attach a folder to get a real shell".
*Accept:* `desktop-smoke-gate` boots and signs in; the platform-experience and
studio-regression browser gates pass inside Electron.

**D2 — Local runtime.** Folder attach, pty terminal, git, dev-server preview,
external-change watcher, path confinement. Observations flow to repair.
*Accept:* the smoke gate's real-terminal assertion; a `repair` turn triggered
by a real `npm run build` failure; the desk survives a file edited in VS Code.

**D3 — Persistent host.** Tray-resident background, notifications under the
restraint policy, watch loop, local recall cache.
*Accept:* a `research_watches` hit raises exactly one notification, opens the
right outcome, and quiet hours suppress it.

**D4 — Distribution.** `electron-builder` targets (dmg/zip, nsis, AppImage/deb),
Apple notarisation, Windows signing, `electron-updater` against GitHub
Releases, `.github/workflows/desktop-release.yml` on tags, crash reporting.
*Accept:* an update from N to N+1 installs unattended and the smoke gate
passes on the updated build.

## 12. Infrastructure and accounts needed

| Item | Why | Phase |
|---|---|---|
| `DESKTOP_ORIGIN=quantora://app` env on Vercel (all environments) | CORS reflection in `applyCors` | D0 |
| Two `vercel.json` rewrites (`/api/auth/desktop/grant`, `/api/auth/desktop/exchange`) | Stay inside the function budget | D0 |
| `quantora://` URL scheme registration (macOS `CFBundleURLTypes`, Windows registry via installer, Linux `.desktop`) | Deep-link auth callback | D1 |
| Apple Developer Program (Developer ID cert + notarisation) | Gatekeeper | D4 |
| Windows code-signing certificate (Azure Trusted Signing or EV) | SmartScreen | D4 |
| GitHub Releases as the update feed, `GH_TOKEN` in the release workflow | `electron-updater` | D4 |
| A macOS and a Windows CI runner (GitHub-hosted is enough) | Native builds and the smoke gate on each OS | D1+ |
| Crash reporter endpoint (Sentry or Electron's `crashReporter` to a bucket) | Native crashes never reach `/api/product-event` | D4 |
| New dev dependencies: `electron`, `electron-builder`, `electron-updater`, `node-pty`, `chokidar` | Shell, packaging, pty, watcher | D1/D2 |

No new Supabase tables are required for D0–D2. D3's watch loop reads existing
tables. The one-time auth code is an HMAC blob like the session token, so it
needs no storage; if replay protection stronger than the 60 s TTL is wanted,
reuse the `rate_limits` table as a single-use ledger.

## 13. Explicitly out of scope for v1

- **Local API mode** (bundling `dist/server.cjs` and running the whole API on
  the laptop). It is the self-host path, not the desktop path: it drags
  Supabase, rate limits and secrets onto the user's machine and creates the
  second implementation the repo has spent months removing.
- Direct provider calls from the desktop (see §6.3).
- Voice via `/api/live` (see §7).
- Offline chat. Offline *reading* of the local recall cache is in D3; offline
  generation is not a goal.
- Mobile. Nothing here transfers; the value is the local runtime.

## 14. Open decisions for the founder

1. **Electron vs Tauri** — recommendation and reasoning in §2. This is the one
   decision that becomes expensive after D2.
2. **Distribution channel** — GitHub Releases (free, sufficient) vs a hosted
   bucket. Only the update feed URL changes.
3. **Should the desktop be the only place the Coding Desk terminal exists?**
   If yes, the WebContainer path and the `/desk` document split can be retired
   after D2, which removes the COOP/COEP class of incidents from the web
   entirely. If no, both runtimes stay behind `DeskRuntime` indefinitely.
