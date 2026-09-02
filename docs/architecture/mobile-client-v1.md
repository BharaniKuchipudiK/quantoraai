# Quantora Mobile Client — v1 design

**Status:** proposal (2026-09-02). Nothing here is built yet; every claim about
the current platform was read from the code and cites the file.

Read `ARCHITECTURE.md` first, then `docs/architecture/desktop-client-v1.md`.
This document borrows that one's identity and API design deliberately, and
departs from it deliberately where a phone is not a small desktop. Where it
departs, it says so.

---

## 0. The problem with copying the desktop answer

`desktop-client-v1.md` §13 lists mobile as out of scope with a one-line reason:
*"Nothing here transfers; the value is the local runtime."* That is correct and
it is the right place to start, because it means **mobile needs its own thesis
or it should not be built.**

The desktop exists to give the Coding Desk a real shell, real git and a real
folder. A phone has none of those and never will. If mobile's pitch is "the
Studio, smaller", it ships a worse `AiStudio.jsx` — a 3,500-line split-pane IDE
squeezed onto 390 points — and loses to the mobile web app it replaced.

### The thesis

Quantora's stated moat is the **outcome operator**: generate → verify →
remember → monitor → act (`ROADMAP.md`, North-Star Bets). Four of those five
verbs happen *while the user is not looking at a screen they chose*. The
roadmap's own Phase 6 makes this explicit — automations that run overnight,
watchers that trip, and **6.3's restraint policy: "human-approval gates for
anything consequential (deploys, spend, emails)."**

An approval gate needs somewhere to send the approval request. Today there is
nowhere:

| Requirement | Web | Desktop (designed) | Phone |
|---|---|---|---|
| Reachable when the user is not in the app | ✗ (no `Notification` usage anywhere in `src/`) | ✓ while the app runs | ✓ always |
| Present at the moment an automation fires | ✗ | ✗ (laptop is shut) | ✓ |
| Can hold an identity strong enough to authorise a deploy | cookie in a tab | keychain | keychain + biometric |

**Mobile is the consent surface and the continuity surface. It is where you
approve, not where you type.** That is the whole thesis, and every decision
below is downstream of it. It also happens to be the only surface that can
close Phase 6.3, which means mobile is not a distribution play bolted onto the
side of the roadmap — it is a prerequisite for the roadmap's own headline bet.

Two secondary cases are real and worth building because the phone is *better*
than the desktop at them, not merely present:

- **Study** (`api/_lib/study-*`, 40+ modules, server-side assessments, mastery
  events, spaced repetition). Reviews are a two-minute, many-times-a-day
  behaviour. That is a phone behaviour; a laptop is the wrong body for it.
- **Capture** — ROADMAP 7.4 wants "sketch/screenshot → app". The camera is on
  the phone. Today the web extends paste-image; the phone can point at a
  whiteboard.

And one case that is honest about being *equal*: reading and continuing a
conversation. That is table stakes, not a reason to build.

---

## 1. Decision summary

| Decision | Choice | Reversible? |
|---|---|---|
| Shell | **React Native + Expo** (prebuild / dev client), TypeScript. Not Flutter, not Capacitor. See §2. | Only before M2 — the sync engine and native modules are RN-shaped. |
| UI | **Native for touched surfaces, authenticated WebView for read-mostly artifact surfaces.** The web bundle is *not* reused wholesale, unlike desktop. See §3. | Per-surface, yes. That is the point of drawing the line explicitly. |
| API | The existing hosted API, through the same `apiFetch()` wrapper the desktop introduces in its D0. No business logic on the device. See §5. | — |
| Identity | The existing HMAC session (`api/_lib/session.ts`) as a bearer token, obtained by PKCE — **but the callback is a verified Universal/App Link, never a custom scheme.** See §4. | — |
| Turn durability | A **durable turn journal** with resume by correlation id, and correlation id promoted to an **idempotency key** on cost-bearing routes. Server-side; benefits web equally. See §6. | — |
| Local data | SQLite mirror + an explicit **outbox**, flushed against the `expectedVersion` CAS that `/api/outcomes` and `/api/projects` already implement. No CRDTs. See §7. | — |
| BYOK | Keychain / Keystore, biometric-gated, device-only, never backed up. A **deliberate departure** from the web's memory-only posture, argued in §8. | — |
| Coding Desk | **Absent as an editor. Present as review-and-approve.** See §3.3. | Yes, and it should be revisited only with evidence. |

---

## 2. Shell: React Native + Expo

