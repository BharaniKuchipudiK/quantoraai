# Research Analyst Workspace

The Research desk is where Quantora earns the sentence **"every claim on this
board can be defended."** The outcome is a dossier — the question, the
findings, and where every one of them came from — not a chat transcript that
merely sounds informed. The standing line ("N answers backed by live sources ·
M unverified") is the product's honesty made legible at a glance.

## Contracts (what must stay true)

- **The board earns its rows.** `ResearchBoard` renders nothing until the
  analyst has asked something; every region is conditional; chips steer the
  conversation and never pretend to browse.
- **A source row exists only because a grounded reply listed it.** The brief
  (`src/lib/research-brief.js`) derives everything from the transcript: the
  server appends a numbered `**Sources**` block to grounded replies, and only
  that exact shape counts. No invented precision.
- **Grounding is desk-scoped.** `shouldGroundTurn` (`api/_lib/studio-domains.ts`)
  turns live web search on for research chat turns only. Build, repair,
  verify and every other desk stay off; no other surface's cost changes.
- **"Verified" means provenance, not truth.** The verification pass
  (`api/_lib/research-verify.ts`) lets a model *propose* an evidence passage
  and stance per finding; the deterministic verifier
  (`api/_lib/research-claim-verifier.ts`) grants a standing only when that
  passage exists **verbatim** in the server-fetched source text. Supported =
  "supporting quote verified in source". Contested = a verified passage
  disagrees. Everything else is unverified, with a named reason — a refused
  lookup is not an outage, and a missing standing is a fact, not a bug.
- **Fetching is admission-gated.** `admitResearchSourceUrl` allows only
  public https on the default port; `research-source-fetch` re-admits every
  redirect hop before following it, caps size and time, and reports failures
  as reasons rather than throwing.
- **Fail closed, reject oversize.** Every layer refuses invalid or oversized
  input rather than truncating it — truncation could discard the negating
  suffix a decision depends on (the Study verifier's lesson).

## Phases

1. **The dossier board** *(shipped)* — grounding on for research turns, the
   analyst evidence directive, the transcript-derived brief, the wired board.
2. **Claim verification** *(shipped)* — the `research-verify` task:
   fetch cited sources, model proposes verbatim passages, deterministic
   verifier grants supported / contested / unverified standings the board
   renders per finding.
3. **Contradiction & decomposition** *(shipped)* — when verified evidence
   points both ways, the verification pass returns both passages and the
   board renders the disagreement side by side (Supports / Disagrees), never
   a picked winner. Broad questions open with a `**Plan**` block of
   sub-questions the board tracks: open ones are chips that pursue the item
   verbatim, explored ones collapse to a quiet line.
4. **The dossier as a deliverable** *(shipped)* — "Export brief" writes the
   board to a markdown file of record (`src/lib/research-brief-export.js`):
   plan with explored marks, findings with their standings and verified
   quotes, the source ledger, and a footer stating exactly what "verified"
   means. Deterministic — no model touches the export, so the file says what
   the board showed. Chip prompts moved to `research-board-actions.js` under
   a tested contract: every steering prompt carries the marker the brief
   filters on, so a chip turn can never silently replace the question.
5. **The deep dive** *(shipped)* — task `research-deep-dive`
   (`api/_lib/research-deep-dive.ts`, research desk only, Gemini search
   path): decompose the question into ≤3 sub-questions, run one grounded
   lookup each, and return TRANSCRIPT MESSAGES in the canonical shape the
   brief already parses — a Plan block, then a pursuit turn and grounded
   answer per sub-question. One machinery, no new parser: the test feeds the
   dive's output straight into `deriveResearchBrief`. A failed lookup leaves
   its plan item an open chip, never an invented answer; a total failure is
   an error, not an empty success.
6. **Continuity** — investigations already persist per device: sessions live
   in localStorage and the board re-derives from the transcript on load.
   Cross-device persistence remains *planned*.
7. **Watched questions** *(shipped)* — "Watch this question" stores a
   standing question (≤3 per account, `research_watches` table, service-role
   only). The daily scheduled run (`/api/models`, where the retention sweep
   already piggybacks) re-checks due watches with one grounded lookup each,
   bounded per run. Change detection is DETERMINISTIC — no model judges "did
   it change": each sweep reduces the reply to a snapshot (publishers +
   finding-shaped bullet count) and compares snapshots. The baseline is set
   by the first sweep, never by the dossier at watch time, so comparisons
   stay like-for-like. A flagged change stays flagged, with its note, until
   the person dismisses it — a later quiet sweep cannot silently retract
   news — and a failed lookup leaves the row untouched for tomorrow. The
   board surfaces "the evidence moved" with the deterministic note on the
   watcher's next visit (`api/_lib/research-watch.ts`).

## Wiring map

| Concern | Home |
|---|---|
| Grounding decision | `api/_lib/studio-domains.ts` (`shouldGroundTurn`) |
| Analyst directive | `api/_lib/studio-domains.ts` (research directive) |
| Dossier brief (pure) | `src/lib/research-brief.js` |
| Board UI | `src/components/ResearchBoard.jsx` (lazy, research desk only) |
| Claim verifier (pure) | `api/_lib/research-claim-verifier.ts` |
| Source fetch + admission | `api/_lib/research-source-fetch.ts` |
| Verification orchestration | `api/_lib/research-verify.ts`, task `research-verify` in `/api/chat` |
