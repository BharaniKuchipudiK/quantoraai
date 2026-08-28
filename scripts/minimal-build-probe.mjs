#!/usr/bin/env node
/*
 * minimal-build-probe — the whole product, with nothing in the way.
 *
 * WHY THIS EXISTS
 *
 * The Coding Desk is ~7,600 lines across three files, sitting on ~57,000 lines
 * of platform. When a build fails there, the failure could be the model, the
 * key, the router, the fallback ladder, the turn planner, the budget
 * arithmetic, the preview shell, or the browser. Every diagnosis so far has
 * been a guess dressed as a conclusion, because nothing isolated the variable.
 *
 * This file isolates it. Prompt in, one HTTP call, HTML out. No router, no
 * fallback chain, no turn planner, no escalation heuristic, no cognitive
 * ledger, no budget ladder. If a page comes out of THIS, the model and the key
 * are fine and the platform is what is breaking builds. If a page does not
 * come out of this, the problem is upstream of everything we have been fixing
 * and no amount of platform work would have helped.
 *
 * It is deliberately dependency-free and deliberately short enough to read in
 * full before running it.
 *
 * USAGE
 *   export OPENROUTER_API_KEY=sk-or-v1-…
 *   node scripts/minimal-build-probe.mjs "build me a task tracker with add, complete and delete"
 *
 *   --model <id>    skip discovery and pin an exact model id
 *   --timeout <s>   wall clock for the generation call (default 150)
 *   --out <path>    where to write the HTML (default ./probe-output.html)
 *
 * EXIT CODES — safe to script against
 *   0  a complete document was produced
 *   1  any failure: no reply, provider rejection, dead stream, truncated or
 *      incomplete output
 *   2  bad invocation (no key, no prompt)
 */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};

const pinnedModel = flag('model', null);
const timeoutMs = Number(flag('timeout', '150')) * 1000;
const outPath = flag('out', 'probe-output.html');
const prompt = args.join(' ').trim();

const key = process.env.OPENROUTER_API_KEY;

if (!key) {
  console.error('OPENROUTER_API_KEY is not set. Export it and run again.');
  process.exit(2);
}
if (!prompt) {
  console.error('Give it something to build:\n  node scripts/minimal-build-probe.mjs "build me a task tracker"');
  process.exit(2);
}

const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const log = (...parts) => console.log(`[${elapsed().padStart(6)}]`, ...parts);

/*
 * Pick the model from the live catalogue rather than naming one. A hardcoded id
 * is what took Claude offline for a week: the provider retires it, the request
 * 404s, and the failure looks like bad output instead of a bad id.
 */
async function newestFlagship() {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`catalogue read failed: HTTP ${response.status}`);
  const rows = (await response.json()).data || [];
  const candidates = rows
    .filter((m) => /^anthropic\//i.test(m.id))
    .filter((m) => /sonnet|opus/i.test(m.id))
    .filter((m) => !/batch/i.test(m.id))
    .sort((a, b) => (b.created || 0) - (a.created || 0));
  if (!candidates.length) throw new Error('no Anthropic flagship listed on this key');
  return candidates[0].id;
}

const SYSTEM = [
  'You write complete, self-contained web pages.',
  'Reply with ONE HTML document and nothing else — no prose, no markdown fences.',
  'Inline all CSS and JavaScript. No external files, no build step, no CDN.',
  'The page must be fully working and must end with </html>.',
].join(' ');