| Criterion | React Native + Expo | Flutter | Capacitor (wrap `dist/`) | PWA |
|---|---|---|---|---|
| Language | TypeScript — the repo's language | Dart — a second language, and a second implementation of every `shared/` module | TypeScript | TypeScript |
| `shared/` reuse | **Runs unchanged.** `ARCHITECTURE.md` §4 already forbids `window`/DOM in anything `api/` imports, so `shared/build-intent.js`, `shared/travel/*`, `shared/studio/domains.ts`, `shared/coding-desk-auto-model.js` are already portable. | None — reimplement or run a Dart FFI bridge | Full | Full |
| Reviewers in this repo | Yes | No Dart reviewers, no Dart toolchain | Yes | Yes |
| Gate suite fit | `runtime-import-gate.mjs` adjudicates Node ESM, which is the Metro bundler's neighbourhood; `wiring-gate.mjs` extends by directory | Neither gate can see Dart | Reuses browser gates | Reuses browser gates |
| Push, background, biometrics | First-class | First-class | Via plugins | ✗ on iOS without home-screen install; no reliable background |
| Ships the *right* product | Native surfaces where it matters | Same | **No — it ships `AiStudio.jsx` on a phone** | No |

The deciding row is `shared/` reuse, and the reason is the same one
`desktop-client-v1.md` §2 used to reject Tauri: **this repo's constraint is
reviewers and gates, not framing.** A Dart port would be the second
implementation that `server.ts`'s header comment and `ARCHITECTURE.md` §3 spend
their whole length warning against.

Capacitor deserves its own sentence because it is the tempting one. It is the
fastest path to a binary and the slowest path to a product: it inherits a
desktop IDE layout, gets none of the native gestures, and — the same objection
`desktop-client-v1.md` §3 raised against loading the hosted site — hands a
native bridge to whatever the bundle renders.

**Expo specifics.** Use prebuild + a dev client, not the fully managed
workflow: `node-pty`-class native dependencies are not needed, but a crash
reporter, biometric keychain access and push are. EAS Update gives
JavaScript-only OTA delivery, which matters because this platform ships several
times a day and a store review per fix is incompatible with that cadence.
The compliance boundary is real and stated in §13: OTA may fix and refine, it
may not change what the app is for.

**PWA is M0, not the product.** A manifest and a service worker cost a day
(`public/` has no manifest and `src/` has no `serviceWorker` registration
today), make the web app installable and usably offline-read on a phone, and
buy time. They cannot do push on iOS reliably, cannot run in the background,
and are not an App Store presence. Ship it, name it a stepping stone, and do
not let it become the excuse not to build §6.

---

## 3. The surface split

The desktop reuses the web bundle wholesale because a desktop window *is* a
browser window. A phone is not, so the split has to be drawn on purpose.

**The rule: native when it is touched, web when it is read.**

### 3.1 Native (rebuilt)

Chat and the turn stream · the outcome/project list (ROADMAP 8.1's Outcome
Graph is a *list of cards* — the most native thing in the product) · Study
review · notifications and the approval inbox (§9) · capture (camera, share
sheet) · Travel day-view · settings, vault, auth.

These get native navigation, native gestures, native list recycling, and the
platform's own text input. Nothing here is a compromise; each is a small
surface with a lot of touching.

### 3.2 Authenticated WebView (embedded)

The generated artifact preview · the Office document preview
(`api/generate-office.ts`) · admin and analytics dashboards
(`AdminDashboard.jsx`, `TechnicalAnalyticsPanel.jsx`, `ProductAnalyticsPanel.jsx`)
· the Quantum playground.

These are pinch-and-read content that already exists, changes with every web
deploy, and would be a maintenance tax to duplicate. The WebView is a foothold
and is treated as one in §12.

The artifact preview keeps the existing `buildPreviewSandbox()` invariant —
**no `allow-same-origin` for generated code.** That invariant does not weaken
because the container changed.

### 3.3 Absent on phone v1 — and why that is a design, not a gap

The Coding Desk's **editor, terminal and git panels** do not ship. Monaco on a
390-point screen without a keyboard is worse than not having it, and the
terminal's entire value on desktop is the local runtime the phone does not
have. Shipping a fake one would violate the rule `src/lib/studio-terminal.js`
already holds in its first comment: *"Do not invent command output."*

What ships instead is the phone's real job on a coding outcome:

- read the **diff** a turn produced,
- read the **verify result** (`api/_lib/verify-build.ts`) — pass, fail, what
  failed,
- **approve or reject** a proposed repair (`api/_lib/repair.ts`),
- **approve a deploy**, with the spend it implies shown before the button.

That is Phase 6.3's approval gate with a body. It is also the honest answer to
"can I use Quantora on my phone?" — yes, for the half of the loop where a human
decides.

---

## 4. Identity: the desktop's design, with one correction

