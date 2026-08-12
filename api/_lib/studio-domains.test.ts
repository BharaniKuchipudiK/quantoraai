import assert from "node:assert/strict";
import test from "node:test";
import { buildDomainDirective, normalizeStudioDomain } from "./studio-domains.js";

test("normalizeStudioDomain accepts known domains", () => {
  assert.equal(normalizeStudioDomain("travel"), "travel");
  assert.equal(normalizeStudioDomain("finance"), "finance");
  assert.equal(normalizeStudioDomain("invalid"), null);
  assert.equal(normalizeStudioDomain(null), null);
});

test("buildDomainDirective returns travel focus text", () => {
  const directive = buildDomainDirective("travel");
  assert.match(directive, /DOMAIN FOCUS: TRAVEL/);
  assert.match(directive, /conversation loop naturally/);
});

test("buildDomainDirective is empty for general chat", () => {
  assert.equal(buildDomainDirective(null), "");
});
