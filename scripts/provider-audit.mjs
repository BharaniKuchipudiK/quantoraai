#!/usr/bin/env node
/*
 * provider-audit — what your keys can actually reach, and which of it finishes a build.
 *
 * WHY THIS EXISTS
 *
 * Choosing a fallback ladder from memory is how a retired model id ended up in
 * three files and took the Coding Desk down for a week. Model names move, prices
 * move, and what a key can reach is a property of the key, not of anyone's
 * recollection. So this asks the providers instead of asking a model.
 *
 * It answers three questions, in order:
 *   1. what can each key actually reach right now, and at what price
 *   2. which of those models FINISH a real build, in how long
 *   3. therefore, what the three-level ladder should be
 *
 * Listing is free. Running builds costs money, so it only happens when asked.
 *
 * USAGE
 *   Keys are read from .env.local or .env automatically, so the usual path is:
 *     npx vercel env pull .env.local
 *   Exporting GEMINI_API_KEY / OPENROUTER_API_KEY by hand also works.
 *
 *   node scripts/provider-audit.mjs                       list only, free
 *   node scripts/provider-audit.mjs --test                also run one real build per candidate
 *   node scripts/provider-audit.mjs --test --only a,b,c   test exactly these model ids
 *
 *   --grep <text>    filter the OpenRouter listing (default: coding-relevant vendors)
 *   --timeout <s>    per-build wall clock (default 150)
 *   --max <n>        cap how many models --test will run (default 6, to bound spend)
 *
 * EXIT CODES
 *   0  the audit completed
 *   1  no usable key, or every tested model failed
 *   2  bad invocation
 */

import { readFileSync } from 'node:fs';

import { namedButBlocked, splitByGatewayReadiness } from './audit-testability.mjs';

const args = process.argv.slice(2);
const has = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};

