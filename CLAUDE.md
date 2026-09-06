# Working on Quantora

Operating doctrine for anyone changing this repo — human or agent. `.quantorarules`
covers UI/UX guard rails; **this file covers how to know your change is real.**

Every rule below was paid for. The incidents are named so the rule is arguable
with evidence instead of obeyed on faith.

---

## 1. A green check is a claim. The log is the evidence.

On 2026-08-31, three API functions were dead in production — `/api/domains`,
`/api/deploy`, `/api/deploy-gcp` — while GitHub showed **Deployed golden
transactions: success**. The step that found the outage was wrapped in
`continue-on-error`, so the job reported success and printed a warning nobody
read.

- Before you say "CI is green", open the job log of the check that matters.
- `continue-on-error` converts a failure into a lie unless someone reads the
  warning. Prefer splitting a step over muting it (§4).
- The same applies to any summary — a check API, a status badge, another
  agent's report. Go to the primary source.

## 2. Reproduce the failure, then reproduce the fix.

Never claim a fix without seeing the bad state fail and the good state pass.

When `scripts/runtime-import-gate.mjs` was written, the bad import was
reintroduced deliberately to watch the gate reject it, then removed to watch it
pass. That two-way check is what proves a gate is load-bearing rather than
decorative.

## 3. Measure with the project's real command.

Plain `npx tsc --noEmit` **crashes** on this codebase (stack size), and a crash
exit code reads exactly like a type error. `npm run lint` passes
`--stack_size=8192` for that reason.

A wrong measurement produced a wrong claim in this repo's own history
("tsc catches it" — it does not; `npm run lint` exits 0 with the archiver bug
present). Re-measure before asserting, and correct the record out loud when you
were wrong.

## 4. A check that cannot fail is worse than no check.

It costs the same to run and it buys false confidence.

A local "import every serverless function" gate was written, tested, and
**deleted**: under `tsx` it resolved extensionless specifiers and interoped a
missing default export, so it passed while two real production-breaking bugs
were present. `node --experimental-strip-types` was no better — it cannot
resolve the `./x.js` specifiers that exist only after compilation, so it fails
on correct code.

Before adding a gate, ask: *what does it do when the bug is present?* If you
cannot answer from an experiment, you do not have a gate yet.

## 5. Never mute a signal. Separate it.

The deployed golden step mixed a deterministic `fetch` with a live browser and
model turn. When the browser half flaked, the whole step was muted — and the
deterministic half went silent with it. That is how the outage hid.

The fix was separation, not suppression:
`scripts/deployed-readiness-gate.mjs` (deterministic, blocking) vs the browser
golden (non-blocking, with a stated end condition).

**Keep blocking gates precise.** A gate that fires on ambiguous evidence gets
muted by the next person under pressure, and then it protects nothing. The
readiness gate fails only on an unambiguous platform crash; a `401`/`405`
passes, because those prove the module loaded.

## 6. "Flaky" is a diagnosis that requires evidence.

`deployed-golden-transactions.mjs` was labelled "historically flaky" for
looking up a button by its words. The copy had changed to "Try Quantora", so it
failed on **every** run — permanently red, not flaky. Muting it cost three
production endpoints.

- Anchor tests on durable hooks (`data-quantora-*`), never on prose.
- Tie both ends together with a contract test so the pair cannot drift apart in
  silence — see `src/lib/deployed-gate-contract.test.js`.
- "It's flaky" without a reproduction is a guess. Read the error.

## 7. Fix the instance, then close the class.

Each defect gets two questions: *what broke?* and *what class is this?*

| incident | instance fix | class closed |
|---|---|---|
| `./autocomplete` (no extension) | add `.js` | `test:imports` rule 1 — every relative import needs a runtime extension |
| `import archiver from 'archiver'` (v8 is ESM, no default) | `new ZipArchive(...)` | `test:imports` rule 3 — default imports verified against real Node ESM |
| a test that ran nowhere | add it | glob runner — a `*.test.ts` on disk IS its registration |

The gates are the compound interest. Add to them.

## 8. Verify a gate by reading its output, not by grepping for "FAILED".

