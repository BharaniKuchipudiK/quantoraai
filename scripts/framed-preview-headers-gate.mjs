#!/usr/bin/env node
/*
 * THE HEADERS THAT DECIDE WHETHER PREVIEW EVER STARTS.
 *
 * Preview is a same-origin iframe: /preview/embed.html rendered inside the app
 * at / and /desk. Three headers in vercel.json decide whether the browser will
 * do that at all, and every one of them fails SILENTLY from the user's side —
 * the iframe's onLoad fires on the browser's own block page, so the client
 * never learns anything went wrong and Preview sits on
 * "Verifying — running the preview…" forever:
 *
 *   X-Frame-Options: DENY on a framed document   -> "refused to connect"
 *   parent is COEP:require-corp, framed lacks CORP -> parent cannot embed it
 *   parent is COEP:require-corp, framed is not     -> navigation blocked
 *
 * checkFramedDocumentContract has known all three since it was written, and
 * has tests proving it knows them. NOTHING EVER CALLED IT. It sat in
 * wiring-baseline.json as an accepted orphan — a guard against the exact
 * "Preview does nothing" failure this platform kept shipping, never once run
 * against the config it was written to judge.
 *
 * This is that call. The audit exists to find capabilities nobody asks; this
 * is one of them, asked.
 *
 * PRECISE ON PURPOSE (§5). It fails only on the three contradictions above —
 * each one a header value that provably stops the embed. It says nothing about
 * CSP contents, cache policy, or any header whose effect is arguable, because
 * a gate that fires on debatable evidence is one someone mutes under pressure,
 * and then it protects nothing.
 *
 * The paths are IMPORTED, never spelled here: PREVIEW_EMBED_PATH is the same
 * constant the client builds its iframe src from, so moving the preview shell
 * moves this gate with it instead of leaving it guarding an address nobody
 * serves.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { checkFramedDocumentContract } from '../src/lib/vercel-headers.js';
import { PREVIEW_EMBED_PATH } from '../src/lib/preview-utils.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The app pages that frame the preview. preview-shell-must-start-gate.mjs
 * reasons about exactly these two, for the same reason. */
const PARENT_PATHS = ['/', '/desk'];

const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));

if (!Array.isArray(config.headers) || config.headers.length === 0) {
  console.error('Framed preview headers gate FAILED: vercel.json declares no headers at all.');
  console.error('  Preview is a same-origin iframe; without CORP and COEP on');
  console.error(`  ${PREVIEW_EMBED_PATH} the browser refuses to embed it and Preview hangs.`);
  process.exit(1);
}

const problems = checkFramedDocumentContract(config, {
  framedPath: PREVIEW_EMBED_PATH,
  parentPaths: PARENT_PATHS,
});

if (problems.length) {
  console.error('Framed preview headers gate FAILED — Preview would hang on "Verifying".\n');
  for (const problem of problems) console.error(`  - ${problem}\n`);
  console.error('  Fix the header rule in vercel.json that serves the path named above.');
  console.error('  Nothing in the browser reports this: the iframe onLoad fires on the');
  console.error('  block page, so the user only ever sees Preview never finishing.');
  process.exit(1);
}

console.log(
  `Framed preview headers gate passed — ${PREVIEW_EMBED_PATH} is embeddable by `
  + `${PARENT_PATHS.join(' and ')} (no framing denial, CORP and COEP agree).`,
);