const doTest = has('test');
const only = (flag('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const grep = flag('grep', '');
const timeoutMs = Number(flag('timeout', '150')) * 1000;
const maxTests = Number(flag('max', '6'));

/*
 * Read keys from a local env file if they are not already exported.
 *
 * Asking someone to export a secret by hand is a step that fails: the key gets
 * pasted with the masking dots still in it, or the shell eats part of it, or
 * OpenRouter will not show it a second time. `vercel env pull` writes the real
 * values to .env.local, so prefer that and let exporting be the fallback.
 *
 * Nothing here is printed. Only the last four characters of a key are ever
 * shown, so a screenshot of this output cannot leak a credential.
 */
const envFilesSeen = [];
function readEnvFile() {
  const found = {};
  for (const name of ['.env.local', '.env']) {
    let raw;
    try { raw = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'); } catch { continue; }
    envFilesSeen.push(name);
    for (const rawLine of raw.split('\n')) {
      const l = rawLine.trim();
      if (!l || l.startsWith('#')) continue;
      const eq = l.indexOf('=');
      if (eq === -1) continue;
      const k = l.slice(0, eq).trim();
      let v = l.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v && !(k in found)) found[k] = v;
    }
  }
  return found;
}

const fromFile = readEnvFile();

/*
 * Vercel will not export the VALUE of an env var marked Sensitive. `env pull`
 * still writes the name, with a placeholder like "[REDACTED - SENSITIVE]" in
 * place of the secret. Sent to a provider that reads as an invalid key, and the
 * error says "API key not valid" - which points the blame at a key that is
 * actually fine and sitting safely in production.
 */
const REDACTED = /redacted|sensitive|^\[.*\]$|^\*+$|^x{6,}$/i;
const usable = (v) => (v && !REDACTED.test(String(v).trim()) ? v : null);
const redactedNames = ['GEMINI_API_KEY', 'OPENROUTER_API_KEY']
  .filter((n) => fromFile[n] && !usable(fromFile[n]));

const geminiKey = usable(process.env.GEMINI_API_KEY) || usable(fromFile.GEMINI_API_KEY);
const orKey = usable(process.env.OPENROUTER_API_KEY) || usable(fromFile.OPENROUTER_API_KEY);
const tail = (k) => (k ? `…${String(k).slice(-4)}` : 'not found');

/*
 * A missing key is not a reason to stop.
 *
 * The OpenRouter catalogue is PUBLIC - prices, context windows and vision flags
 * are readable with no credential at all, and that listing is the whole point of
 * a first run. Only the Gemini listing and --test need a real key. Refusing to
 * run without one threw away the free answer along with the paid one.
 */
if (!geminiKey && !orKey && doTest) {
  console.error('--test needs a real key, and none was found.\n');
  if (redactedNames.length) {
    console.error(`${envFilesSeen.join(' and ')} contains ${redactedNames.join(' and ')}, but the`);
    console.error('value is a placeholder, not the key. Vercel does not export the value of an');
    console.error('env var marked Sensitive - the lock icon beside it in the dashboard.\n');
    console.error('Two ways round it:');
    console.error('  a) create a fresh key at the provider and export it here for this one run;');
    console.error('  b) or leave production alone and test from production instead, where the');
    console.error('     real key already is.\n');
  } else if (envFilesSeen.length) {
    /*
     * The file exists but has neither key. Saying only "not found" sends someone
     * back to re-run the pull that already worked. `vercel env pull` defaults to
     * the DEVELOPMENT environment, and a key set only for Production is simply
     * absent from it - so name what was actually in the file and how to get the
     * right environment. Names only, never values.
     */
    const names = Object.keys(fromFile).sort();
    console.error(`Read ${envFilesSeen.join(' and ')}, but neither GEMINI_API_KEY nor OPENROUTER_API_KEY is in it.`);
    console.error(`It contains ${names.length} variable(s): ${names.join(', ') || '(none)'}\n`);
    console.error('`vercel env pull` defaults to the DEVELOPMENT environment. If your keys');
    console.error('are set for Production, ask for that one instead:\n');
    console.error('    npx vercel env pull .env.local --environment=production');
    console.error('    node scripts/provider-audit.mjs\n');
  } else {
    console.error('Pull them from Vercel, where they already live:');
    console.error('    npx vercel link');
    console.error('    npx vercel env pull .env.local --environment=production');
    console.error('    node scripts/provider-audit.mjs\n');
  }
  console.error('Or export them by hand:');
  console.error('    export GEMINI_API_KEY=your-google-key');
  console.error('    export OPENROUTER_API_KEY=your-openrouter-key');
  process.exit(2);
}

/** Printed once at the top so a keyless run is never mistaken for a full one. */
function keyNotes() {
  if (redactedNames.length) {
    line(`  ${redactedNames.join(' and ')} in ${envFilesSeen.join('/')} is a PLACEHOLDER, not the key.`);
    line('  Vercel does not export the value of an env var marked Sensitive.');
    line('  The public catalogue below still works; Gemini listing and --test do not.');
  }
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OR_BASE = 'https://openrouter.ai/api/v1';

/*
 * One prompt, used for every model, so the comparison is fair. It is a real
 * build - long enough that a model which truncates will visibly truncate.
 */
const BUILD_PROMPT = 'Build a storage-hygiene dashboard: summary stat cards, a '
  + 'ranked breakdown of where space goes, a findings table with severity, and an '
  + 'activity log. Working filter buttons. Dark theme.';

const SYSTEM = [
  'You write complete, self-contained web pages.',
  'Reply with ONE HTML document and nothing else - no prose, no markdown fences.',
  'Inline all CSS and JavaScript. No external files, no build step, no CDN.',
  'The page must be fully working and must end with </html>.',
].join(' ');

const line = (s = '') => console.log(s);
const rule = (t) => { line(); line(`── ${t} ${'─'.repeat(Math.max(0, 64 - t.length))}`); line(); };

// ─────────────────────────────────────────────────────────── discovery ───

/** What the Google key can actually reach, and which of it can generate. */
async function listGemini() {
  const res = await fetch(`${GEMINI_BASE}/models?key=${geminiKey}&pageSize=200`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  const rows = (await res.json()).models || [];
  return rows
    .map((m) => ({
      id: String(m.name || '').replace(/^models\//, ''),
      display: m.displayName || '',
      // The only field that says whether this model can serve a chat turn at all.
      canGenerate: (m.supportedGenerationMethods || []).includes('generateContent'),
      inputLimit: m.inputTokenLimit,
      outputLimit: m.outputTokenLimit,
    }))
    .filter((m) => m.id.startsWith('gemini'))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Verify the OpenRouter key actually works.
 *
 * /models is a PUBLIC catalogue - it answers with or without a key, so a
 * successful listing proves nothing about the credential. This endpoint needs
 * one, so it is the honest test.
 */
async function checkOpenRouterKey() {
  const res = await fetch(`${OR_BASE}/auth/key`, { headers: { Authorization: `Bearer ${orKey}` } });
  if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
  const d = (await res.json()).data || {};
  return { ok: true, label: d.label, limit: d.limit, usage: d.usage };
}

/** The public OpenRouter catalogue, with real prices. */
async function listOpenRouter() {
  // Send no Authorization at all when there is no usable key: `Bearer null`
  // is a malformed credential and gets rejected, where no header is simply
  // an anonymous read of a public catalogue.
  const res = await fetch(`${OR_BASE}/models`, {
    headers: orKey ? { Authorization: `Bearer ${orKey}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = (await res.json()).data || [];
  return rows.map((m) => ({
    id: m.id,
    name: m.name || m.id,
    // Per-million-token, which is the unit anyone actually compares in.
    inM: Number(m.pricing?.prompt || 0) * 1e6,
    outM: Number(m.pricing?.completion || 0) * 1e6,
    context: Number(m.context_length) || 0,
    vision: Array.isArray(m?.architecture?.input_modalities)
      ? m.architecture.input_modalities.includes('image')
      : false,
    created: Number(m.created) || 0,
  }));
}

// ─────────────────────────────────────────────────────────────── build ───

/** Run the same build on a Gemini model. Returns a comparable result row. */
async function buildGemini(id) {
  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${id}:streamGenerateContent?alt=sse&key=${geminiKey}`,
      {
        method: 'POST',
        signal: abort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: BUILD_PROMPT }] }],
          /*
           * Both limits are set ON PURPOSE. The platform sets neither, so it runs
           * on vendor defaults and cannot tell a truncated build from a finished
           * one. A thinking model with no budget can also spend its whole output
           * allowance reasoning and return an empty page - which looks exactly
           * like "Gemini produced nothing".
           */
          generationConfig: { maxOutputTokens: 32000, temperature: 0.3 },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { id, gateway: 'google', ok: false, why: `HTTP ${res.status} ${body.slice(0, 120)}` };
    }
    let text = '';
    let finish = null;
    let blocked = null;
    for await (const evt of sse(res)) {
      const cand = evt?.candidates?.[0];
      for (const part of cand?.content?.parts || []) if (part.text) text += part.text;
      if (cand?.finishReason) finish = cand.finishReason;
      if (evt?.promptFeedback?.blockReason) blocked = evt.promptFeedback.blockReason;
    }
    return score({ id, gateway: 'google', text, finish: blocked ? `BLOCKED:${blocked}` : finish, started });
  } catch (error) {
    return {
      id, gateway: 'google', ok: false,
      why: abort.signal.aborted ? `no reply within ${timeoutMs / 1000}s` : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The same build on an OpenRouter model, so results are directly comparable. */
async function buildOpenRouter(id) {
  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(`${OR_BASE}/chat/completions`, {
      method: 'POST',
      signal: abort.signal,
      headers: { Authorization: `Bearer ${orKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: id,
        stream: true,
        max_tokens: 32000,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: BUILD_PROMPT },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { id, gateway: 'openrouter', ok: false, why: `HTTP ${res.status} ${body.slice(0, 120)}` };
    }
    let text = '';
    let finish = null;
    for await (const evt of sse(res)) {
      // A provider can accept with 200 and then fail INSIDE the stream.
      if (evt?.error) {
        return {
          id, gateway: 'openrouter', ok: false,
          why: `mid-stream: ${evt.error.message || JSON.stringify(evt.error)}`,
        };
      }
      const choice = evt?.choices?.[0];
      if (choice?.delta?.content) text += choice.delta.content;
      if (choice?.finish_reason) finish = choice.finish_reason;
    }
    return score({ id, gateway: 'openrouter', text, finish, started });
  } catch (error) {
    return {
      id, gateway: 'openrouter', ok: false,
      why: abort.signal.aborted ? `no reply within ${timeoutMs / 1000}s` : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Shared SSE reader. Both providers speak `data: {...}` lines. */
async function* sse(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const l of lines) {
      if (!l.startsWith('data: ')) continue;
      const payload = l.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;
      try { yield JSON.parse(payload); } catch { /* partial frame */ }
    }
  }
}

/** One definition of "finished", applied identically to every model. */
function score({ id, gateway, text, finish, started }) {
  const html = extract(text);
  const complete = /<\/html>\s*$/i.test(html.trim());
  return {
    id,
    gateway,
    ok: complete && html.length > 1500,
    bytes: html.length,
    seconds: ((Date.now() - started) / 1000).toFixed(1),
    finish: finish || 'unknown',
    why: complete ? '' : (String(finish).toUpperCase().includes('MAX_TOKENS') || finish === 'length'
      ? 'cut off by the token limit'
      : 'no complete document'),
  };
}

function extract(raw) {
  const fenced = String(raw).match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : String(raw);
  const start = body.search(/<!doctype html|<html/i);
  return (start > 0 ? body.slice(start) : body).trim();
}

// ──────────────────────────────────────────────────────────────── main ───

async function main() {
  const candidates = [];
  /*
   * Which gateways can actually be CALLED, as opposed to merely listed.
   *
   * These differ, and the difference is a trap. The OpenRouter catalogue is
   * public and is read anonymously on purpose, so a missing key still gets you
   * the listing — but the candidates it yields are unreachable. Set only when a
   * credential has been proven, never inferred from a catalogue that answered.
   */
  const gatewayReady = { google: false, openrouter: false };
  rule('KEYS FOUND');
  line(`  Google       ${geminiKey ? 'yes  ' + tail(geminiKey) : 'no  — Gemini listing needs one'}`);
  line(`  OpenRouter   ${orKey ? 'yes  ' + tail(orKey) : 'no  — catalogue is public, so it still lists'}`);
  keyNotes();

  if (geminiKey) {
    rule('GOOGLE — what your paid key can actually reach');
    try {
      const models = await listGemini();
      gatewayReady.google = true;
      const usable = models.filter((m) => m.canGenerate);
      line(`  ${models.length} Gemini models listed, ${usable.length} can serve a chat turn`);
      line();
      for (const m of usable) {
        line(`  ${m.id.padEnd(38)} out≤${String(m.outputLimit || '?').padStart(7)}  ${m.display}`);
        candidates.push({ id: m.id, gateway: 'google' });
      }
      const dead = models.filter((m) => !m.canGenerate).map((m) => m.id);
      if (dead.length) line(`\n  cannot generate (embedding/other): ${dead.join(', ')}`);
    } catch (error) {
      line(`  FAILED to list: ${error.message}`);
      line('  A 400/403 here means the key or the Generative Language API, not the platform.');
    }
  } else {
    rule('GOOGLE — skipped (GEMINI_API_KEY not set)');
  }

  {
    rule('OPENROUTER — catalogue, cheapest capable first');
    try {
      const auth = orKey ? await checkOpenRouterKey() : { ok: false, why: 'no key present' };
      gatewayReady.openrouter = auth.ok;
      line(auth.ok
        ? `  key OK${auth.label ? ` (${auth.label})` : ''}${auth.usage != null ? ` · $${Number(auth.usage).toFixed(2)} used` : ''}`
        : `  KEY NOT ACCEPTED — ${auth.why}. The listing below is the PUBLIC catalogue and`
          + '\n  proves nothing about your credential; --test would fail.');
      line();
      const models = await listOpenRouter();
      const filter = grep
        ? (m) => `${m.id} ${m.name}`.toLowerCase().includes(grep.toLowerCase())
        // Default view: paid models with real context, which is what a build needs.
        : (m) => m.outM > 0 && m.context >= 100000;
      const rows = models.filter(filter).sort((a, b) => a.outM - b.outM);
      line(`  ${models.length} models on this key; ${rows.length} match${grep ? ` "${grep}"` : ' (paid, ≥100k context)'}`);
      line();
      line(`  ${'$/Mtok out'.padStart(11)}  ${'ctx'.padStart(7)}  vis  id`);
      for (const m of rows.slice(0, 40)) {
        line(`  ${m.outM.toFixed(2).padStart(11)}  ${String(Math.round(m.context / 1000) + 'k').padStart(7)}  ${m.vision ? ' ✓ ' : '   '}  ${m.id}`);
      }
      if (rows.length > 40) line(`  … and ${rows.length - 40} more (use --grep to narrow)`);
      for (const m of rows) candidates.push({ id: m.id, gateway: 'openrouter' });
    } catch (error) {
      line(`  FAILED to list: ${error.message}`);
    }
  }

  if (!doTest) {
    rule('NEXT');
    line('  Listing only. To find out which of these actually FINISH a build:');
    line();
    line('    node scripts/provider-audit.mjs --test --only <id>,<id>,<id>');
    line();
    line('  That spends real money — one build per model — so it is opt-in and');
    line(`  capped at ${maxTests} models per run.`);
    return 0;
  }

  /*
   * A candidate whose gateway has no usable credential must never be TESTED.
   *
   * Listing openrouter anonymously is deliberate, but it means openrouter
   * candidates get collected even when the key is missing or rejected. Testing
   * one then sends `Bearer null`, earns a guaranteed 401, and records it as a
   * MODEL failure. With every candidate failing that way the verdict below
   * reads "nothing produced a complete page ... the problem is upstream of the
   * platform" — a confident, false conclusion of precisely the kind this
   * script was written to stop us from drawing.
   */
  const { reachable, blocked } = splitByGatewayReadiness(candidates, gatewayReady);
  const toTest = (only.length
    ? reachable.filter((c) => only.includes(c.id))
    : reachable
  ).slice(0, maxTests);

  if (!toTest.length) {
    rule('NOTHING TO TEST');
    const unreachable = namedButBlocked(only, blocked);
    if (unreachable.length) {
      // Say which credential is missing. Dropping these silently would leave
      // "no models finished" as the apparent answer, which is the lie.
      line(`  ${unreachable.join(', ')}`);
      line('  — listed, but the gateway that serves them has no usable key here.');
      line('    Testing them would measure the credential and report it as a model');
      line('    failure, so they are excluded rather than run.');
    } else {
      line('  --only matched no model your keys can reach. Run without --test to see the list.');
    }
    return 1;
  }

  if (blocked.length) {
    line(`  skipping ${blocked.length} listed model(s): their gateway has no usable key here.`);
    line();
  }

  rule(`BUILD TEST — the same page, ${toTest.length} models, ${timeoutMs / 1000}s each`);
  const results = [];
  for (const c of toTest) {
    process.stdout.write(`  ${c.id.padEnd(42)} `);
    const r = c.gateway === 'google' ? await buildGemini(c.id) : await buildOpenRouter(c.id);
    results.push(r);
    line(r.ok
      ? `OK    ${String(r.seconds).padStart(6)}s  ${String(r.bytes).padStart(7)} bytes  finish=${r.finish}`
      : `FAIL  ${r.why}`);
  }

  rule('VERDICT — ranked by what finished, fastest first');
  const winners = results.filter((r) => r.ok).sort((a, b) => Number(a.seconds) - Number(b.seconds));
  const losers = results.filter((r) => !r.ok);

  if (!winners.length) {
    line('  Nothing produced a complete page. That is a finding, not a dead end:');
    line('  with the platform entirely out of the way, the problem is upstream of it.');
    losers.forEach((r) => line(`    ${r.id} — ${r.why}`));
    return 1;
  }

  winners.forEach((r, i) => {
    line(`  ${i + 1}. ${r.id.padEnd(40)} ${String(r.seconds).padStart(6)}s  ${String(r.bytes).padStart(7)} bytes  [${r.gateway}]`);
  });
  if (losers.length) {
    line();
    line('  did not finish:');
    losers.forEach((r) => line(`     ${r.id.padEnd(40)} ${r.why}`));
  }

  /*
   * The ladder is built on GATEWAY INDEPENDENCE first, speed second. Three rungs
   * on one provider is one outage away from zero rungs; that is the failure this
   * project keeps living through, and no amount of model quality fixes it.
   */
  rule('SUGGESTED LADDER — independence first, then speed');
  const byGateway = new Map();
  for (const r of winners) if (!byGateway.has(r.gateway)) byGateway.set(r.gateway, r);
  const ladder = [...byGateway.values()];
  for (const r of winners) if (!ladder.includes(r) && ladder.length < 3) ladder.push(r);

  ladder.slice(0, 3).forEach((r, i) => {
    const role = i === 0 ? 'primary' : i === 1 ? 'independent backup' : 'last resort';
    line(`  ${i + 1}. ${r.id}`);
    line(`     ${role} · ${r.gateway} · ${r.seconds}s`);
  });
  if (byGateway.size < 2) {
    line();
    line('  WARNING: every model that finished is on ONE gateway. That is a single');
    line('  point of failure — one provider outage takes the whole ladder down.');
    line('  Getting a second gateway working matters more than any model upgrade.');
  }
  return 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    line(`\n  audit failed before it could finish: ${error.message}`);
    process.exitCode = 1;
  });
