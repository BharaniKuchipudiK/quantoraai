/*
 * Desktop smoke gate — the Electron shell, driven end to end.
 *
 * What only this catches (docs/architecture/desktop-client-v1.md §10):
 *   - the shell not booting, or booting somewhere other than quantora://app
 *   - the bundled web app not rendering under the custom scheme
 *   - /api/* not being proxied to the API origin (or losing the bearer)
 *   - the deep-link sign-in not completing, or completing for the wrong state
 *   - sign-out leaving a session behind
 *
 * The API is the repo's own Express mirror (server.ts) on a local port with a
 * known SESSION_SECRET, so the gate can mint a browser cookie session and
 * play the "user signed in on the website" half itself. Nothing here talks
 * to production.
 *
 * Preconditions (the gate fails loudly, never skips, if they are missing):
 *   npm run build              → dist/index.html
 *   (cd desktop && npm ci && npm run build)  → desktop/dist/main.cjs + the Electron binary
 *
 * Run headless on Linux with:  xvfb-run -a node scripts/desktop-smoke-gate.mjs
 */
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.QUANTORA_SMOKE_PORT || 3177);
const API_ORIGIN = `http://127.0.0.1:${PORT}`;
const SESSION_SECRET = 'desktop-smoke-gate-secret-that-is-long-enough-0000';
const USER = { sub: 'smoke-sub', email: 'smoke@example.com', name: 'Smoke', picture: '' };

const failures = [];
function check(condition, message) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} - ${message}`);
  if (!condition) failures.push(message);
}

function precondition(path, hint) {
  if (!existsSync(path)) {
    console.error(`desktop-smoke-gate: missing ${path}\n  ${hint}`);
    process.exit(2);
  }
}

precondition(join(ROOT, 'dist', 'index.html'), 'run `npm run build` first');
precondition(join(ROOT, 'desktop', 'dist', 'main.cjs'), 'run `npm run build` inside desktop/ first');

const electronBinary = (await import(join(ROOT, 'desktop', 'node_modules', 'electron', 'index.js'))).default;
precondition(electronBinary, 'the Electron binary was not downloaded; run `npm ci` inside desktop/');

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** A cookie session exactly as api/_lib/session.ts mints it. */
function browserSessionToken() {
  const body = base64url(JSON.stringify({ ...USER, exp: Math.floor(Date.now() / 1000) + 600 }));
  return `${body}.${base64url(createHmac('sha256', SESSION_SECRET).update(body).digest())}`;
}

async function startApiServer() {
  // Spawn tsx directly (not through npx) and in its own process group, so
  // killing it at the end takes the server with it instead of leaving a
  // grandchild holding our pipes open and the gate hanging after "passed".
  const child = spawn(join(ROOT, 'node_modules', '.bin', 'tsx'), ['server.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), SESSION_SECRET, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${API_ORIGIN}/api/auth/providers`);
      if (response.ok) return child;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  stopApiServer(child);
  throw new Error(`API mirror never became ready on ${API_ORIGIN}\n${log.slice(-3000)}`);
}

