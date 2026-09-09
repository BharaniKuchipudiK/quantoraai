import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { stripNonCode } from "../../src/lib/wiring-audit.js";

/*
 * EVERY GEMINI CALL IS BOUNDED, COUNTED RATHER THAN SAMPLED.
 *
 * The @google/genai SDK is interruptible only through config.abortSignal. A
 * call without one runs until the serverless function is killed by the
 * platform, which is how a user got a 69.4-second dead route from the chat
 * handler on 2026-09-09 — and, when that was fixed, how TWELVE more call sites
 * were found in the same shape: autocomplete (which runs as you type), the
 * intent router, both research paths, the repair loop, the build critic, both
 * pipeline calls, Office generation and domain suggestions.
 *
 * This gate counts. api/_lib/stream-liveness-contract.test.ts exists because
 * its first version ran .exec() for one bound and asserted it existed —
 * .exec() returns the FIRST match, there were three call sites, and the class
 * stayed open through two more occurrences. So this walks every file under
 * api/, finds every call, and reports the total; a parse that matches nothing
 * fails rather than reporting a clean run over an empty list (CLAUDE.md §4).
 *
 * Comments are stripped first. Without that, this file's own prose about
 * "models.generateContent" would count as a call site — the survey that found
 * the twelve made exactly that mistake before the strip was added.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(HERE, "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|js)$/.test(entry) && !/\.test\.(ts|js)$/.test(entry)) out.push(full);
  }
  return out;
}

/** The argument text of each `models.generateContent(` call, braces balanced. */
function generateContentCalls(source: string) {
  const sites: Array<{ index: number; args: string }> = [];
  const re = /models\s*\.\s*generateContent\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < source.length && depth > 0; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") depth -= 1;
    }
    sites.push({ index: match.index, args: source.slice(match.index + match[0].length, i - 1) });
  }
  return sites;
}

test("every Gemini generateContent call under api/ is bounded by an abortSignal", () => {
  const unbounded: string[] = [];
  let total = 0;

  for (const file of sourceFiles(API_ROOT)) {
    const raw = readFileSync(file, "utf8");
    if (!/models\s*\.\s*generateContent/.test(raw)) continue;

    const source = stripNonCode(raw);
    assert.equal(source.length, raw.length, `${file}: stripNonCode must blank in place, or the line numbers below are wrong`);

    for (const site of generateContentCalls(source)) {
      total += 1;
      if (/\babortSignal\s*:/.test(site.args)) continue;
      const line = raw.slice(0, site.index).split("\n").length;
      unbounded.push(
        `  ${relative(API_ROOT, file)}:${line} — generateContent with no config.abortSignal. `
        + `The SDK cannot be interrupted any other way, so this call runs until the platform kills the function.`,
      );
    }
  }

  assert.ok(
    total > 0,
    "found no generateContent call sites under api/ — the parse broke, and a gate that matches nothing is not a clean run",
  );

  assert.deepEqual(
    unbounded,
    [],
    `\n${unbounded.join("\n")}\n\n  ${total} call sites were checked. Give each one a budget: prefer the number the\n`
    + "  same file already states for its OpenRouter path (they were chosen for that\n"
    + "  exact job and simply never applied to the Gemini branch), and reach for\n"
    + "  UNTUNED_GEMINI_CEILING_MS from ./gemini-call-budget.js only where no such\n"
    + "  number exists. A bound that is too tight breaks a working call, which is a\n"
    + "  worse bug than the hang it replaces.\n",
  );
});
