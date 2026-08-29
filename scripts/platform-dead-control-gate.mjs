#!/usr/bin/env node
/**
 * Quantora's own surface gets the same check its builds get.
 *
 * WHY THIS EXISTS
 *
 * The Header shipped a "Connect Stripe Account" button that POSTed to
 * /api/stripe-onboard. No such endpoint has ever existed. Clicking it returned
 * a 404, the JSON parse failed, and the user was shown
 * "Failed to connect Stripe: Unknown error".
 *
 * A dead control is the first thing Build Truth looks for in a page the AI
 * writes. Every gate in this repository inspects generated output; not one
 * looked at the product doing the inspecting, so a button wired to nothing sat
 * in the platform's own chrome. A standard the platform enforces on others and
 * not on itself is not a standard.
 *
 * WHAT THIS CHECKS
 *
 * Every /api/... path referenced from src/ resolves to something that can serve
 * it: a function file under api/, or a vercel.json rewrite. It does not prove
 * the endpoint answers correctly — only that a request reaches code at all.
 * That is the difference between a dead control and a working one.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_REFERENCE = /['"`](\/api\/[a-zA-Z0-9_/-]+)/g;

function sourceFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) found.push(full);
  }
  return found;
}

const rewrites = new Set(
  (JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8')).rewrites || [])
    .map((rule) => rule.source),
);

/** A path is served when a function file backs it, or a rewrite claims it. */
function isServed(apiPath) {
  if (rewrites.has(apiPath)) return true;
  const base = apiPath.replace(/^\/api\//, '');
  return ['ts', 'js', 'tsx', 'jsx'].some((extension) =>
    fs.existsSync(path.join(repoRoot, 'api', `${base}.${extension}`)));
}

const dead = new Map();
for (const file of sourceFiles(path.join(repoRoot, 'src'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(API_REFERENCE)) {
    const apiPath = match[1];
    if (isServed(apiPath)) continue;
    if (!dead.has(apiPath)) dead.set(apiPath, new Set());
    dead.get(apiPath).add(path.relative(repoRoot, file));
  }
}

if (dead.size) {
  console.error(`\nPlatform dead control gate FAILED — ${dead.size} control(s) call an endpoint that does not exist:\n`);
  for (const [apiPath, files] of dead) {
    console.error(`  ${apiPath}`);
    for (const file of files) console.error(`    called from ${file}`);
  }
  console.error(`
This is the defect Build Truth catches in every page the platform builds: a
control that looks live and reaches nothing. Add the endpoint, point the call
at the one that serves it, or remove the control. Shipping it is the one option
the platform does not allow its own builds.
`);
  process.exit(1);
}

console.log('Platform dead control gate passed — every /api/ path referenced from src/ is served.');
