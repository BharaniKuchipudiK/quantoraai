import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDomainName, normalizeRequestedProjectName, ownedProjectName } from "./publish-policy.js";

test("project names are normalized without embedding user input verbatim", () => {
  assert.equal(normalizeRequestedProjectName(" My Great App!!! "), "my-great-app");
  assert.equal(normalizeRequestedProjectName("---"), "quantora-app");
});

test("project namespace is stable per owner and separated across owners", () => {
  assert.equal(ownedProjectName("Store", "owner-a"), ownedProjectName("Store", "owner-a"));
  assert.notEqual(ownedProjectName("Store", "owner-a"), ownedProjectName("Store", "owner-b"));
  assert.ok(ownedProjectName("x".repeat(200), "owner-a").length <= 50);
});

test("domain normalization accepts hostnames and rejects paths, ports, and malformed labels", () => {
  assert.equal(normalizeDomainName("https://Shop.Example.com/"), "shop.example.com");
  assert.equal(normalizeDomainName("example.com/path"), null);
  assert.equal(normalizeDomainName("example.com:443"), null);
  assert.equal(normalizeDomainName("-bad.example.com"), null);
});
