import assert from "node:assert/strict";
import test from "node:test";
import {
  describeEvidenceChange,
  normalizeWatchQuestion,
  snapshotFromGroundedReply,
  sweepResearchWatches,
  type ResearchWatchRow,
} from "./research-watch.js";

const REPLY = {
  answer: [
    "- Utility solar undercut new nuclear in every 2024 market survey reviewed.",
    "- Firming costs narrow the gap in island grids according to two studies.",
    "- Too short bullet.",
    "- Is this a question rather than a finding?",
  ].join("\n"),
  sources: [
    { uri: "https://www.nature.com/articles/x123", title: "Nature study" },
    { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "reuters.com" },
    { uri: "not a url", title: "junk" },
  ],
};

const row = (overrides: Partial<ResearchWatchRow> = {}): ResearchWatchRow => ({
  id: "w1",
  user_sub: "sub1",
  question: "Is nuclear cheaper than solar per MWh today?",
  evidence_digest: "",
  evidence_hosts: [],
  finding_count: 0,
  changed: false,
  change_note: "",
  last_checked_at: null,
  created_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

test("normalizeWatchQuestion enforces the question contract", () => {
  assert.equal(normalizeWatchQuestion("  Is nuclear   cheaper than solar?  "), "Is nuclear cheaper than solar?");
  assert.equal(normalizeWatchQuestion("short"), "");
  assert.equal(normalizeWatchQuestion("x".repeat(501)), "");
  assert.equal(normalizeWatchQuestion(42), "");
});

test("a grounded reply reduces to publishers plus finding-shaped bullets", () => {
  const snapshot = snapshotFromGroundedReply(REPLY);
  assert.deepEqual(snapshot.hosts, ["nature.com", "reuters.com"]);
  assert.equal(snapshot.findingCount, 2);
  assert.equal(snapshot.digest.length, 24);
  // Deterministic: same reply, same digest.
  assert.equal(snapshotFromGroundedReply(REPLY).digest, snapshot.digest);
});

test("describeEvidenceChange names exactly what moved, and equal digests are quiet", () => {
  const before = snapshotFromGroundedReply(REPLY);
  assert.deepEqual(describeEvidenceChange(before, before), { changed: false, note: "" });

  const after = snapshotFromGroundedReply({
    answer: "- Utility solar undercut new nuclear in every 2024 market survey reviewed.",
    sources: [
      { uri: "https://www.nature.com/articles/x123", title: "Nature study" },
      { uri: "https://www.iea.org/report", title: "IEA report" },
    ],
  });
  const verdict = describeEvidenceChange(before, after);
  assert.equal(verdict.changed, true);
  assert.match(verdict.note, /new source: iea\.org/);
  assert.match(verdict.note, /no longer cited: reuters\.com/);
  assert.match(verdict.note, /findings went from 2 to 1/);
});

test("the first sweep sets the baseline without flagging a change", async () => {
  const saved: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const result = await sweepResearchWatches({
    groundedAnswer: async () => REPLY,
    listDue: async () => [row()],
    save: async (id, patch) => { saved.push({ id, patch }); return true; },
  });
  assert.deepEqual(result, { checked: 1, changed: 0 });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].patch.changed, undefined);
  assert.deepEqual(saved[0].patch.evidence_hosts, ["nature.com", "reuters.com"]);
});

test("a later sweep flags and describes a real change; a quiet sweep retracts nothing", async () => {
  const baseline = snapshotFromGroundedReply(REPLY);
  const saved: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const watched = row({
    evidence_digest: baseline.digest,
    evidence_hosts: baseline.hosts,
    finding_count: baseline.findingCount,
    last_checked_at: "2026-09-01T03:00:00Z",
  });

  const changedRun = await sweepResearchWatches({
    groundedAnswer: async () => ({ answer: REPLY.answer, sources: [REPLY.sources[0]] }),
    listDue: async () => [watched],
    save: async (id, patch) => { saved.push({ id, patch }); return true; },
  });
  assert.deepEqual(changedRun, { checked: 1, changed: 1 });
  assert.equal(saved[0].patch.changed, true);
  assert.match(String(saved[0].patch.change_note), /no longer cited: reuters\.com/);

  // Already-flagged watch, evidence now stable at the new state: the patch
  // must not clear `changed` — only the person acknowledges news away.
  const stable = snapshotFromGroundedReply({ answer: REPLY.answer, sources: [REPLY.sources[0]] });
  const flagged = row({
    evidence_digest: stable.digest,
    evidence_hosts: stable.hosts,
    finding_count: stable.findingCount,
    changed: true,
    change_note: "no longer cited: reuters.com",
    last_checked_at: "2026-09-01T03:00:00Z",
  });
  const quiet: Array<{ id: string; patch: Record<string, unknown> }> = [];
  await sweepResearchWatches({
    groundedAnswer: async () => ({ answer: REPLY.answer, sources: [REPLY.sources[0]] }),
    listDue: async () => [flagged],
    save: async (id, patch) => { quiet.push({ id, patch }); return true; },
  });
  assert.equal(quiet[0].patch.changed, undefined);
  assert.equal(quiet[0].patch.change_note, undefined);
});

test("a failed lookup leaves the row untouched for tomorrow", async () => {
  const saved: unknown[] = [];
  const result = await sweepResearchWatches({
    groundedAnswer: async () => { throw new Error("provider down"); },
    listDue: async () => [row()],
    save: async (id, patch) => { saved.push(patch); return true; },
  });
  assert.deepEqual(result, { checked: 0, changed: 0 });
  assert.equal(saved.length, 0);
});
