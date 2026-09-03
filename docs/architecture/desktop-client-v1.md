# Quantora Desktop Client — v1 design

**Status:** D0–D3 built and D4's packaging/release pipeline written
(2026-09-02); signing and notarisation wait on accounts (§12). Answers ROADMAP
Phase 4.1 ("Tauri/Electron shell — the body the cognitive layer needs"). Every
claim about the platform below was read from the code and cites the file; §11
records what each phase was accepted by.

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
| Renderer | **A dedicated desktop UI** (`desktop/renderer`: sign-in → launcher → workspace), served on a custom secure scheme `quantora://app`, never `file://`, never the website and never a remote page with a local bridge. See §3. | Yes, but the auth story in §4 assumes the scheme. |
| API | The existing hosted API (`https://quantoraai.app/api/*`). The renderer keeps calling relative `/api/...`; the host's protocol handler proxies those calls and attaches the bearer. No business logic in the desktop. See §5. | — |
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
3. **Bundle the website's `dist/` and serve it from `quantora://app`.**
   Built first (D1), and **rejected on use**: it put the whole website —
   landing page, hub, every desk — inside a window, which is a wrapper, not
   a client. A desktop client is a login screen, a launcher and a
   workspace, like Cursor or the Claude app.
4. **A dedicated desktop renderer, served from `quantora://app` via
   `protocol.handle()`** registered as `standard` + `secure`. **Chosen.**
   `desktop/renderer` is its own Vite app (React, Monaco, xterm) with three
   screens: sign-in, launcher (open folder, clone, recent), workspace
   (explorer, editor tabs, terminal, git, Quantora chat on the folder). It
   shares *pure* logic with the website — `shared/` contracts and the reply
   parser in `src/lib/studio-preview-helpers.js` — never pages or components.
   It is served under the desktop's own strict CSP (`script-src 'self'`,
   `connect-src 'self'`, `frame-src 'none'`), not the website's.

Consequence: the origin is `quantora://app`, not `APP_URL`, so the cookie
session does not apply (§4) and every API call goes through the host (§5).

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
  │─ open /api/auth/desktop/grant?challenge=…&state=… ─────────────────────►│
  │                                    │◄─ no cookie: 302 /?desktop_auth=1&challenge=…&state=… ────│
  │                                    │ SPA stashes the handoff, user signs in with Google/GitHub/email — unchanged
  │                                    │─ GET /api/auth/desktop/grant (cookie) ────────────────────►│
  │                                    │◄─ HTML page linking quantora://auth/callback?code=…&state=…│
  │◄─ deep link ───────────────────────│                                   │
  │─ POST /api/auth/desktop/exchange {code, codeVerifier} ────────────────►│
  │◄─ { token, user }   (token = the same HMAC session token) ─────────────│
  │ store token in safeStorage (OS keychain); reload quantora://app/?auth=success
