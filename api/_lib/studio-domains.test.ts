import assert from "node:assert/strict";
import test from "node:test";
import { buildDomainDirective, normalizeStudioDomain } from "./studio-domains.js";

test("normalizeStudioDomain accepts known domains", () => {
  assert.equal(normalizeStudioDomain("travel"), "travel");
  assert.equal(normalizeStudioDomain("finance"), "finance");
  assert.equal(normalizeStudioDomain("invalid"), null);
  assert.equal(normalizeStudioDomain(null), null);
});

test("buildDomainDirective makes Travel an engaged outcome partner", () => {
  const directive = buildDomainDirective("travel");
  assert.match(directive, /DOMAIN FOCUS: TRAVEL ADVISOR/);
  assert.match(directive, /move the planning forward/i);
  assert.match(directive, /ONE highest-value next question or offer/i);
  assert.match(directive, /Never re-ask details/i);
  assert.match(directive, /dates.*travellers.*budget.*passport\/visa/is);
  assert.match(directive, /end with a short conversational bridge/i);
});

test("buildDomainDirective is empty for general chat", () => {
  assert.equal(buildDomainDirective(null), "");
});