function stopApiServer(child) {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

const userData = mkdtempSync(join(tmpdir(), 'quantora-desktop-smoke-'));
const api = await startApiServer();
let app = null;

try {
  app = await electron.launch({
    executablePath: electronBinary,
    args: [join(ROOT, 'desktop', 'dist', 'main.cjs'), '--no-sandbox'],
    env: {
      ...process.env,
      QUANTORA_API_ORIGIN: API_ORIGIN,
      QUANTORA_DESKTOP_SMOKE: '1',
      QUANTORA_DESKTOP_BLOCK_EXTERNAL: '1',
      QUANTORA_USER_DATA_DIR: userData,
      QUANTORA_WEB_DIST: join(ROOT, 'dist'),
      // The API mirror is on loopback; never let an environment proxy swallow it.
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
    },
    timeout: 60_000,
  });
  app.process().stderr?.on('data', (chunk) => process.stderr.write(`[electron] ${chunk}`));

  const window = await app.firstWindow({ timeout: 60_000 });
  await window.waitForLoadState('domcontentloaded');

  // 1. the shell serves the app on its own origin. The app shell carries
  // this hook on every route once React has mounted.
  await window.waitForSelector('.app-shell[data-quantora-isolated-desk]', { timeout: 30_000 });
  check(true, 'web app mounted from the bundled dist');
  check(window.url().startsWith('quantora://app/'), `window is on quantora://app (got ${window.url()})`);

  const policy = await window.evaluate(async () => {
    const response = await fetch('/');
    return {
      csp: response.headers.get('content-security-policy') || '',
      coop: response.headers.get('cross-origin-opener-policy') || '',
      coep: response.headers.get('cross-origin-embedder-policy') || '',
    };
  });
  check(policy.csp.includes("default-src 'self'"), 'renderer is served the vercel.json CSP');
  check(policy.coop && policy.coep, 'renderer is served COOP and COEP');

  // 2. relative /api calls reach the API origin through the host
  const providersResponse = await window.evaluate(async () => {
    const response = await fetch('/api/auth/providers');
    return { status: response.status, type: response.headers.get('content-type') || '', text: await response.text() };
  });
  let providers = null;
  try { providers = JSON.parse(providersResponse.text); } catch { /* reported below */ }
  check(
    providersResponse.status === 200 && providers && 'email' in providers,
    `/api/auth/providers proxied to the API mirror (status ${providersResponse.status}, ${providersResponse.type || 'no content-type'})`,
  );
  const anonymous = await window.evaluate(() => fetch('/api/auth/session').then((r) => r.json()));
  check(anonymous.user === null, 'no session before sign-in');

  // 3. the bridge is exposed with the contracted shape
  const bridge = await window.evaluate(() => ({
    present: Boolean(window.quantoraDesktop),
    version: window.quantoraDesktop?.version,
    hasSignIn: typeof window.quantoraDesktop?.auth?.signIn === 'function',
  }));
  check(bridge.present && bridge.version === 1 && bridge.hasSignIn, 'window.quantoraDesktop bridge present (v1)');
  const host = await window.evaluate(() => window.quantoraDesktop.host());
  check(host.apiOrigin === API_ORIGIN, `host reports the configured API origin (${host.apiOrigin})`);

  // 4. sign-in: the host hands us the grant URL (smoke mode), we play the browser
  const { grantUrl } = await window.evaluate(() => window.quantoraDesktop.auth.signIn());
  check(typeof grantUrl === 'string' && grantUrl.startsWith(`${API_ORIGIN}/api/auth/desktop/grant?`), 'signIn() produced the grant URL');

  const grant = await fetch(grantUrl, { headers: { cookie: `quantora_session=${browserSessionToken()}` } });
  const html = await grant.text();
  const match = /href="(quantora:\/\/auth\/callback\?[^"]+)"/.exec(html);
  check(grant.status === 200 && Boolean(match), 'website grant returned the deep link for a signed-in browser');
  const deepLink = match ? match[1].replace(/&amp;/g, '&') : '';

  const emitDeepLink = (url) => app.evaluate(({ app: electronApp }, link) => {
    electronApp.emit('open-url', { preventDefault() {} }, link);
  }, url);

  // 4a. a deep link for someone else's attempt must not sign us in
  const forged = deepLink.replace(/state=[^&]+/, 'state=not-our-attempt-0000');
  await emitDeepLink(forged);
  await new Promise((r) => setTimeout(r, 1500));
  const afterForged = await app.evaluate(() => null).then(() => window.evaluate(() => window.quantoraDesktop.auth.status()));
  check(afterForged.signedIn === false, 'a deep link with a foreign state is rejected');

  // 4b. the real one completes the exchange and the app resumes signed in
  await emitDeepLink(deepLink);
  await window.waitForURL((url) => url.href.includes('auth=success') || url.href === 'quantora://app/', { timeout: 30_000 }).catch(() => {});
  await window.waitForLoadState('domcontentloaded');
  let session = null;
  for (let attempt = 0; attempt < 20 && !session?.user; attempt += 1) {
    session = await window.evaluate(() => fetch('/api/auth/session').then((r) => r.json())).catch(() => null);
    if (!session?.user) await new Promise((r) => setTimeout(r, 500));
  }
  check(session?.user?.email === USER.email, `bearer session restored through the proxy (${session?.user?.email || 'none'})`);
  const status = await window.evaluate(() => window.quantoraDesktop.auth.status());
  check(status.signedIn === true && status.user?.email === USER.email, 'bridge reports signed in');

  // 5. sign-out drops the token everywhere
  await window.evaluate(() => window.quantoraDesktop.auth.signOut());
  const after = await window.evaluate(() => fetch('/api/auth/session').then((r) => r.json()));
  check(after.user === null, 'sign-out leaves no session behind');
} catch (error) {
  failures.push(`gate threw: ${error?.stack || error}`);
  console.error(error);
} finally {
  if (app) await app.close().catch(() => {});
  stopApiServer(api);
  rmSync(userData, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\ndesktop-smoke-gate FAILED — ${failures.length} check(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\ndesktop-smoke-gate passed.');
process.exit(0);