async function main() {
  const model = pinnedModel || await newestFlagship();
  log(`model:   ${model}${pinnedModel ? ' (pinned)' : ' (newest listed)'}`);
  log(`prompt:  ${prompt.length} chars`);
  log(`budget:  ${timeoutMs / 1000}s`);
  log('calling provider…');

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: abort.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: 16000,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch (error) {
    clearTimeout(timer);
    log(`VERDICT: NO REPLY — ${abort.signal.aborted ? `aborted at the ${timeoutMs / 1000}s budget` : error.message}`);
    process.exit(1);
  }

  if (!response.ok) {
    clearTimeout(timer);
    const detail = await response.text().catch(() => '');
    log(`VERDICT: PROVIDER REJECTED THE REQUEST — HTTP ${response.status}`);
    console.log(detail.slice(0, 600));
    // 401/402/403 mean the key, not the platform. Say which.
    if ([401, 402, 403].includes(response.status)) {
      log('That is a credential or billing response. The key is the problem, not the code.');
    }
    process.exit(1);
  }

  /*
   * Read the stream by hand so we can see it is alive. A dead spinner and a
   * slow model look identical from the outside; the whole point of this probe
   * is to tell them apart.
   */
  let text = '';
  let finishReason = null;
  let chunks = 0;
  let lastTick = 0;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        let event;
        try { event = JSON.parse(payload); } catch { continue; }
        const choice = event.choices?.[0];
        const piece = choice?.delta?.content;
        if (piece) {
          text += piece;
          chunks += 1;
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      }
      // Heartbeat once a second so a long generation is visibly alive.
      if (Date.now() - lastTick > 1000) {
        lastTick = Date.now();
        process.stdout.write(`\r[${elapsed().padStart(6)}] streaming… ${text.length} chars`);
      }
    }
  } catch (error) {
    process.stdout.write('\n');
    clearTimeout(timer);
    log(`VERDICT: STREAM DIED after ${text.length} chars — ${abort.signal.aborted ? `hit the ${timeoutMs / 1000}s budget` : error.message}`);
    if (text) await writeOut(text);
    process.exit(1);
  }
  clearTimeout(timer);
  process.stdout.write('\n');

  const html = extractDocument(text);
  await writeOut(html);

  /*
   * The verdict. `finish_reason` is the fact the platform never surfaced: it
   * says definitively whether the model completed or was cut off, which is the
   * difference between "the model cannot do this" and "we did not give it time".
   */
  const complete = /<\/html>\s*$/i.test(html.trim());
  log('—'.repeat(60));
  log(`finish_reason: ${finishReason || 'unknown'}   (stop = model finished, length = ran out of tokens)`);
  log(`bytes:         ${html.length}`);
  log(`stream chunks: ${chunks}`);
  log(`closes </html>: ${complete ? 'yes' : 'NO — truncated'}`);
  log(`written to:    ${outPath}`);
  log('—'.repeat(60));

  /*
   * The exit code is part of the verdict, not decoration.
   *
   * These two branches used to print a failure and then let main() resolve, so
   * node exited 0 - a probe that announced INCOMPLETE while telling the shell it
   * had succeeded. Anything scripting this (a CI gate, a bisect loop, a retry)
   * would have read the exact failure it was built to catch as a pass. That is
   * the same defect this file exists to expose, so it does not get to have it.
   *
   * `process.exitCode` rather than `process.exit()`: it lets the runtime flush
   * stdout and finish the write above before the process ends.
   */
  if (complete && html.length > 500) {
    log('VERDICT: THE MODEL AND THE KEY WORK. Open the file in a browser.');
    log('If that page is good, nothing about the model was ever the problem.');
    process.exitCode = 0;
  } else if (finishReason === 'length') {
    log('VERDICT: CUT OFF BY TOKEN LIMIT, not by time. Raise max_tokens and rerun.');
    process.exitCode = 1;
  } else {
    log('VERDICT: INCOMPLETE OUTPUT even with everything else removed.');
    log('That points at the prompt or the model, not at the platform.');
    process.exitCode = 1;
  }
}

/** Strip markdown fencing or leading prose if the model added any. */
function extractDocument(raw) {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.search(/<!doctype html|<html/i);
  return (start > 0 ? body.slice(start) : body).trim();
}

async function writeOut(html) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(outPath, html, 'utf8');
}

main().catch((error) => {
  log(`VERDICT: FAILED BEFORE THE MODEL WAS REACHED — ${error.message}`);
  process.exit(1);
});
