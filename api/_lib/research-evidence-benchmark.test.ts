import assert from "node:assert/strict";
import test from "node:test";
import { verifyResearchClaimEvidence } from "./research-claim-verifier.js";

/**
 * The Research desk's correctness gate, in the mould of
 * travel-comprehension.test.js: reachability gates ask whether the verifier
 * RUNS; this one asks whether its verdicts are RIGHT.
 *
 * Two numbers pull against each other:
 *
 * - VERIFICATION PRECISION — of the standings we grant, how many are real.
 *   Floor: 100%, forever. A "Verified" badge on evidence the source does not
 *   contain is the one failure this desk must never ship; it is the product
 *   claim itself. The adversarial set below exists to keep this honest: it
 *   holds excerpts that LOOK supportive — paraphrases, reordered clauses,
 *   negated context, stitched fragments — which a looser matcher would wave
 *   through.
 *
 * - VERIFICATION RECALL — of genuinely present evidence, how much earns its
 *   badge. Floor: may only ever rise. Recall bought by loosening the matcher
 *   shows up immediately as a precision failure, which is the trade that has
 *   to stay visible.
 *
 * A deliberate loss is recorded, not absorbed: KNOWN_UNVERIFIED names each
 * evidence shape we knowingly cannot verify under the verbatim contract and
 * why, so the recall floor never quietly swallows a decision.
 */

type BenchmarkCase = {
  name: string;
  sourceText: string;
  excerpt: string;
  /** What the verbatim contract owes this case. */
  expectVerified: boolean;
};

const SOURCE = [
  "Energy outlook, 2026 edition.",
  "In all twelve market surveys published in 2024, utility-scale solar generation cost less per megawatt-hour than newly built nuclear capacity.",
  "The panel noted it is not the case that firming costs close this gap in interconnected grids.",
  "Lifetime extension of existing nuclear plants remains the cheapest low-carbon option in several member states.",
  "One dissenting analysis argued that nuclear undercut solar in three island markets once storage was priced in.",
].join("\n");

const CLAIM = "Utility-scale solar undercut new nuclear on cost in the surveyed markets.";

/** Evidence genuinely present verbatim (allowing harmless normalization). */
const GENUINE: BenchmarkCase[] = [
  {
    name: "exact sentence",
    sourceText: SOURCE,
    excerpt: "In all twelve market surveys published in 2024, utility-scale solar generation cost less per megawatt-hour than newly built nuclear capacity.",
    expectVerified: true,
  },
  {
    name: "case and spacing variance",
    sourceText: SOURCE,
    excerpt: "IN ALL TWELVE MARKET SURVEYS   PUBLISHED IN 2024, utility-scale solar generation cost less per megawatt-hour than newly built nuclear capacity.",
    expectVerified: true,
  },
  {
    name: "curly quotes and long dashes normalized",
    sourceText: SOURCE.replace("utility-scale", "utility–scale"),
    excerpt: "In all twelve market surveys published in 2024, utility-scale solar generation cost less per megawatt-hour than newly built nuclear capacity.",
    expectVerified: true,
  },
  {
    name: "clause mid-paragraph",
    sourceText: SOURCE,
    excerpt: "Lifetime extension of existing nuclear plants remains the cheapest low-carbon option in several member states.",
    expectVerified: true,
  },
];

/**
 * Evidence that LOOKS supportive and must NEVER verify. Each row names the
 * attack it represents; a matcher loosened for recall fails here first.
 */
const ADVERSARIAL: BenchmarkCase[] = [
  {
    name: "faithful paraphrase (same meaning, different words)",
    sourceText: SOURCE,
    excerpt: "Across a dozen 2024 surveys, solar power at utility scale was cheaper per MWh than brand-new nuclear plants.",
    expectVerified: false,
  },
  {
    name: "reordered clauses from the real sentence",
    sourceText: SOURCE,
    excerpt: "Utility-scale solar generation cost less per megawatt-hour than newly built nuclear capacity, in all twelve market surveys published in 2024.",
    expectVerified: false,
  },
  {
    name: "negation stripped from a sentence the source negates",
    sourceText: SOURCE,
    // The source says "it is NOT the case that…"; this is the same sentence
    // with the negation surgically removed — the minimal, deadliest edit.
    excerpt: "The panel noted it is the case that firming costs close this gap in interconnected grids.",
    expectVerified: false,
  },
  {
    name: "two real fragments stitched into one statement",
    sourceText: SOURCE,
    excerpt: "In all twelve market surveys published in 2024, nuclear undercut solar in three island markets once storage was priced in.",
    expectVerified: false,
  },
  {
    name: "real sentence with one load-bearing word swapped",
    sourceText: SOURCE,
    excerpt: "In all twelve market surveys published in 2024, utility-scale solar generation cost more per megawatt-hour than newly built nuclear capacity.",
    expectVerified: false,
  },
  {
    name: "plausible sentence from a different (unfetched) document",
    sourceText: SOURCE,
    excerpt: "Levelized cost analyses from 2025 continue to show solar photovoltaics leading all other generation sources on cost.",
    expectVerified: false,
  },
];

