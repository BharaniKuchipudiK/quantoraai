import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeResearchVerifyRequest,
  runResearchVerification,
  type ResearchEvidenceProposal,
} from "./research-verify.js";
import type { ResearchSourceFetchResult } from "./research-source-fetch.js";

const CLAIM = { id: "f1", text: "Utility-scale solar undercut new nuclear on cost in 2024 surveys." };
const EXCERPT = "In all twelve market surveys published in 2024, utility-scale solar cost less per megawatt-hour than newly built nuclear capacity.";
const SOURCE_URL = "https://www.example.com/report";
const SOURCE_TEXT = `Preamble. ${EXCERPT} Appendix.`;

const okFetch = async (url: string): Promise<ResearchSourceFetchResult> => ({
  ok: true, url, finalUrl: url, text: SOURCE_TEXT,
});

test("normalizeResearchVerifyRequest enforces caps, uniqueness and URL admission", () => {
  const good = normalizeResearchVerifyRequest({ claims: [CLAIM], sources: [SOURCE_URL, SOURCE_URL] });
  assert.equal(good.ok, true);
  if (good.ok) assert.deepEqual(good.sources, [SOURCE_URL]);

  assert.equal(normalizeResearchVerifyRequest({ claims: [], sources: [SOURCE_URL] }).ok, false);
  assert.equal(normalizeResearchVerifyRequest({ claims: [CLAIM], sources: [] }).ok, false);
  assert.equal(normalizeResearchVerifyRequest({
    claims: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, text: CLAIM.text })),
    sources: [SOURCE_URL],
  }).ok, false);
  assert.equal(normalizeResearchVerifyRequest({
    claims: [CLAIM, CLAIM],
    sources: [SOURCE_URL],
  }).ok, false);
  assert.equal(normalizeResearchVerifyRequest({
    claims: [CLAIM],
    sources: ["https://169.254.169.254/latest"],
  }).ok, false);
  assert.equal(normalizeResearchVerifyRequest({
    claims: [{ id: "f1", text: "short" }],
    sources: [SOURCE_URL],
  }).ok, false);
});

test("a verbatim supporting proposal verifies; an invented one earns nothing", async () => {
  const propose = async (): Promise<ResearchEvidenceProposal[]> => [
    { claimId: "f1", sourceIndex: 0, excerpt: EXCERPT, stance: "supports" },
    { claimId: "f2", sourceIndex: 0, excerpt: "A sentence the source never contained at any point in its text.", stance: "supports" },
  ];
  const response = await runResearchVerification({
    claims: [CLAIM, { id: "f2", text: "A separate claim with fabricated evidence behind it." }],
    sources: [SOURCE_URL],
    fetchText: okFetch,
    proposeEvidence: propose,
  });
  const [first, second] = response.results;
  assert.equal(first.standing, "supported");
  assert.equal(first.excerpt, EXCERPT);
  assert.equal(first.sourceUrl, SOURCE_URL);
  assert.equal(second.standing, "unverified");
  assert.equal(second.reasonCode, "excerpt_not_in_source");
  assert.deepEqual(response.sources, [{ url: SOURCE_URL, fetched: true }]);
});

test("a verified contradicting passage marks the claim contested", async () => {
  const response = await runResearchVerification({
    claims: [CLAIM],
    sources: [SOURCE_URL],
    fetchText: okFetch,
    proposeEvidence: async () => [
      { claimId: "f1", sourceIndex: 0, excerpt: EXCERPT, stance: "contradicts" },
    ],
  });
  assert.equal(response.results[0].standing, "contested");
});

test("unreachable sources leave claims unverified with the reason on the ledger", async () => {
  const response = await runResearchVerification({
    claims: [CLAIM],
    sources: [SOURCE_URL],
    fetchText: async (url) => ({ ok: false, url, reason: "source_http_503" }),
    proposeEvidence: async () => { throw new Error("must not be called"); },
  });
  assert.equal(response.results[0].standing, "unverified");
  assert.equal(response.results[0].reasonCode, "no_reachable_sources");
  assert.deepEqual(response.sources, [{ url: SOURCE_URL, fetched: false, reason: "source_http_503" }]);
});

test("a proposer crash fails closed for every claim", async () => {
  const response = await runResearchVerification({
    claims: [CLAIM],
    sources: [SOURCE_URL],
    fetchText: okFetch,
    proposeEvidence: async () => { throw new Error("model down"); },
  });
  assert.equal(response.results[0].standing, "unverified");
  assert.equal(response.results[0].reasonCode, "evidence_proposal_failed");
});

test("a claim the proposer omits stays unverified as no_evidence_proposed", async () => {
  const response = await runResearchVerification({
    claims: [CLAIM],
    sources: [SOURCE_URL],
    fetchText: okFetch,
    proposeEvidence: async () => [],
  });
  assert.equal(response.results[0].reasonCode, "no_evidence_proposed");
});

test("a proposal citing an unfetched source index earns nothing", async () => {
  const response = await runResearchVerification({
    claims: [CLAIM],
    sources: [SOURCE_URL],
    fetchText: okFetch,
    proposeEvidence: async () => [
      { claimId: "f1", sourceIndex: 7, excerpt: EXCERPT, stance: "supports" },
    ],
  });
  assert.equal(response.results[0].standing, "unverified");
  assert.equal(response.results[0].reasonCode, "evidence_source_not_fetched");
});

test("verified evidence pointing both ways surfaces as disagreement, never a winner", async () => {
  const COUNTER = "A later meta-analysis found newly built nuclear undercut utility-scale solar in three of the twelve surveyed markets.";
  const response = await runResearchVerification({
    claims: [CLAIM],
    sources: [SOURCE_URL, "https://www.example.org/counter"],
    fetchText: async (url) => ({
      ok: true,
      url,
      finalUrl: url,
      text: url.includes("counter") ? `Preamble. ${COUNTER} Appendix.` : SOURCE_TEXT,
    }),
    proposeEvidence: async () => [
      { claimId: "f1", sourceIndex: 0, excerpt: EXCERPT, stance: "supports" },
      { claimId: "f1", sourceIndex: 1, excerpt: COUNTER, stance: "contradicts" },
    ],
  });
  const [result] = response.results;
  assert.equal(result.standing, "contested");
  assert.equal(result.reasonCode, "sources_disagree");
  assert.equal(result.excerpt, EXCERPT);
  assert.equal(result.sourceUrl, SOURCE_URL);
  assert.equal(result.counter?.excerpt, COUNTER);
  assert.equal(result.counter?.sourceUrl, "https://www.example.org/counter");
});

test("a supported verdict beats an earlier failed proposal for the same claim", async () => {
  const response = await runResearchVerification({
    claims: [CLAIM],
    sources: [SOURCE_URL],
    fetchText: okFetch,
    proposeEvidence: async () => [
      { claimId: "f1", sourceIndex: 0, excerpt: "Not present in the source text at all, whatever the stance says.", stance: "supports" },
      { claimId: "f1", sourceIndex: 0, excerpt: EXCERPT, stance: "supports" },
    ],
  });
  assert.equal(response.results[0].standing, "supported");
});
