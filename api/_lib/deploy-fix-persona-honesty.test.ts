/**
 * A silent system prompt is not neutral.
 *
 * The incident this closes: a signed-in user with no GitHub connection asked
 * the desk to push a fix to production. With no GitHub tools and no directive
 * telling the model what it can or cannot do, the model fell back to its base
 * training and answered with a fabrication — "I cannot access your GitHub, no
 * repo token, no shell on your machine" — followed by a shell command for the
 * user to run locally. None of that is true: the actual and much simpler fact
 * is that GitHub was never connected in Settings.
 *
 * githubPersona (GITHUB TOOL DIRECTIVE) already existed for the connected
 * case; githubWriteDirective already existed to name the read-only boundary
 * for a connected-but-not-opted-in user. Neither covers the disconnected
 * case, where githubToolsEnabled is false and githubPersona is the empty
 * string — no directive at all. This test reads the source directly, the
 * same way stream-liveness-contract.test.js does, because the persona
 * strings live inline in chat-handler.ts and are not separately exported.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RAW = readFileSync(join(HERE, "chat-handler.ts"), "utf8");

function extractConst(name: string): string {
  const marker = `const ${name} =`;
  const start = RAW.indexOf(marker);
  assert.ok(start >= 0, `${name} was not found in chat-handler.ts — this gate has stopped reading the file`);
  // Bounded scan to the next top-level `const` declaration at the same
  // indentation, so this does not silently swallow unrelated code below it.
  const next = RAW.indexOf("\n      const ", start + marker.length);
  return next > start ? RAW.slice(start, next) : RAW.slice(start, start + 4000);
}

test("a disconnected/toolless GitHub persona exists and is gated on no tools + signed in", () => {
  const block = extractConst("githubDisconnectedPersona");
  assert.match(block, /!githubToolsEnabled/, "must only render when GitHub tools are NOT enabled");
  assert.match(block, /activeSessionUser\?\.sub/, "must only render for a signed-in user (an anonymous session has no GitHub identity to connect)");
});

test("the disconnected persona names the real fact and forbids the fabricated one", () => {
  const block = extractConst("githubDisconnectedPersona");
  assert.match(block, /Settings/i, "must point the user at Settings/connection, the actual fix");
  assert.match(block, /no shell or filesystem access/i, "must state plainly that there is no shell access, rather than leaving it to be invented");
  assert.match(block, /do not invent a technical reason/i, "must explicitly forbid inventing an excuse like 'no repo token'");
  assert.match(block, /do not hand them a shell command/i, "must explicitly forbid prescribing a local shell workaround");
});

test("the disconnected persona is actually wired into the system prompt sent to the model", () => {
  const wiring = RAW.slice(RAW.indexOf("const injectedSystemPrompt ="));
  assert.match(wiring.slice(0, 200), /githubDisconnectedPersona/, "githubDisconnectedPersona is computed but never concatenated into injectedSystemPrompt — the model would never see it");
});

test("the connected-tools directive and the disconnected directive cannot both fire for the same turn", () => {
  // githubPersona is truthy only when githubToolsEnabled; githubDisconnectedPersona
  // is truthy only when !githubToolsEnabled — mutually exclusive by construction.
  const connected = extractConst("githubPersona");
  const disconnected = extractConst("githubDisconnectedPersona");
  assert.match(connected, /githubToolsEnabled \? `/);
  assert.match(disconnected, /!githubToolsEnabled/);
});

test("the diagnose-and-fix directive never lets the model claim it tested the fix, and checks the real result after pushing", () => {
  const block = extractConst("deployFixPersona");
  assert.match(block, /NO way to run the user's test suite or build locally/i, "must state plainly there is no local test/build sandbox");
  assert.match(block, /never claim you "validated", "tested", or "confirmed"/i, "must forbid claiming pre-push verification that never happened");
  assert.match(block, /call list_vercel_deployments again/i, "must instruct checking the real deployment result after opening the PR, not just declaring victory at push time");
});

test("the sandbox persona exists, is gated on sandboxToolsEnabled, and is wired into the system prompt", () => {
  const block = extractConst("sandboxPersona");
  assert.match(block, /sandboxToolsEnabled \? `/, "must only render when sandbox tools are actually offered this turn");
  assert.match(block, /REAL repository/i);
  assert.match(block, /destroyed after every call/i, "must state plainly the sandbox is torn down, not a persistent machine");
  assert.match(block, /never pushes, commits, deploys, or merges/i, "must forbid the model from treating a check as a write");

  const wiring = RAW.slice(RAW.indexOf("const injectedSystemPrompt ="));
  assert.match(wiring.slice(0, 250), /sandboxPersona/, "sandboxPersona is computed but never concatenated into injectedSystemPrompt — the model would never see it");
});

test("the diagnose-and-fix directive only claims a sandbox check exists when sandboxToolsEnabled is true", () => {
  const block = extractConst("deployFixPersona");
  assert.match(block, /sandboxToolsEnabled \? `- You DO have a way to actually run the fix/, "the 'you can run it' branch must be conditioned on sandboxToolsEnabled");
  assert.match(block, /You have NO way to run the user's test suite/, "the honest fallback sentence must still exist for when sandboxToolsEnabled is false");
});