```

Server changes (all fold into `api/auth.ts` via two new `vercel.json`
rewrites — no new function, per `ARCHITECTURE.md` §1):

- `route=desktop-grant` — with a cookie session, mints a grant code: an
  HMAC blob under a separate domain prefix carrying the user and the
  challenge, 60 s TTL, three dot-separated parts so it can never verify as a
  session token (`api/_lib/desktop-auth.ts`). Returned on an HTML page that
  links the deep link (browsers prompt on a bare 302 into a custom scheme).
  Without a cookie it bounces to the SPA with the handoff parameters.
- `route=desktop-exchange` — verifies `code`, checks
  `SHA256(codeVerifier) == challenge`, single-use per instance, returns
  `createSessionToken(user)` in the body. Every rejection is the same 400.
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

**Built (D1): the host proxies `/api/*`.** The first draft of this section
planned an `apiFetch()` wrapper and a `DESKTOP_ORIGIN` CORS entry. Building
D1 showed both were unnecessary: `quantora://app` is served by the shell's
own `protocol.handle()`, so `/api/*` requests from the renderer arrive in
the main process, which forwards them to the API origin with
`Authorization: Bearer` attached (`desktop/main/api-proxy.ts`,
`api-proxy-policy.ts`). Consequences:

1. **Zero call-site changes.** The 50 relative fetches keep working as
   written, and `scripts/platform-dead-control-gate.mjs` keeps seeing every
   `/api/...` literal.
2. **No CORS change.** A main-process fetch is not a browser request; the
   `APP_URL` rule is untouched and `DESKTOP_ORIGIN` does not exist.
3. **The token never enters the renderer.** It is read from the keychain
   store in main and attached there. A page cannot read or forge it, and a
   page-supplied `Authorization` or `Cookie` header is dropped
   (`upstreamHeaders` allowlist).
4. **SSE unchanged.** `/api/chat` bodies stream through the proxy untouched;
   `res.body.getReader()` in `src/hooks/useChatStream.js` works as on the web.
5. **Base URL is a build-time constant** per channel (`QUANTORA_API_ORIGIN`
   env at build/dev time, default `https://quantoraai.app`), never a
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

**Built (D2)** as `desktop/runtime/*` behind the existing seams: inside the
desktop, `runCommandInWorkspace` and `runGitInWorkspace` in
`src/lib/webcontainer.js` sync the desk's files to the attached folder and
run there (`src/lib/desk-runtime.js`); the terminal and git panes are
unchanged except for the blocker copy and an "Attach folder" action
(`src/hooks/useDesktopRuntime.js`). Collected-output mode uses
`child_process` with the user's login shell, ANSI stripped, output capped
to its tail, silent-timeout kill; a streaming pty terminal is the D2b step
and brings `node-pty` with it. Not yet built: the external-change watcher
and the dev-server preview (D2b). Sync never deletes: a file the user
created in their editor is not the desk's to remove.

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
desktop/                        own package.json + lockfile; Electron never enters the root install
  main/           Electron main: config, protocol handler, static server, api proxy,
                  auth broker + auth-flow (pure), session store (keychain), window, ipc
  preload/        contextBridge surface (the only renderer↔host boundary)
  runtime/        DeskRuntime desktop implementation: fs, pty, git, dev server, watcher (D2)
  build/          electron-builder config, entitlements
  build.mjs       esbuild → dist/main.cjs + dist/preload.cjs
shared/
  desktop-contract.js          scheme, routes, param names, validators (API + web + desktop)
  desktop-bridge-contract.js   IPC channel names, bridge shape, versioned
  desk-runtime-contract.ts     (D2)
src/lib/
  desktop-bridge.js            getDesktopBridge() — null on the website
  desktop-auth-handoff.js      finishes a desktop sign-in inside the browser
  desk-runtime/{webcontainer,desktop}.js   (D2)
scripts/
  desktop-smoke-gate.mjs       Playwright drives the real shell (CI job: desktop-smoke)
```

| Gate | Today | Change |
|---|---|---|
| `scripts/runtime-import-gate.mjs` | `ROOTS = ['api','shared']` + `server.ts` | Add `desktop`. The main process is Node ESM in production — the archiver class of bug applies verbatim. |
| `scripts/wiring-gate.mjs` | `SOURCE_DIRS = ['src','shared','api','scripts']` | Add `desktop`; regenerate `src/lib/wiring-baseline.json` with `--update` once, and read the diff. |
| `scripts/platform-dead-control-gate.mjs` | greps `src/` for `/api/...` literals | No change needed **because** the host proxies relative paths; no call site changed. |
| `npm run lint` | repo-wide `tsc` | `desktop/` is **excluded** from the root pass and typechecked by its own `tsconfig.json` in the `desktop-smoke` job: the root job installs only the root package, so Electron's types are absent there and the first CI run went red exactly as `CLAUDE.md` §10 predicts. Pure modules that both sides share stay under `shared/`, which the root pass still covers. |
| `eslint 'src/**/*.{js,jsx}'` | | Widen to `desktop/**`. |
| Browser gates (`scripts/*-browser-gate.mjs`) | drive `vite preview` in Chromium | Unchanged for the web. Add `scripts/desktop-smoke-gate.mjs` (§10). |
| `src/lib/vercel-headers.test.js` | asserts the header set | Extend: the protocol handler must serve the same header set for `/` and `/desk`. |
| `src/lib/deployed-gate-contract.test.js` pattern | | `shared/desktop-bridge-contract.test.js`: preload and main both reference every IPC channel in the contract and never name one by string literal, so they cannot drift silently. |

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

**D0 — Server prep (web-only, no behaviour change). Built.**
Bearer carrier in `session.ts` · `desktop-grant` / `desktop-exchange` routes
folded into `api/auth.ts` with rewrites, mirrored in `server.ts` ·
`shared/desktop-contract.js` · the browser-side handoff
(`src/lib/desktop-auth-handoff.js`, wired in `App.jsx`). The planned
`apiFetch()` migration and `DESKTOP_ORIGIN` were dropped (§5).
*Accepted by:* `api/_lib/session-bearer.test.ts`, `api/_lib/desktop-auth.test.ts`,
and an end-to-end run against the Express mirror (bounce → grant → exchange →
bearer restore → tampered bearer → replay).

