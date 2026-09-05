# Quantora Desktop — from built to shipped

**Status:** 2026-09-05. The client is built (`desktop/`, 4,174 lines, 31-check
smoke gate green on every push). Nothing has been packaged, signed, hosted or
updated — zero installers exist. This document explains that gap, designs the
distribution plane that closes it, and phases the work with exit criteria.

Read `desktop-client-v1.md` first: it decided the shell, the renderer, the
identity carrier and the local runtime, and those decisions stand. This
document only adds the part v1 called D4 and never finished.

---

## 0. What happened, dated

| when | what | evidence |
|---|---|---|
| Sep 2 | v1 design merged (PR #490). Electron over Tauri; dedicated renderer over website-in-a-window. | `desktop-client-v1.md` |
| Sep 2–3 | D0 server routes, D1 shell, D2 local runtime, D3 tray + watch loop built. First renderer served the website bundle and was rejected on use; rebuilt the same day as three screens. | PR #496, 82 files |
| Sep 3 | CI red twice, both fixed at the root: desktop typechecked by its own toolchain; smoke gate reads `location.href` instead of Playwright's cached URL. Merged. | runs 1959, 1992, 1993 |
| Sep 5 | The release workflow could never have run: `.gitignore`'s bare `build/` matched `desktop/build/` at every depth, so electron-builder's config and the macOS entitlements were never committed. Fixed; icon added; signing made conditional on credentials. | PR #549, `desktop/release-inputs.test.js` |
| Sep 5 | Zero tags, zero releases, zero installers. Login never exercised against production. | `git tag -l 'desktop-v*'` empty; releases API `[]` |

## 1. Why there is nothing to install

Not one cause. Five, each hiding the one behind it:

| # | gap | consequence | kind |
|---|---|---|---|
| 1 | **The pipeline was never exercised.** No `desktop-v*` tag has ever been pushed. | The missing-config bug survived two merges because nothing ever read the config. | process |
| 2 | **Installers cannot be built here.** The development sandbox is Linux with no route to Electron's native-header CDN; `node-pty` cannot even rebuild. | A `.dmg` or `.exe` needs a macOS or Windows host — the GitHub-hosted runners in `desktop-release.yml`, or a laptop. | environment |
| 3 | **No signing identity.** No Apple Developer ID, no Windows Authenticode certificate. | A downloaded Mac build says *"Quantora is damaged and can't be opened."* Windows says *"Windows protected your PC."* Both read as broken, not unsigned. | purchasing + legal |
| 4 | **No public host.** The repository is private; GitHub Release assets require authentication. | A download link on the website 404s for everyone but the owner. | infrastructure |
| 5 | **No update path.** `electron-updater` is a dependency that nothing calls. | Every installed copy is frozen at its version. A client that runs a shell and git on people's real folders with no remote fix path is the wrong thing to ship. | code |

And two things that are not gaps but unproven claims:

- Sign-in has only ever run against the local Express mirror. Production
  serves the routes (`vercel.json` → `api/auth.ts` → `auth-desktop-grant.ts`
  / `auth-desktop-exchange.ts`), but no packaged app has completed the flow.
- The `quantora://` scheme registration lives in the packaging config and
  only takes effect in a packaged build. The smoke gate runs unpackaged.

The short version: **the client is done; the product around the client —
packaging, trust, distribution, updates, observability — is 0 of 5.**

## 2. Architecture: the plane that is missing

v1 has four planes and they all exist:

| plane | where | state |
|---|---|---|
| Identity | PKCE handoff over the system browser, HMAC bearer, OS keychain (`desktop/main/auth-*.ts`, `session-store.ts`) | built, mirror-proven |
| Host | `quantora://app` protocol, `/api/*` proxy with the bearer attached in main, enumerated IPC v3, path confinement, pty, git, watcher, tray, watch loop (`desktop/main`, `desktop/runtime`) | built, gate-proven |
| Renderer | Vite + React, Monaco, xterm; sign-in → launcher → workspace; strict CSP (`desktop/renderer`) | built, gate-proven |
| Server | unchanged Vercel API + two rewrites | built, deployed |

The fifth plane is what v1 called D4 and is the subject of this document:

```
 tag desktop-v*                    GitHub Actions (desktop-release.yml)
      │                       ┌─────────────────────────────────────────┐
      └──────────────────────►│ macos-latest   windows-latest   ubuntu  │
                              │  build ─► sign ─► notarise              │
                              │  build ─► sign (Authenticode)           │
                              │  build                                  │
                              └───────────────┬─────────────────────────┘
                                              │ .dmg .zip .exe .AppImage .deb
                                              │ latest-mac.yml latest.yml latest-linux.yml
                     ┌────────────────────────┴───────────────────┐
                     ▼                                            ▼
     GitHub Release draft (private)              Object storage, public read
     archival · release notes · nothing links     downloads.quantoraai.app/desktop/
     here                                          ├─ installers
                                                   └─ update manifests
                                                          ▲            │
                    website /download ────── links ───────┘            │ electron-updater
                    (OS + arch detection)                              │ provider: generic
                                                                       ▼
                                                            user's machine
                                                            polls on launch, installs on quit
```

Four design decisions in that picture, each one with a reason:

**The update feed is the public bucket, not GitHub.** `electron-updater`'s
GitHub provider works against a private repository only if the app embeds a
GitHub token at runtime. A token inside a distributed binary is a leaked
token. So the feed is the `generic` provider pointed at the same public
storage the download page uses; GitHub Releases stays as the archival record
and the place release notes live.

**Signing is conditional, and the unsigned state is explicit.**
`desktop/build/signing-policy.cjs` reads the credentials present and produces
one of three configurations — unsigned on purpose, signed, or signed and
notarised — pinned by `signing-policy.test.js`. An unsigned build is for
testing and is refused by Gatekeeper once downloaded; the config says so at
build time rather than letting a missing secret fail the job twenty minutes in.

**The updater is the security boundary, so it has rules.** Updates are only
fetched over HTTPS from the one build-time constant origin, only installed
when signed, and the app never accepts a user-editable feed URL — the same
phishing-surface reasoning that made the API origin a build-time constant in
v1 §5. Rollback is re-pointing the manifest at the previous build, not
shipping a new one.

**One artifact set, three sinks.** The workflow builds once per platform and
uploads to the run (for CI evidence), to the release draft (archive), and to
the bucket (distribution). No sink is built from another.

### 2.1 Trust chain per platform

| platform | requirement | without it | cost / lead time |
|---|---|---|---|
| macOS | Apple Developer Program → *Developer ID Application* certificate, hardened runtime, `notarytool` submission, stapled ticket | Gatekeeper: "damaged and can't be opened" (Apple Silicon treats an unnotarised download as corrupt, not merely unsigned) | $99/yr · enrolment usually 1–2 days |
| Windows | Authenticode code-signing certificate. Since 2023 keys must live on a hardware token or cloud HSM; **Azure Trusted Signing** is the low-friction alternative (~$10/mo) where its eligibility rules allow | SmartScreen: "Windows protected your PC" until enough reputation accrues, which unsigned builds never do | $200–400/yr (OV/EV) · **organisation validation 1–3 weeks — the long pole** |
| Linux | none | AppImage/deb run as-is | — |

### 2.2 Technology stack, named

**Client (`desktop/`, own package and lockfile)**
Electron 44.1.1 · TypeScript 5.8 · esbuild for main and preload
(`build.mjs` → `dist/main.cjs`, `dist/preload.cjs`) · Vite 6 + React 19 for
the renderer · Monaco (workers served from `/monaco/`) · `@xterm/xterm` 6 +
`node-pty` (collected-output fallback when the native module is absent) ·
chokidar 5 · `safeStorage` for the bearer session · `electron-builder`
26.15.3 · `electron-updater` 6.6.4.

**Server (unchanged)**
Vercel serverless functions (Node ESM) · Supabase · HMAC session in
`api/_lib/session.ts` with cookie and bearer carriers · `/api/chat` SSE.

**Build and verification**
GitHub Actions: `ci.yml` (`desktop-smoke` job: typecheck, Vite build, Playwright
`_electron` under Xvfb against the Express mirror) · `desktop-release.yml`
(matrix of `macos-latest`, `windows-latest`, `ubuntu-latest` on `desktop-v*`
tags) · the repo's gate suite with `desktop` in every root · `desktop/release-inputs.test.js`
(asks git, not the filesystem, whether the release's inputs are committed).

**Distribution (new)**
Object storage with public read and a custom domain — Cloudflare R2 supports
a custom domain natively; Vercel Blob is simpler to wire from this stack but
serves from its own hostname unless fronted by a rewrite · GitHub Releases
for archive and notes · `electron-updater` `generic` provider.

**Observability (new)**
Sentry's Electron SDK, or Electron's `crashReporter` to a bucket, for native
crashes (they never reach `/api/product-event`) · product events on the
existing endpoint with `host: 'desktop'` and the app version · version and
update channel in `hostInfo` so the renderer can show them.

## 3. Roadmap

Each phase has an exit criterion that is a runnable check or a recorded
observation, per `CLAUDE.md` §2 and §10 — never a demo. Phases R0 and R1
run in parallel; R1's lead time is the schedule.

### R0 — Prove the build exists · 1–2 days · $0

Tag `desktop-v0.1.0`. Let the three runners build for the first time. Fix
what breaks (expect at least one snag: `node-pty` on the runners, the
unsigned-mac path, the AppImage). Download as the repository owner, install
on a Mac past Gatekeeper (right-click → Open, or `xattr -dr
com.apple.quarantine`), sign in against production.

*Exit:* a packaged build completes the PKCE handoff against
`quantoraai.app` and lands on the launcher — recorded — and the deep link
is proven to reach the app on a machine where it was installed, not launched
from a terminal.

### R1 — Trust · 1–3 weeks, mostly waiting · ~$300–500/yr

Start today: Windows certificate purchase or Trusted Signing enrolment
(organisation validation is the long pole). Apple Developer enrolment.
Secrets into the repository: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`,
`WIN_CSC_KEY_PASSWORD`. The signing policy flips on by itself.

*Exit:* `spctl --assess --type execute Quantora.app` passes on a clean Mac
with Gatekeeper on; the Windows installer shows the publisher name in
SmartScreen; `signing-policy` reports `macNotarize=true winSign=true` in the
release log.

### R2 — Distribute · 2–3 days of code

Bucket with public read and the download domain. Workflow step uploading
installers and `latest*.yml` manifests after packaging. `/download` page on
the website with OS detection and, on macOS, Apple Silicon vs Intel. Wire
`electron-updater` in `desktop/main` with the `generic` provider: check on
launch, download in the background, install on quit, surface the state in
`hostInfo` and the launcher.

*Exit:* the updater gate — install 0.1.0, publish 0.1.1 to the bucket,
relaunch, the app updates unattended, and the smoke gate is green on the
updated build. Also: the download page's links resolve to real objects and
the checksums match the run artifacts.

### R3 — Operate · 1 week

Crash reporting with version and OS in every report. Product events tagged
`host: 'desktop'`. A release checklist in this directory: tag, watch the
run, verify manifests, verify the download page, smoke the update. A
rollback rehearsal: re-point the manifest at 0.1.0 and watch a 0.1.1 client
refuse to downgrade (it should — downgrades are a separate decision).

*Exit:* a deliberately crashed test build appears in the crash dashboard with
version and platform within minutes; the release checklist has been run once
end to end by someone other than its author.

### R4 — Product completeness · 2–4 weeks

The items v1 left open: dev-server preview inside the workspace; diff review
before the chat's files are written to disk; real build failures flowing
into `task: "repair"` as observations; the local recall cache; a
notification click opening the specific research question; the restraint
policy as a preference. Each ships with its gate.

### R5 — Decide the WebContainer question

v1 §14 decision 3: once the desktop is the only place the Coding Desk
terminal exists, the WebContainer path and the `/desk` COOP/COEP split can be
retired from the web, removing that class of incident. Not before R3 is
stable.

## 4. Infrastructure and accounts

| item | phase | owner | cost | lead time |
|---|---|---|---|---|
| Apple Developer Program | R1 | founder | $99/yr | 1–2 days |
| Windows code-signing (cert or Azure Trusted Signing) | R1 | founder | $200–400/yr or ~$10/mo | **1–3 weeks** |
| Seven repository secrets (above) | R1 | founder | — | minutes |
| Object storage bucket, public read, custom domain | R2 | founder creates, engineering wires | ~$0–5/mo at this scale | 1 hour |
| `downloads.quantoraai.app` DNS | R2 | founder | — | 1 hour |
| Crash reporting account (Sentry) | R3 | founder | free tier | 30 min |
| macOS + Windows GitHub-hosted runners | R0 | already in the workflow | included in Actions minutes | — |

## 5. Decisions needed

1. **Windows signing route** — traditional OV/EV certificate (HSM token
   shipped to you) or Azure Trusted Signing (cheaper, faster, eligibility
   rules). Decide this week; it is the long pole.
2. **Storage provider** — R2 (native custom domain) or Vercel Blob (fewest
   new accounts, needs a rewrite for a branded domain).
3. **Release channel policy** — stable only, or stable + beta from the start.
   Beta is one more manifest and a preference; cheap now, awkward later.
4. **Tagging cadence** — who may push a `desktop-v*` tag, and whether main
   must be green at that commit (it must; the workflow assumes it).

## 6. Risks, stated

- **The first tagged build is the first run of the packaging path.** Expect
  it to fail once; the fix is in the workflow, not the client.
- **An unsigned test build escaping** — sent to a colleague — will look like
  a broken product. Unsigned builds stay with the owner until R1.
- **The update feed is a code-execution channel.** Signed builds only,
  HTTPS only, one build-time origin, no user-editable URL. `electron-updater`
  verifies the signature on macOS; on Windows it verifies the publisher.
- **The production spend meter is unreadable** (`spend.paidRoutesAllowed:
  false`, "the spend meter could not be read"). This is a live platform
  outage independent of the desktop, and the golden chat turn fails on
  every commit because of it while the check reports green. A shipped
  desktop client whose chat cannot get a model route is a worse first
  impression than no client; this needs a person before R2.
