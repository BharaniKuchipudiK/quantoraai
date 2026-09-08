import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripNonCode } from "../../../src/lib/wiring-audit.js";

/**
 * ---------------------------------------------------------------------------
 * A FIELD THE SERVER READS THAT NO CLIENT SENDS IS A FEATURE THAT CANNOT RUN.
 *
 * normalizeCommunicationRequest reads the chat request body and defaults every
 * absent field to empty or false. That is correct defensive code, and it is
 * also perfectly silent: a field nobody sends looks exactly like a field the
 * user did not use. Nothing errors, nothing logs, and the capability behind it
 * simply never happens.
 *
 * Three were found that way on 2026-09-08, all on the same seam and all about
 * the desk knowing what the person had already done:
 *
 *   listeningSignals  the "RECENT USER BEHAVIOR" block — every prompt built
 *                     since 2026-09-01 has had it empty, so the model has
 *                     never known you opened Preview, published, or picked a
 *                     chip. Both halves shipped in ONE 862-file commit titled
 *                     "Golden gate: make its failures diagnosable from its own
 *                     log", so the feature was never reviewed as a feature.
 *   choiceSelected    whether the person picked a chip — the server's own
 *                     prompt says "if they chose a chip, treat that path as
 *                     confirmed intent", and it could never be true.
 *   featureSuggest    selects FEATURE_SUGGEST_DIRECTIVE over the guided build
 *                     directive. An entire build mode that has never once run.
 *
 * Every check the repo had passed over all three. The server test feeds its own
 * fixture. The client functions exist and are exported, so the wiring gate sees
 * them mentioned. test:dead-controls asks the same question one level up — a
 * /api/ PATH the frontend calls that nothing serves — and this is its mirror: a
 * FIELD the server serves that no frontend sends.
 *
 * KNOWN_NOT_SENT is the deliberate-loss register, the same idea as
 * KNOWN_UNHEARD in travel-comprehension: a field may be knowingly unsent, but
 * it has to be named and reasoned about here rather than quietly absent.
 * ---------------------------------------------------------------------------
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");

/**
 * Fields the server reads that no client sends TODAY, on purpose, with why.
 * Wiring one is how it leaves this list; deleting the server's read of it is
 * the other way. Staying here silently is not an option the gate allows.
 */
const KNOWN_NOT_SENT: Record<string, string> = {
  listeningSignals:
    "The RECENT USER BEHAVIOR block. useStudioSession already RETURNS listeningSignals and "
    + "recordListeningSignal; AiStudio destructures neither, so nothing records a signal and "
    + "nothing puts one on the wire. Wiring it needs two things together — a recorder at the "
    + "real events (preview opened, published, chip chosen) and the field in requestBodyFor — "
    + "because transport alone would ship an array that is always empty. Named here so the gap "
    + "is a line someone reads rather than silence.",
  choiceSelected:
    "Whether this turn came from clicking a chip. The server's own prompt says 'if they chose "
    + "a chip, treat that path as confirmed intent', and it has never once been true. "
    + "AiStudio's handleSendMessage already takes sendOptions, so the value has a home; what it "
    + "needs is the chip handler to pass it.",
  featureSuggest:
    "Selects FEATURE_SUGGEST_DIRECTIVE instead of the guided build directive — a whole "
    + "build mode that has never run in production. Turning it on is a product decision "
    + "about WHEN the desk should suggest features rather than build, not a wiring fix, "
    + "so it is named here rather than switched on by the change that found it.",
};

/*
 * The files that BUILD a chat request. Every field on the wire is written in
 * one of these — the main builder, the helpers it spreads, and the other
 * surfaces that post to /api/chat.
 *
 * An explicit list, and each file is asserted to EXIST below. A gate that
 * measures a path nobody serves will confirm anything you write next to it:
 * on 2026-09-08 one passed on a maxDuration pinned to api/chat.ts, a file that
 * does not exist, and the deployment failed. A new request-field helper has to
 * be added here, and the register at the bottom is where a field that is
 * deliberately unsent gets its reason.
 */
const REQUEST_SURFACE = [
  "src/hooks/useChatStream.js",
  "src/lib/studio-mode.js",
  "src/lib/studio-desk-context.js",
  "src/lib/study-adaptive-request.js",
  "src/components/LivePreviewCanvas.jsx",
  "src/components/ResearchBoard.jsx",
  "src/components/StudyOnboarding.jsx",
];

test("every field the chat request normalizer reads is one some client actually sends", () => {
  const normalizer = stripNonCode(
    readFileSync(join(HERE, "request-normalizer.ts"), "utf8"),
  );

  /* What the server expects to arrive. */
  const read = new Set<string>();
  for (const match of normalizer.matchAll(/\bbody\s*\??\.\s*([A-Za-z_$][\w$]*)/g)) {
    read.add(match[1]);
  }
  assert.ok(read.size > 10, `expected to find the body reads; found ${read.size}`);

  /*
   * What the surface sends. A BARE IDENTIFIER, not `field:` — requestBodyFor
   * writes `attachedImages,` in ES6 shorthand, so a colon-anchored match called
   * the working attachments path dead. And the scan is scoped to the surface
   * rather than all of src/, because `listeningSignals:` also appears in
   * listening-layer.js as a key on a SESSION object, which put a field that
   * never reaches the wire on the sent side. Both errors were in the first cut
   * of this file, in opposite directions.
   */
  const surface = REQUEST_SURFACE.map((rel) => {
    const path = join(ROOT, rel);
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      throw new Error(
        `REQUEST_SURFACE names ${rel}, which does not exist. A gate that reads a file `
        + "that is not there measures nothing and says nothing.",
      );
    }
    return stripNonCode(text);
  }).join("\n");

  assert.match(surface, /\bstudioDomain\b/, "sanity: a field known to be sent must read as sent");

  const unsent = [...read]
    .filter((field) => !new RegExp(`\\b${field}\\b`).test(surface))
    .filter((field) => !(field in KNOWN_NOT_SENT))
    .sort();

  assert.deepEqual(
    unsent,
    [],
    `\n  The server reads these from the chat body and no client sends them, so the\n`
    + `  capability behind each one can never happen and nothing will ever say so:\n\n`
    + unsent.map((f) => `    ${f}`).join("\n")
    + `\n\n  Send it from the request builder, delete the server's read of it, or add it\n`
    + `  to KNOWN_NOT_SENT with the reason it is deliberately unsent.\n`,
  );
});

test("the deliberate-loss register names only fields the server still reads", () => {
  /*
   * The register rots the other way too: a field wired up, or removed from the
   * server, leaves a reason here describing a gap that no longer exists — and
   * the next reader believes it.
   */
  const normalizer = stripNonCode(
    readFileSync(join(HERE, "request-normalizer.ts"), "utf8"),
  );
  const stale = Object.keys(KNOWN_NOT_SENT)
    .filter((field) => !new RegExp(`\\bbody\\s*\\??\\.\\s*${field}\\b`).test(normalizer));

  assert.deepEqual(
    stale,
    [],
    `KNOWN_NOT_SENT still excuses ${stale.join(", ")}, which the server no longer reads. Delete the entry.`,
  );
});