/**
 * Recorded losses: evidence shapes the verbatim contract knowingly rejects,
 * and why the loss is accepted rather than fixed by loosening. Raising
 * recall on these requires a STRONGER mechanism (e.g. verified multi-span
 * quoting), never a weaker matcher.
 */
const KNOWN_UNVERIFIED = [
  {
    shape: "faithful paraphrase",
    why: "accepting paraphrase means a similarity threshold, and every threshold admits the negated/stitched attacks above",
  },
  {
    shape: "quote with an internal ellipsis (…) bridging omitted words",
    why: "the omitted span could carry the negation; verifying around it would truncate meaning, which the verifier's contract forbids",
  },
  {
    shape: "evidence split across two non-adjacent sentences",
    why: "needs multi-span verification with each span independently verbatim — a Phase H1 mechanism, not a looser match",
  },
] as const;

function runCase(benchmarkCase: BenchmarkCase): boolean {
  const result = verifyResearchClaimEvidence({
    claimId: "bench",
    claimText: CLAIM,
    sourceUrl: "https://www.example.com/report",
    sourceText: benchmarkCase.sourceText,
    proposedExcerpt: benchmarkCase.excerpt,
    stance: "supports",
  });
  return result.standing === "supported";
}

test("BENCHMARK: verification precision is 100% — nothing adversarial ever verifies", () => {
  const falseVerifications = ADVERSARIAL.filter(runCase).map((c) => c.name);
  assert.deepEqual(
    falseVerifications,
    [],
    `The verifier granted a standing to evidence the source does not contain: ${falseVerifications.join("; ")}. ` +
    "This floor is 100% forever — see the header before touching the matcher.",
  );
});

test("BENCHMARK: verification recall on genuinely present evidence — floor may only rise", () => {
  const verified = GENUINE.filter(runCase).length;
  const recall = verified / GENUINE.length;
  // Current floor: every genuine case in the corpus verifies. If a new
  // genuine case is added and fails, either strengthen normalization
  // (without breaking precision above) or move it to KNOWN_UNVERIFIED with
  // its reason — never delete it.
  assert.ok(
    recall >= 1,
    `Recall fell to ${(recall * 100).toFixed(0)}% — a genuine-evidence case stopped verifying.`,
  );
});

test("BENCHMARK: every recorded loss names its reason", () => {
  for (const loss of KNOWN_UNVERIFIED) {
    assert.ok(loss.shape.length > 0 && loss.why.length > 20, "a loss without a reason is a miss budget");
  }
});

/**
 * The corpus itself must be load-bearing (CLAUDE.md §2/§4): a NAIVE matcher
 * — "most of the excerpt's words appear in the source" — must FAIL the
 * adversarial set. If this test ever passes with the naive matcher, the
 * corpus has gone soft and catches nothing.
 */
test("BENCHMARK: the adversarial set defeats a naive bag-of-words matcher", () => {
  const naiveVerify = (benchmarkCase: BenchmarkCase): boolean => {
    const sourceWords = new Set(benchmarkCase.sourceText.toLowerCase().split(/\W+/));
    const excerptWords = benchmarkCase.excerpt.toLowerCase().split(/\W+/).filter(Boolean);
    const hits = excerptWords.filter((word) => sourceWords.has(word)).length;
    return hits / excerptWords.length >= 0.8;
  };
  const wavedThrough = ADVERSARIAL.filter(naiveVerify).length;
  assert.ok(
    wavedThrough >= 4,
    `Only ${wavedThrough} adversarial cases fool the naive matcher — the corpus is not adversarial enough to protect precision.`,
  );
});
