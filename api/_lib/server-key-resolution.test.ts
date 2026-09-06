import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * A server key resolves ONE way on this platform: the environment first, then
 * the Supabase gateway (api/_lib/credential-broker.ts). /api/chat has resolved
 * Gemini that way since the gateway existed; /api/generate-office read
 * process.env alone. On a deployment holding its Gemini key in the gateway —
 * every pull-request preview does; inference-health reports geminiVia
 * "supabase-api-gateway" there — chat ran on Gemini while the Office generator
 * had no Gemini at all, and the deployed golden's office-document transaction
 * failed as "Gatekeeper failed to produce a valid word specification after 1
 * attempts" (2026-09-06). Nothing in the tests could see it: each endpoint's
 * tests set GEMINI_API_KEY in the environment, where every endpoint agrees.
 *
 * This gate reads the contradiction from the sources: a file under api/ that
 * reads process.env.GEMINI_API_KEY and never consults the gateway resolves the
 * key differently from chat, and will be the endpoint that dies on the next
 * gateway-only deployment. Two remedies, both in the file it names: resolve
 * through fetchApiGatewayKey / fetchGatewayCredential /
 * resolveCapabilityCredential after the environment, or stop reading the key.
 */
const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_READ = /process\.env\.GEMINI_API_KEY\b/;
const GATEWAY_READ = /\b(?:fetchApiGatewayKey|fetchGatewayCredential|resolveCapabilityCredential)\(/;
// Exempt for a stated reason, never silently.
const EXEMPT: Record<string, string> = {
  '_lib/model-catalog.js': "the admin catalog's 'available on the internet' list: an operator report, never a user's turn",
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(?:ts|js|mjs)$/.test(entry.name) && !/\.test\.(?:ts|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('every API file that reads GEMINI_API_KEY also consults the gateway, as /api/chat does', () => {
  const readers: string[] = [];
  const offenders: string[] = [];
  for (const file of sourceFiles(API_DIR)) {
    const rel = path.relative(API_DIR, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    if (!ENV_READ.test(source)) continue;
    readers.push(rel);
    if (rel in EXEMPT) continue;
    if (!GATEWAY_READ.test(source)) offenders.push(rel);
  }
  // A gate that scanned the wrong tree would pass over zero readers (§4).
  assert.ok(
    readers.includes('_lib/chat-handler.ts'),
    `the scan found no GEMINI_API_KEY read in the chat handler, so it is not looking at api/: readers=${readers.join(', ') || 'none'}`,
  );
  assert.deepEqual(
    offenders,
    [],
    `${offenders.length} API file(s) read GEMINI_API_KEY from the environment and never consult the gateway, so they resolve the key differently from /api/chat and die on a deployment whose key lives in the gateway:\n  ${offenders.join('\n  ')}\nResolve through fetchApiGatewayKey / fetchGatewayCredential after the environment (api/generate-office.ts resolveOfficeServerKeys is the pattern), or stop reading the key.`,
  );
  for (const [file, reason] of Object.entries(EXEMPT)) {
    assert.ok(readers.includes(file), `${file} is exempt (${reason}) but no longer reads GEMINI_API_KEY — drop the exemption`);
  }
});