**D1 — Shell + desktop UI. Built, then rebuilt.** Electron main + sandboxed
preload, `quantora://app`, `/api/*` proxied with the bearer, system-browser +
PKCE sign-in over the `quantora://` deep link, keychain session store,
navigation pinned to the app origin, native menu bar. The first cut served
the website bundle and was replaced the same day by `desktop/renderer` (§3):
sign-in screen, launcher with open/clone/recent, workspace with explorer,
Monaco tabs, terminal, git panel and the chat on the folder. The website is
untouched apart from the browser-side sign-in handoff.
*Accepted by:* `scripts/desktop-smoke-gate.mjs` (CI job `desktop-smoke`),
thirty-one checks through every screen, no network.

**D2 — Local runtime. Built.** Folder open through a native dialog (and
`git clone` into a picked parent), explorer and editor reads/writes with
path confinement enforced in main (`shared/desk-runtime-contract.js`,
`desktop/runtime/workspace-policy.ts`, `files.ts`), an external-change
watcher (chokidar) that refreshes the explorer and reloads clean editors,
a streaming pty terminal (xterm ↔ node-pty) with an honest collected-output
fallback when node-pty did not build, real git for the desk's four verbs,
and the chat: the folder's text files go to `/api/chat` as the desk, the
reply's files are written back, and the message says exactly which.
*Accepted by:* `desktop/runtime/*.test.ts` against real processes, and the
smoke gate's runtime section — a refused command before attach, an attach,
a refused escape with proof nothing landed outside the folder, an exact
echoed nonce, a file read back from disk, a real exit code, `git init` and a
commit that exist on disk, and `push` refused.
*Still open (D2b):* dev-server preview inside the workspace, observations
from real build failures flowing into `task: "repair"`, and a diff review
before the chat's files are written.

**D3 — Persistent host. Built (first loop).** Tray-resident background
(`desktop/main/tray.ts`; closing the window hides it, Quit in the tray
really quits, and a session where no tray can be created falls back to
close-means-quit), native notifications, and the watch loop
(`desktop/main/watch-loop.ts`) that asks the existing `research-watch list`
task hourly while signed in and raises at most one notification per flagged
question until it is acknowledged on the desk. Restraint
(`desktop/main/watch-policy.ts`): quiet hours 22:00–08:00 local, three per
rolling hour, a suppressed question is retried next pass, never dropped.
*Accepted by:* `watch-policy.test.ts` (diff, dedupe-until-acknowledged,
quiet hours across midnight, rolling budget, copy) and the smoke gate:
capabilities reported as booleans from the real `Notification.isSupported()`
and tray state, a poll against a mirror without the watch store reporting
its 503 and raising nothing, and no poll at all once signed out.
*Still open:* the local recall cache; a notification click opens the studio
tab, not yet the specific research question; the restraint policy is not
yet a user preference.

**D4 — Distribution. Pipeline written, signing pending.**
`desktop/build/electron-builder.json` (dmg/zip, nsis, AppImage/deb; the web
bundle and vercel.json ship as resources; `quantora://` registered as a
protocol) and `.github/workflows/desktop-release.yml` on `desktop-v*` tags,
publishing to GitHub Releases as the `electron-updater` feed. Signing and
notarisation are opt-in by secret and are the founder's step (§12); until
then the workflow produces unsigned builds and says so.
*Still open:* wiring `electron-updater` into the main process, a real icon
set, crash reporting, and the accept criterion — an update from N to N+1
installing unattended with the smoke gate green on the updated build.

## 12. Infrastructure and accounts needed

| Item | Why | Phase |
|---|---|---|
| Two `vercel.json` rewrites (`/api/auth/desktop/grant`, `/api/auth/desktop/exchange`) | Stay inside the function budget | D0 |
| `quantora://` URL scheme registration (macOS `CFBundleURLTypes`, Windows registry via installer, Linux `.desktop`) | Deep-link auth callback | D1 |
| Apple Developer Program (Developer ID cert + notarisation) | Gatekeeper | D4 |
| Windows code-signing certificate (Azure Trusted Signing or EV) | SmartScreen | D4 |
| GitHub Releases as the update feed, `GH_TOKEN` in the release workflow | `electron-updater` | D4 |
| A macOS and a Windows CI runner (GitHub-hosted is enough) | Native builds and the smoke gate on each OS | D1+ |
| Crash reporter endpoint (Sentry or Electron's `crashReporter` to a bucket) | Native crashes never reach `/api/product-event` | D4 |
| New dependencies (in `desktop/package.json` only): `electron`, `electron-builder`, `esbuild`, `electron-updater` now; `node-pty`, `chokidar` with D2b | Shell, packaging, updater; pty and watcher | D1/D2b |

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