Reuse `desktop-client-v1.md` §4 in full — PKCE, system browser, the same
`createSessionToken` HMAC blob, the same 7-day TTL, the same `desktop-grant` /
`desktop-exchange` routes folded into `api/auth.ts`. `getSessionUser(req)`
learning the `Authorization: Bearer` carrier is a change mobile needs and
desktop already requires; it should land once, in the desktop's D0, and mobile
should not fork it.

**The correction: the callback must not be a custom scheme.**

`desktop-client-v1.md` uses `quantora://auth/callback`. On desktop that is
fine. On mobile it is not: **any app on Android may register a custom scheme**,
so a malicious app installed alongside Quantora can claim `quantora://` and
receive the authorization code. PKCE means the code alone is not enough — the
attacker lacks the verifier — but relying on PKCE as the *only* control means
an interception is invisible and a future protocol slip is fatal.

Mobile uses **verified links**: iOS Universal Links (`apple-app-site-association`)
and Android App Links (`assetlinks.json`), both served from `quantoraai.app`,
so the OS resolves the callback to the app that provably owns the domain.

Consequences:

- Two static association files must be served from the apex domain with the
  right content type and no redirect. Add them to `public/` and to the
  `vercel.json` rewrite exclusion list, which today excludes only
  `api/`, `preview/`, `monaco/`, `robots.txt` and `sitemap.xml` — an
  association file that falls through to `index.html` silently breaks link
  verification, and the failure mode is "auth sometimes opens Safari", which
  is exactly the kind of intermittent symptom that gets misdiagnosed as flake
  (`CLAUDE.md` §6).