The default-export rule in `runtime-import-gate.mjs` was confirmed working by
grepping its output for `FAILED`. It did fail — and printed:

```
  undefined:undefined  'undefined'
      undefined
```

It named neither the package nor the file. Review caught it; the grep had not.
An unactionable gate is one the next person mutes under pressure, so a gate is
not verified until you have read what it says with the bug present. This is
rule 1 turned on your own work.

## 9. Verify before deleting.

Check static imports, dynamic `import()`, `React.lazy`, string references,
`vercel.json` rewrites, and `scripts/`. Two "obviously orphaned" modules in this
repo turned out to be imported by `api/_lib/chat-handler.ts`. The wiring gate
cannot see conditional render paths, so it will not save you here.

## 10. Know what the runtimes disagree about.

This is the single richest source of "green locally, broken in production" here:

| | `tsc` | `tsx` (tests) | `vite build` | Vercel (prod ESM) |
|---|---|---|---|---|
| `./x` (no extension) | resolves | resolves | never sees `api/` | **fails** |
| default import of an ESM-only package | typed as callable | interops | never sees `api/` | **fails** |
| a file a dependency loads by computed `import()` (pdfjs's worker) | present | present | never sees `api/` | **absent from the bundle** — name it in `vercel.json` `includeFiles` |

When in doubt about production behaviour, the deployed gate is the only
authority. Local green is necessary, never sufficient.

---

## The self-healing loop, honestly

Detect → diagnose → propose → **verify** → apply.

The fourth step is the whole thing. Self-healing without an independent
verifier is guessing that compounds, and a model cannot repair a module-load
crash in its own runtime — the process is already dead. The operating standard
— what each phase owes, per level — is
`docs/engineering/DETECT_DIAGNOSE_VERIFY_APPLY.md`. So:

- **Turn level** (a failed chat/build turn): `src/lib/turn-recovery.js` maps
  the diagnosis to a repair that DIFFERS from the failed attempt — a
  behavioral failure retries with a strengthened brief that names what went
  wrong, a dead route retries on a real fallback engine — and
  `src/lib/coding-outcome-spine.js` owns the handover when the budget is
  spent: it reports what the loop actually tried and never promises a retry
  that will not run. On 2026-09-01 both were violated at once: a retry that
  changed nothing, then terminal copy promising "retry once on a fallback
  engine" in the one state where nothing further would ever run.
  `turn-heal-contract.test.js` closes the class.
- **Artifact level** (the user's generated site): `api/_lib/repair.ts` +
  `verify-build.ts` close this loop, and `shared/refinement-loop.js` decides
  how many rounds it is worth. Two properties make iteration safe rather than
  expensive, and neither is optional: every round is told what earlier rounds
  scored and what stayed wrong (memory), and the loop stops on evidence — a
  pass, a plateau, an unchanged repair, or the budget — never merely because
  it already tried once.
- **Platform level** (Quantora itself): the verifier is the gate suite, not a
  model. Autonomy here is earned by adding gates, because every new gate is one
  more thing an agent can check its own work against without a human.

Corollary: **an agent may fix anything a gate can adjudicate.** Anything else
needs a person. Widening what the gates can adjudicate is how the platform
becomes safely more autonomous.

## The gates

| command | what only it can catch |
|---|---|
| `npm run test:imports` | imports that resolve everywhere except production |
| `npm run test:wiring` | code that is tested and reachable by nothing |
| `npm run test:dead-controls` | a `/api/` path the frontend calls that nothing serves |
| `npm run test:claims` | capability claims with no backing implementation, and tool descriptions that promise the model a field the request never asks for |
| `npm run test:stress` | a hostile or malformed reply that destroys the user's build — a file lost, emptied, or committed unrunnable — across 160 arrival shapes, with no model call |
| `scripts/deployed-readiness-gate.mjs` | a deployed function that dies before its handler runs |
| `node --test src/lib/refinement-loop.test.js` | a repair loop that burns the user's money without improving |
| `node --test src/lib/turn-heal-contract.test.js` | a retry identical to the attempt that failed, or terminal copy promising action in a state with no future |
| `node scripts/guided-intake-browser-gate.mjs` | a platform that punishes the model for obeying it — an intake question flagged as a failed build, or a retry burned on a compliant answer |
| `node --test src/lib/shop-ui-react-vfs.test.js` | the desk corrupting its own artifact — HTML injected into a React module the model shipped working |
| `node --test src/lib/desk-chat-claim-filter.test.js` | the desk rewriting its own machine-readable block — a Preview disclaimer written into a decision modal's JSON where the model's question was |
| `npx tsx --test api/_lib/model-quality-outcome.test.ts` | a ledger that records a cut-off or blocked reply as a success, teaching the router that a route which just failed is reliable |
| `npx tsx --test api/_lib/attachment-text.test.ts` | a document the user attached that never reaches the model — a PDF dropped as "not a readable image", a spreadsheet nobody read, a scanned page reported as anything but unreadable |
| `node scripts/attachments-browser-gate.mjs` | the composer or the send path dropping an attached document, the desk hiding what it could not read, or a document forgotten by the build turn after the designer's question |
| `node --test src/lib/travel-comprehension.test.js` | a desk that answers confidently without understanding the question |
| `npm run test:github-writes` | a GitHub mutation that runs on a session alone, without asking GitHub whether this user may make it |
| `node --test shared/trace-story.test.js` | a reference id whose account invents a cause the record does not prove — or blames the server for a request it never saw |
| `node scripts/trace-lookup-browser-gate.mjs` | a failed turn whose reference is not the id the request carried, so no lookup could ever find it — or a "What happened?" that renders nothing |
| `node --test api/_lib/preview-compiler.test.js` | a project the artifact contract accepts and the preview runtime refuses — a React 17 mount (`ReactDOM.render`) that dies on the React 19 runtime as "render is not a function", which a fallback engine shipped to production on 2026-09-05 |

### A tool description is a promise, and the model passes it on

`search_hotels` told the model it was "REQUIRED for hotels, stays, property
ratings, websites, Google Maps links, **or photos**" and then, in the same
sentence, listed what it returns with photos absent. The field mask agreed with
the second half: twelve fields, no `places.photos`.

The model was instructed to use that tool for photos, got none, and improvised
an explanation — *"I cannot render embedded photo feeds"* — which was never
true; the chat renders markdown images fine. **A tool that over-promises does
not merely fail to deliver: it makes the model invent a reason, and the
invented reason is what the user reads as fact.**

The capability-claims gate did not see it, because it checks the chips a
workspace shows a *human*. A promise to the model reaches the user just as
surely. `test:claims` now reads both surfaces.

Keep that half precise, per §5: it fires only where a Places-backed description
names a capability and no field mask in the same file requests the field —
an unambiguous contradiction between two strings, with two stated remedies
(request the field, or stop making the claim). And when its parse finds
nothing, it **fails** rather than reporting a clean run over zero tools, per §4.

### Reachability is not correctness

Every gate above this line asks whether something can be *reached*. None of
them asked whether an answer was *right*, so a travel parser that heard 51% of
the people who told it where they were going passed all of them, shipped, and
was found by a screenshot.

`travel-comprehension.test.js` measures two numbers that pull against each
other — precision (of the places we report, how many were really said) with a
floor of 100%, and recall (of the places really said, how many we heard) with a
floor that may only ever rise. Recall bought by loosening the parser shows up
immediately as an invention, which is the trade that has to stay visible: the
first attempt at raising it reached 100% while offering hotels in "Sarah".

Two properties make a correctness gate honest, and both were learned the hard
way in the same afternoon:

- **The corpus cannot only contain the cases that motivated the fix.** One that
  does will read 100% for a parser that got far more dangerous. Hold an
  adversarial set apart — for this desk, proper nouns that are *not* places.
- **A deliberate loss is recorded, not absorbed.** `KNOWN_UNHEARD` names each
  phrasing we knowingly cannot read and why, so a miss budget never quietly
  swallows a decision.

Self-healing cannot cover this class. Retries, circuit breakers and provider
fallback all trigger on an **error**; a confidently wrong answer raises none.

Run `npm run test:all` before pushing. If you add a class of defect to this
repo's history, add the gate that closes it in the same PR.
