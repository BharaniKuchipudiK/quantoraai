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

test("Travel directive requires ratings and usable property links without inventing hotel class", () => {
  const directive = buildDomainDirective("travel");
  assert.match(directive, /Google user rating/i);
  assert.match(directive, /★ 4\.6\/5/);
  assert.match(directive, /NOT an official hotel star classification/i);
  assert.match(directive, /property name clickable/i);
  assert.match(directive, /View property & photos/i);
  assert.match(directive, /Omit any field.*instead of guessing/is);
});

test("buildDomainDirective is empty for general chat", () => {
  assert.equal(buildDomainDirective(null), "");
});
