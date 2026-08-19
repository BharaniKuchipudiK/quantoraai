import assert from "node:assert/strict";
import test from "node:test";
import {
  activeCognitiveLedgerEntries,
  appendCognitiveLedgerEntry,
  cognitiveLedgerEvidenceCoverage,
  formatCognitiveLedgerForPrompt,
  normalizeCognitiveLedger,
} from "./cognitive-ledger.js";

test("missing ledger is backward-compatible", () => {
  assert.deepEqual(normalizeCognitiveLedger(undefined), []);
  assert.deepEqual(normalizeCognitiveLedger(null), []);
});

test("normalization sanitizes entries and creates stable ids", () => {
  const first = normalizeCognitiveLedger([{
    type: "decision",
    statement: "  Use the API pull mechanism  ",
    actor: "user",
    confidence: 7,
  }]);
  const second = normalizeCognitiveLedger([{
    type: "decision",
    statement: "Use the API pull mechanism",
    actor: "user",
    confidence: 7,
  }]);

  assert.equal(first.length, 1);
  assert.equal(first[0].statement, "Use the API pull mechanism");
  assert.equal(first[0].confidence, 1);
  assert.equal(first[0].id, second[0].id);
});

test("a correction can supersede an earlier decision without erasing history", () => {
  const initial = appendCognitiveLedgerEntry([], {
    id: "decision-1",
    type: "decision",
    statement: "Use batch synchronization",
    actor: "user",
  });
  const corrected = appendCognitiveLedgerEntry(initial, {
    id: "correction-1",
    type: "correction",
    statement: "Use API pull instead of batch synchronization",
    actor: "user",
    supersedes: "decision-1",
  });

  assert.equal(corrected.length, 2);
  assert.equal(corrected.find((entry) => entry.id === "decision-1")?.status, "superseded");
  assert.deepEqual(activeCognitiveLedgerEntries(corrected).map((entry) => entry.id), ["correction-1"]);
});

test("rejections remain first-class active history", () => {
  const ledger = normalizeCognitiveLedger([{
    id: "reject-1",
    type: "rejection",
    statement: "Do not use the three-card homepage layout again",
    rationale: "It made the proposition feel fragmented",
    actor: "user",
  }]);
  const prompt = formatCognitiveLedgerForPrompt(ledger);

  assert.match(prompt, /REJECTION/);
  assert.match(prompt, /Do not use the three-card homepage layout again/);
  assert.match(prompt, /Do not revive a rejected direction/);
});

test("evidence coverage is based on linked active outcome events", () => {
  const ledger = normalizeCognitiveLedger([
    { id: "d1", type: "decision", statement: "Use API pull", actor: "user", ref: "arch:v3" },
    { id: "a1", type: "approval", statement: "Architecture approved", actor: "user", ref: "arch:v3" },
    { id: "e1", type: "evidence", statement: "Architecture review passed", actor: "tool", ref: "arch:v3" },
    { id: "d2", type: "decision", statement: "Move finance references out", actor: "user", ref: "deck:v4" },
  ]);

  assert.equal(cognitiveLedgerEvidenceCoverage(ledger), 0.667);
});

test("ledger is bounded and de-duplicates ids", () => {
  const entries = Array.from({ length: 150 }, (_, index) => ({
    id: `entry-${index}`,
    type: "decision",
    statement: `Decision ${index}`,
    actor: "user",
  }));
  entries.push({ id: "entry-149", type: "decision", statement: "Duplicate", actor: "user" });
  const ledger = normalizeCognitiveLedger(entries);

  assert.equal(ledger.length, 120);
  assert.equal(ledger.filter((entry) => entry.id === "entry-149").length, 1);
});