- Use the OS auth session APIs (`ASWebAuthenticationSession` /
  Custom Tabs, i.e. `expo-web-browser`'s auth session), never an in-app
  WebView for sign-in. An in-app WebView for OAuth is both a phishing pattern
  and an App Store rejection.
- The session token goes to the Keychain/Keystore, not `AsyncStorage`. §12.

**CORS is a non-issue for the native client** and it is worth saying why, so
nobody adds a rule that does nothing: `applyCors` (`api/_lib/rate-limit.ts:47`)
reflects only an exact `APP_URL` origin, and a native HTTP client sends no
`Origin` header at all, so no reflection is needed and none should be added.
CORS applies only to the embedded WebView of §3.2, which loads
`https://quantoraai.app` and is therefore same-origin to itself. **Do not add a
mobile origin to `applyCors`** — it would widen the allowlist for a client that
does not need it.

---

## 5. API access

1. **`apiFetch()` is shared with desktop.** The desktop's D0 migrates ~50
   relative `fetch('/api/…')` call sites to a wrapper; mobile is the second
   consumer, not a second wrapper. Callers keep writing the literal
   `'/api/chat'` so `scripts/platform-dead-control-gate.mjs` — which greps for
   `/api/...` string literals — keeps working.
2. **Base URL is a build-time constant per channel**, never user-editable. Same
   reasoning as the desktop: an editable base URL is a phishing surface for a
   bearer token, and on a phone the token is protecting a device that can
   approve a deploy.
3. **No new top-level function.** `api/` holds 19 top-level files today, each a
   Vercel function, against a stated target of ≤12 (`ARCHITECTURE.md` §1).
   Everything mobile needs — device registration, the approval inbox, the turn
   journal read — folds into `api/pipeline.ts`, `api/auth.ts` or
   `api/account`-style handlers via `vercel.json` rewrites. Mobile must not be
   the reason that budget gets worse.
4. **Read `/api/inference-health` before hammering.** It already reports
   `circuitStore` mode. A phone that retries into an open circuit burns battery
   and the user's data plan for nothing.

---

## 6. The turn must survive the network

**This is the centrepiece.** It is the one place where mobile is not a new
client for an existing system but a forcing function on the system itself.

### 6.1 What happens today

`api/_lib/sse-writer.ts` is a clean, single-owner SSE lifecycle. Frames are
`{text}`, `{status}`, `{provider, latencyMs}`, `{error:{message,code,retryable,…}}`,
terminated by `data: [DONE]`. `src/hooks/useChatStream.js:1302` reads them with
`res.body.getReader()`.

There is no resume. The stream is a single mortal socket. When it dies:

- `resolveTurnRecovery` (`src/lib/turn-recovery.js:112`) returns
  `{ retry: false, resume: true, reason: 'partial-answer' }` when partial text
  arrived. **`resume: true` means "keep the truncated text"** — it does not
  mean the rest is recovered. The remainder of the answer is gone; the tokens
  were paid for.
- With no partial text, the client retries the whole turn
  (`MAX_TURN_ATTEMPTS = 2`). The retry is a fresh `POST /api/chat` with **no
  idempotency key**, so if the first request's model call is still running
  server-side — which it is, because Vercel functions run to completion or
  `maxDuration: 180`, not to client disconnect — **the user is billed twice for
  one turn** and `model_spend_ledger` records both.

On a laptop this is rare enough to look like nothing. On a phone it is the
normal case: backgrounding suspends the JS runtime, cell↔wifi handoff drops the
socket, and iOS reclaims sockets on suspend. **The platform's answer to a
dropped stream is currently "keep whatever arrived and maybe pay twice", and a
phone will hit it several times a day.**

Per `CLAUDE.md` §7 this is an instance and a class. The instance is "mobile
loses turns". The class is "**a turn's output exists only in a socket**".

### 6.2 The design: a durable turn journal

Add a second sink beside `SseWriter`. As the handler streams, it also appends
frames to a durable, append-only journal keyed by the turn's correlation id —
which **already exists and is already on the wire**:
`createCorrelationId('studio')` (`src/lib/transaction-trace.js:3`), sent as
`X-Quantora-Correlation-Id` via `correlationHeaders()`, and echoed back by the
server (`useChatStream.js:1272`).

```
POST /api/chat            X-Quantora-Correlation-Id: studio-<uuid>
  ├─ SseWriter  ──────────────────────► the live socket (unchanged)
  └─ TurnJournal.append(seq, frame) ──► durable rows, batched

GET  /api/chat?resume=<correlation-id>&after=<seq>
  └─ replay frames seq > after, then either tail the live turn or close
```

Four properties, each of which is load-bearing and none of which is free:

- **The producer does not stop when the client leaves.** Today a write to a
  dead socket is wasted work. It must instead keep consuming the upstream
  model stream and keep journaling to completion. This is the actual
  behavioural change; everything else is plumbing.
- **Batching, not per-token writes.** Token-granularity durable writes would
  cost more than the inference. Flush on a time bound (~250 ms) and
  unconditionally on `status`, `error` and `done` boundaries. Coarse resume
  granularity is acceptable because the text is append-only — the client asks
  for "everything after seq N" and re-renders idempotently.
- **A retention bound, stated.** Journals are conversation content. They
  expire on a short TTL (proposed: 24 h — long enough for a commute, short
  enough not to become a shadow transcript store), and they are deleted by
  `/api/account {action:'delete'}` along with everything else. A privacy
  surface that grows silently is the failure mode here.
- **Idempotency on the same key.** `POST /api/chat` with a correlation id that
  already has an open or completed journal **does not start a second model
  call** — it attaches to the existing one. That is what makes the client's
  existing `MAX_TURN_ATTEMPTS = 2` retry safe instead of expensive.

### 6.3 Why this is not a mobile feature

Web gets it for free, and web needs it: reload the page mid-answer today and
the answer is gone. So does desktop. This is the pattern `CLAUDE.md` §7
describes as compound interest — the phone is merely the client that made the
missing piece impossible to keep ignoring.

### 6.4 What proves it (and what would fake it)

A resume gate that only tests "reconnect returns some text" would pass with a
completely decorative journal, which is `CLAUDE.md` §4's definition of a check
worse than no check. The gate must:

1. start a turn,
2. **kill the socket deterministically** mid-stream (not "wait and hope"),
3. reconnect with `?resume=&after=`,
4. assert the reassembled text **equals** the text a clean run produced for the
   same fixed input, and
5. assert exactly **one** `model_spend_ledger` increment.

Step 5 is the one that catches the interesting bug. Before writing the gate,
run it with the journal disabled and read what it says — per `CLAUDE.md` §8, a
gate is not verified until you have read its output with the bug present.

---

## 7. Offline and sync

### 7.1 The seam already exists

`/api/outcomes` and `/api/projects` both take `expectedVersion` and return
`{ conflict: true }` (`src/lib/outcome-state.js:77`, `src/lib/project-store.js:23`).
That is compare-and-swap. Mobile does not need a new sync protocol; it needs a
client that uses the one that is there.

### 7.2 Shape

- **SQLite mirror** of the user's outcomes, projects and study material.
  Read-through cache, dropped on logout. This is what makes ROADMAP 4.1's
  "< 200 ms local recall" actually reachable on the device that is most often
  on a bad network.
- **An explicit outbox** for writes made offline: queued mutations with their
  `expectedVersion` at capture time, flushed in order on reconnect with bounded
  exponential backoff.
- **Conflicts surface. They never resolve silently.** A `conflict: true` on
  flush shows the user both versions and asks. Last-write-wins would be
  exactly the "green check is a claim" failure of `CLAUDE.md` §1 — a sync that
  reports success while discarding work.
- **No CRDTs in v1.** Outcome states are structured, low-contention documents
  edited by one user on one or two devices. A CRDT is a large permanent bet
  against a small occasional problem, and the CAS protocol already in the
  server is the cheaper correct answer. Revisit only with evidence of real
  concurrent-edit pain.

### 7.3 What is honestly offline

| Works offline | Does not, and must say so |
|---|---|
| Reading past outcomes, projects, conversations | Generation, verification, repair, deploy |
| A full Study review session against cached items | Server-scored assessment (it is server-side by design) |
| Composing and **queuing** a message | Getting an answer |
| Reading a cached artifact preview | Building or refreshing one |

An offline state that pretends is worse than one that is plain. The queued
message shows as queued, with the reason, and never as sent.

---

## 8. Secrets on a device that dies

`src/lib/client-secrets.js` keeps BYOK keys **memory-only, deliberately**, with
a comment explaining that `localStorage` "is not a credential vault", and it
actively deletes keys older builds persisted. `PrivacyVault.jsx` shows the user
a badge saying so. That posture is right for a browser tab.

It is wrong for a phone, and the reason is behavioural rather than
cryptographic: **iOS and Android kill backgrounded apps routinely.**
Memory-only on mobile means retyping a 40-character API key several times a
day, which trains the user to keep it in Notes or a screenshot — a strictly
worse place than the Keychain.

So mobile departs, explicitly and narrowly:

- BYOK keys live in the **Keychain / Keystore**, with
  `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (iOS) and
  `setUserAuthenticationRequired` on a hardware-backed key (Android).
- **Never** in `AsyncStorage`, `UserDefaults`, `SharedPreferences`, or any
  store included in an iCloud/Google backup.
- Biometric or device-passcode gate on read.
- The UI says plainly: *this key is stored on this phone only, and never leaves
  it except as a request header to Quantora's API* — which is already true of
  the web (`byokRequestHeaders` sends them as `x-quantora-*-key` headers, never
  body fields, and that stays).
- **The web's posture is unchanged.** This is not a platform-wide loosening;
  it is one client with a different threat model making a different trade, and
  `PrivacyVault.jsx`'s copy must stop being global if mobile lands.

The session bearer token gets the same treatment for the same reason, plus one
more: on a phone it can authorise a deploy.

---

## 9. Notifications, and the restraint policy with teeth

The platform has **no notification channel at all** today — no `Notification`
usage in `src/`, and the desktop design names itself as the first. Mobile is
the first one that reaches a user who is not at a computer, which makes it both
the most valuable and the most abusable.

ROADMAP 6.3's restraint policy — proactivity budget, quiet hours,
human-approval gates — is not a nice-to-have here. It is the thing that decides
whether the app gets deleted in week two.

**Enforcement is server-side.** A client-side quiet-hours check fails in
exactly the case that matters: the app is not running at 3 a.m., so the server
must not send. Push token registration, category opt-ins, quiet hours and the
daily budget all live server-side, and the send path checks them. A client-side
filter is a second implementation of a policy, and the repo has a standing rule
against those.

**Categories, each separately revocable:** approval requested · turn finished
(long jobs — `api/generate-office.ts` runs to `maxDuration: 300`, far beyond any
foreground window) · watcher tripped · study review due · security (sign-in on
a new device — never silenceable).

**Approvals are never one-tap from the lock screen.** A push carries an opaque
approval id and nothing consequential. Opening it fetches the full proposal and
renders what will change — the diff, the spend, the target — and only then is
the button live. A phone on a table is a phone in someone else's hands; a
one-tap irreversible deploy on a lock screen is a security control that reads
as a convenience feature.

**Notification content is minimal by default.** "A change is ready to review"
on the lock screen, details behind unlock. Notification payloads traverse APNs
and FCM, which are third parties the user did not choose.

---

## 10. Performance: budgets, not adjectives

"Fluid" is unfalsifiable. These are the numbers the gates enforce, and they are
**budgets to be measured on real hardware, not results being claimed**:

| Budget | Target | Why this number |
|---|---|---|
| Cold start → interactive | < 1.5 s | Below the threshold where a user re-taps the icon |
| First token visible | < 800 ms p50 on LTE | The perceptual difference between "thinking" and "broken" |
| Open a past outcome | < 200 ms | ROADMAP 4.1's stated bar; SQLite makes it reachable |
| Streaming render | no frame > 8.3 ms on a 120 Hz device | Dropped frames during streaming are the single most visible mobile jank |
| Turn survives a 30 s background | 100% | §6, and the gate in §14 |

Two implementation notes that follow from the streaming budget:

- **Do not `setState` per SSE frame.** At token granularity that is hundreds of
  renders per answer. Coalesce into a frame-aligned buffer and flush once per
  frame; render markdown incrementally rather than re-parsing the accumulated
  string each time.
- **Measure on a device, never the simulator.** The simulator runs on desktop
  silicon and will report numbers no user will ever see. `CLAUDE.md` §3 exists
  because a wrong measurement in this repo produced a wrong claim; a simulator
  benchmark is the same mistake with a different tool.

Tablets and foldables are one layout system with size classes, not a second
app. The phone layout is the constraint that makes the tablet layout easy, not
the other way round.

---

## 11. Repository layout and gates

Single-package repo, no workspaces, matching the desktop plan. One new
top-level directory, and the gates learn about it **in the same PR**
(`CLAUDE.md` §7):

```
mobile/
  app/            Expo Router screens: chat, outcomes, study, approvals, settings
  native/         Native surfaces: keychain, push, biometrics, camera, share
  sync/           SQLite mirror, outbox, CAS flush, conflict surfacing
  webview/        The embedded artifact/preview host + its enumerated bridge
  build/          EAS config, entitlements, association files
shared/
  turn-journal-contract.ts     frame + seq schema, shared by api/ and mobile/
  mobile-bridge-contract.ts    WebView↔native message schema, versioned
src/lib/
  api-client.js                apiFetch() — shared with desktop, landed in its D0
```

| Gate | Today | Change |
|---|---|---|
| `scripts/runtime-import-gate.mjs` | `ROOTS = ['api','shared']` + `server.ts` | Add `mobile` — Metro resolves differently again, which is a fourth column for `CLAUDE.md` §10's runtime-disagreement table |
| `scripts/wiring-gate.mjs` | `SOURCE_DIRS = ['src','shared','api','scripts']` | Add `mobile`; regenerate the baseline once with `--update` and **read the diff** |
| `scripts/platform-dead-control-gate.mjs` | greps `src/` for `/api/…` literals | Widen to `mobile/`; a phone calling a route nothing serves is the same defect |
| `npm run lint` | repo-wide `tsc --stack_size=8192` | Add `mobile/**` to `tsconfig.json` include |
| `npm run test:claims` | reads workspace chips + tool descriptions | Extend to store metadata — §13 |

New gates are in §14.

---

## 12. Security posture

The desktop widens the blast radius from "your session" to "your machine". The
phone's difference is not radius but **custody**: the device is lost, shared,
shoulder-surfed, seized at borders, and backed up to a cloud the user does not
control.

Non-negotiables:

- **Session bearer and BYOK keys in the Keychain/Keystore**, device-only,
  excluded from backup, biometric-gated (§8). A grep-based gate asserts no
  secret is ever written to `AsyncStorage`/`UserDefaults`/`SharedPreferences`.
- **The WebView is a foothold and is confined like one.** No JS bridge beyond a
  fixed, enumerated, `zod`-validated surface (`zod` is already a dependency) —
  the same rule as the desktop preload, for the same reason. Navigation
  restricted to `https://quantoraai.app`; every other URL goes to the system
  browser. No `file://`. The generated-artifact iframe keeps
  `buildPreviewSandbox()`'s no-`allow-same-origin` invariant.
- **Verified links only** for the auth callback (§4). Custom schemes are for
  desktop.
- **Screen-capture protection on the vault and approval screens**, with an
  honest note: Android has `FLAG_SECURE`; iOS has no true equivalent and will
  screenshot. Claiming parity would be a capability claim with no backing
  implementation, which this repo has a gate for.
- **Certificate pinning: recommended against for v1.** It defends against a
  compromised CA or corporate MITM and costs a hard outage on every
  mis-sequenced cert rotation — an outage that ships to devices you cannot
  hotfix without a store round trip. If it is adopted later, it needs a backup
  pin and a server-controlled kill switch before it is worth the risk it
  removes.
- **Jailbreak/root detection is a speed bump, not a control.** Ship it if
  cheap; never count it as a security property.
- **Telemetry** stays on `/api/product-event` with `host: 'mobile'` and app
  version, under the same privacy rules. Native crashes never reach it — a
  native crash reporter is separate (§16), as the desktop design also found.
- **Rate limits already assume a browser.** The two-layer limiter and
  `applyDurableCostBearingGuard` are tuned for tab-shaped traffic; a phone with
  aggressive retry looks different. Mobile clients must send a stable client
  identifier and respect `Retry-After` rather than backing off on a private
  schedule.

---

## 13. The store is a gate this repo has never faced

App Review and Play Review will reject builds for reasons no test in this repo
currently checks. Treating them as an afterthought is how a finished app sits
unreleased for three weeks.

| Requirement | Status today | Work |
|---|---|---|
| **Account deletion in-app** (Apple 5.1.1(v)) | **Already satisfiable** — `api/_lib/handlers/account.ts` implements `export` and `delete`, and the comment says a privacy action that silently no-ops is worse than an honest error | Surface it in the app; no backend work |
| **UGC controls** (Apple 1.2) — filtering, reporting, blocking | Partial: `safety-policy.ts` and a moderation pass exist | Add report-content and a per-conversation block path |
| **Privacy nutrition label / Play Data Safety** | Nothing declared | Must match what `/api/product-event` actually transmits |
| **IAP for digital subscriptions** (Apple 3.1.1) | Stripe exists (`supabase/migrations/0015_stripe_monetization.sql`) | A commercial decision, not a code one — §18 |
| **Age rating** for AI-generated content | Not assessed | Assess before the first submission, not after a rejection |

The privacy label row deserves a gate rather than a checklist entry, because it
is precisely the defect class `npm run test:claims` already exists to catch:
**a promise made in one place with no backing implementation in another.** The
capability-claims gate reads what a workspace tells a human and what a tool
description tells the model; a store privacy label is the same kind of claim
told to a reviewer and a user.

Proposed: `scripts/mobile-privacy-manifest-gate.mjs` — parse the fields the app
actually transmits, compare against the declared manifest, fail on anything
transmitted but undeclared. Per `CLAUDE.md` §4 and §5, it **fails when its parse
finds nothing** rather than reporting a clean run over zero fields, and it fires
only on an unambiguous contradiction, with a stated remedy: declare the field,
or stop sending it.

---

## 14. Verification: what proves it works

Per `CLAUDE.md`, each of these must be shown failing with the bug present
before it counts.

| Check | What only it catches |
|---|---|
| `scripts/mobile-turn-resume-gate.mjs` | A turn lost to a dropped socket. Kills the socket mid-stream, resumes, asserts the reassembled text **equals** a clean run's, and that `model_spend_ledger` incremented **exactly once**. Fails today by construction (§6.1). |
| `scripts/mobile-background-survival-gate.mjs` | The mobile-specific half of the same class: start a turn, background the app 30 s, foreground, assert the answer completed. This is the two-way check of `CLAUDE.md` §2 — it must be watched failing against today's client before the journal lands. |
| `scripts/mobile-idempotency-gate.mjs` | Double spend on retry. Same correlation id twice → one upstream call, one ledger row. |
| `mobile-bridge-contract.test.js` | Native and WebView drifting on a bridge channel or payload version — the `deployed-gate-contract.test.js` pattern applied to a new pair of ends. |
| `scripts/mobile-secret-storage-gate.mjs` | A secret written to `AsyncStorage`/`UserDefaults`/`SharedPreferences`. Verify by deliberately adding one and watching it fail (§2 of the doctrine). |
| `scripts/mobile-privacy-manifest-gate.mjs` | Declared privacy label diverging from transmitted fields (§13). |
| Sync conflict test in `mobile/sync` | A `conflict: true` resolved silently instead of surfaced — the failure that would make offline mode a data-loss feature. |
| Notification restraint test | Quiet hours or budget enforced only client-side. Must fail if the check is moved out of the server. |
| `scripts/mobile-smoke-gate.mjs` (Detox or Maestro) | The app boots, signs in with a synthetic token, sends a turn, renders it. The mobile analogue of `desktop-smoke-gate`. |
| Manual, recorded per release | TestFlight build installs on a clean device; App Links / Universal Links resolve to the app and not to Safari. |

The association-file check is worth calling out: link verification failing
silently produces "auth sometimes opens the browser instead of the app", which
is exactly the shape of symptom `CLAUDE.md` §6 warns gets labelled flaky and
muted. Assert the files are served with the right content type and no redirect,
from CI, on every deploy.

---

## 15. Phasing

Each phase ships independently and leaves the web untouched or better.

**M0 — PWA + honest mobile web** *(days, not weeks)*. Manifest, service worker
for read-caching, real touch targets on the surfaces that are already
responsive. **Explicitly a stepping stone**, and it must not be allowed to
become the argument against M2.
*Accept:* installable on iOS and Android; a cached outcome opens offline; the
existing browser gates still pass.

**M1 — Server durability** *(the highest-value work in this document, and it is
not mobile code)*. Turn journal, resume endpoint, correlation-id idempotency on
cost-bearing routes, journal TTL and deletion wired into `/api/account`.
Depends on the desktop's D0 for the bearer carrier and `apiFetch()`.
*Accept:* `mobile-turn-resume-gate` and `mobile-idempotency-gate` green, both
having been watched fail first. Web gains reload-survives-a-turn as a side
effect; verify that too.

**M2 — App shell.** Expo app, verified-link PKCE auth, native chat against the
resumable stream, the outcome list, settings, Keychain-backed secrets.
*Accept:* `mobile-smoke-gate` and `mobile-background-survival-gate` green on a
real device; `mobile-secret-storage-gate` green after being watched fail.

**M3 — Sync and offline.** SQLite mirror, outbox, CAS flush, conflict surface,
offline Study review.
*Accept:* the conflict test; airplane-mode read of a cached outcome under
200 ms; a queued message shows as queued and never as sent.

**M4 — The consent surface.** Push registration, server-side restraint policy,
the approval inbox, diff/verify/deploy review.
*Accept:* an automation raises exactly one notification, quiet hours suppress
it server-side, and an approval requires opening the full proposal — proven by
a test that fails when the check moves to the client. **This is the phase that
closes ROADMAP 6.3**, and it is the reason mobile is on the roadmap at all.

**M5 — Distribution.** EAS build and submit, TestFlight and internal testing,
store metadata and the privacy manifest gate, crash reporting, OTA channel.
*Accept:* a clean-device install passes the smoke gate; an OTA update lands
without a store round trip; the privacy manifest gate is green having been
watched fail.

**Sequencing note.** M1 before M2 is not negotiable. An app shell on a
non-resumable stream would ship the platform's worst behaviour to the platform's
worst network, and the first review would be about it.

---

## 16. Infrastructure and accounts needed

| Item | Why | Phase |
|---|---|---|
| Durable journal storage (a Supabase table, or Redis/KV with TTL) | §6 | M1 |
| Two `vercel.json` rewrites for resume + device registration, folded into existing functions | Stay inside the function budget | M1/M4 |
| `apple-app-site-association` + `assetlinks.json` served from the apex, excluded from the SPA rewrite | Verified links (§4) | M2 |
| Apple Developer Program; App Store Connect | Signing, TestFlight, submission | M2+ |
| Google Play Developer account | Internal testing, submission | M2+ |
| APNs auth key + FCM project | Push | M4 |
| Device-token table + notification preferences (Supabase) | §9, server-side enforcement | M4 |
| Expo / EAS account (build, submit, update channels) | Builds and OTA | M2/M5 |
| Native crash reporter | Native crashes never reach `/api/product-event` | M5 |
| A physical iOS and Android device in CI or a device-cloud tier | Simulator numbers are not measurements (§10) | M2+ |

No new Supabase tables are required before M1's journal. M3 reads existing
tables; M4 adds the device/preferences table.

---

## 17. Explicitly out of scope for v1

- **The Coding Desk as an editor** — §3.3. Review and approve, not type.
- **On-device inference.** The tempting privacy story is a second
  implementation of chat policy on a device that cannot run the models the
  platform routes to, and `server.ts`'s header comment already warns where that
  ends.
- **Direct provider calls from the phone** with a BYOK key — same reasoning as
  the desktop's §6.3.
- **Voice.** `/api/live` exists only in `server.ts` and has no production host
  (`ARCHITECTURE.md` §1). Voice is the single most natural mobile modality and
  the most likely thing to be asked for; it stays out until it has a host,
  because building it into the phone first would put the persistent-host
  problem on the wrong side of the API boundary. ROADMAP 5.2 still applies.
- **Offline generation.** Offline *reading* is M3; offline answering is not a
  goal and should never be implied by the UI.
- **A second design system.** The phone uses platform-native components, not a
  port of the web's glass-card CSS.

---

## 18. Open decisions for the founder

1. **Does mobile precede or follow desktop?** They share D0/M1 (bearer carrier,
   `apiFetch`, and arguably the journal). Doing both at once is cheaper than
   doing them a quarter apart, and the shared work is the part with the most
   design risk. This is a sequencing call with real money in it.
2. **IAP or web-only subscriptions.** Apple 3.1.1 requires IAP for digital
   subscriptions sold in-app, at 15–30%. The alternative — sell only on the web
   and let the app be a client for an existing account — is legitimate and
   common, and changes the business model rather than the code. Decide before
   M5, because store metadata and the paywall depend on it.
3. **Journal retention.** 24 h is proposed. Longer makes "reopen yesterday's
   answer" work and turns the journal into a transcript store with the privacy
   duties that implies. This is a privacy posture decision, not a tuning knob.
4. **Certificate pinning** — recommended against for v1 (§12), but it is the
   founder's risk appetite, not an engineering fact.
5. **Does the phone get its own model-routing default?** Cheaper/faster models
   on cellular is a defensible product choice and a silently different product
   if unstated. If yes, it belongs in `shared/coding-desk-auto-model.js` with
   the rest of routing — never as a second policy on the client.
