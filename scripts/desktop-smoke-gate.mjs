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
import { DESKTOP_BRIDGE_VERSION } from '../shared/desktop-bridge-contract.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.QUANTORA_SMOKE_PORT || 3177);
const API_ORIGIN = `http://127.0.0.1:${PORT}`;
const SESSION_SECRET = 'desktop-smoke-gate-secret-that-is-long-enough-0000';
const USER = { sub: 'smoke-sub', email: 'smoke@example.com', name: 'Smoke', picture: '' };

const failures = [];
const diagnostics = [];
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
const workspace = mkdtempSync(join(tmpdir(), 'quantora-desktop-workspace-'));
const api = await startApiServer();
let app = null;

try {
  app = await electron.launch({
    executablePath: electronBinary,
    // --no-sandbox: GitHub runners restrict user namespaces. --disable-dev-shm-usage:
    // a small /dev/shm silently kills the renderer on some CI images.
    args: [join(ROOT, 'desktop', 'dist', 'main.cjs'), '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    env: {
      ...process.env,
      QUANTORA_API_ORIGIN: API_ORIGIN,
      QUANTORA_DESKTOP_SMOKE: '1',
      QUANTORA_DESKTOP_BLOCK_EXTERNAL: '1',
      QUANTORA_USER_DATA_DIR: userData,
      QUANTORA_SMOKE_WORKSPACE: workspace,
      QUANTORA_WEB_DIST: join(ROOT, 'dist'),
      // The API mirror is on loopback; never let an environment proxy swallow it.
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
    },
    timeout: 60_000,
  });
  app.process().stderr?.on('data', (chunk) => process.stderr.write(`[electron] ${chunk}`));
  app.process().stdout?.on('data', (chunk) => process.stdout.write(`[electron] ${chunk}`));

  const window = await app.firstWindow({ timeout: 60_000 });
  // Everything the renderer says is kept and printed on failure, so a red
  // run names its cause instead of a selector (CLAUDE.md §8).
  window.on('console', (m) => diagnostics.push(`console.${m.type()}: ${m.text().slice(0, 300)}`));
  window.on('pageerror', (e) => diagnostics.push(`pageerror: ${e.message}`));
  window.on('requestfailed', (r) => diagnostics.push(`requestfailed: ${r.url().slice(0, 140)} ${r.failure()?.errorText || ''}`));
  window.on('crash', () => diagnostics.push('renderer crashed'));
  await window.waitForLoadState('domcontentloaded');

  // 1. the shell serves the app on its own origin. The app shell carries
  // this hook on every route once React has mounted.
  try {
    await window.waitForSelector('.app-shell[data-quantora-isolated-desk]', { timeout: 60_000 });
    check(true, 'web app mounted from the bundled dist');
  } catch (error) {
    const dom = await window.evaluate(() => document.documentElement.outerHTML.slice(0, 2000)).catch((e) => `evaluate failed: ${e.message}`);
    diagnostics.push(`DOM at timeout:\n${dom}`);
    throw error;
  }
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
  check(bridge.present && bridge.version === DESKTOP_BRIDGE_VERSION && bridge.hasSignIn, `window.quantoraDesktop bridge present (v${DESKTOP_BRIDGE_VERSION})`);
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

  // 4c. the persistent host reports its capabilities honestly and polls without inventing news
  const hostAfter = await window.evaluate(() => window.quantoraDesktop.host());
  check(
    typeof hostAfter.capabilities.notifications === 'boolean' && typeof hostAfter.capabilities.background === 'boolean',
    `host reports notification/background support as booleans (notifications=${hostAfter.capabilities.notifications}, background=${hostAfter.capabilities.background})`,
  );
  const poll = await app.evaluate(() => globalThis.__quantoraSmoke.pollWatches());
  check(
    poll.ok === false && poll.reason === 'unavailable' && poll.status === 503 && poll.notified === 0,
    `watch poll reports the mirror's 503 honestly and raises nothing (${JSON.stringify(poll)})`,
  );

  // 5. sign-out drops the token everywhere
  await window.evaluate(() => window.quantoraDesktop.auth.signOut());
  const after = await window.evaluate(() => fetch('/api/auth/session').then((r) => r.json()));
  check(after.user === null, 'sign-out leaves no session behind');
  const pollSignedOut = await app.evaluate(() => globalThis.__quantoraSmoke.pollWatches());
  check(pollSignedOut.reason === 'signed-out', 'the watch loop does nothing once signed out');

  // 6. the local runtime: a real folder, a real shell, real git (design §6.2)
  const beforeAttach = await window.evaluate(() => window.quantoraDesktop.runtime.info());
  check(beforeAttach.attached === false && beforeAttach.capabilities.shell === false, 'no shell before a folder is attached');
  const refusedRun = await window.evaluate(() => window.quantoraDesktop.runtime.run('echo never'));
  check(refusedRun.ok === false && /No folder/.test(refusedRun.output), 'a command without a folder is refused, not faked');

  const attached = await window.evaluate(() => window.quantoraDesktop.runtime.attach());
  check(attached.attached === true && typeof attached.root === 'string', `folder attached (${attached.root})`);
  const afterAttach = await window.evaluate(() => window.quantoraDesktop.runtime.info());
  check(afterAttach.capabilities.shell === true && afterAttach.capabilities.git === true, 'shell and git capabilities follow the attach');

  const synced = await window.evaluate(() => window.quantoraDesktop.runtime.sync([
    { path: 'index.html', content: '<!DOCTYPE html><h1>desk</h1>' },
    { path: 'src/app.js', content: 'console.log("desk")' },
  ]));
  check(synced.ok === true && synced.written === 2, 'desk files written into the folder');
  const escaped = await window.evaluate(() => window.quantoraDesktop.runtime.sync([{ path: '../escape.txt', content: 'x' }]));
  check(escaped.ok === false && /Refused/.test(escaped.error || ''), 'a path outside the folder is refused');
  check(!existsSync(join(workspace, '..', 'escape.txt')), 'nothing was written outside the folder');

  const nonce = `quantora-${randomBytes(4).toString('hex')}`;
  const echoed = await window.evaluate((n) => window.quantoraDesktop.runtime.run(`echo ${n}`), nonce);
  check(echoed.ok === true && echoed.output === nonce, `real shell echoed exactly ${nonce}`);
  const listed = await window.evaluate(() => window.quantoraDesktop.runtime.run('cat src/app.js'));
  check(listed.ok === true && listed.output === 'console.log("desk")', 'the shell reads the synced file from disk');
  const failed = await window.evaluate(() => window.quantoraDesktop.runtime.run('exit 7'));
  check(failed.ok === false && failed.exitCode === 7, 'a failing command reports its real exit code');

  const gitInit = await window.evaluate(() => window.quantoraDesktop.runtime.git({ action: 'init' }));
  check(gitInit.ok === true, `git init in the folder (${gitInit.output.split('\n')[0]})`);
  const gitCommit = await window.evaluate(() => window.quantoraDesktop.runtime.git({ action: 'commit', message: 'desk: first' }));
  check(gitCommit.ok === true && /desk: first/.test(gitCommit.output), 'git commit records the desk files');
  const gitPush = await window.evaluate(() => window.quantoraDesktop.runtime.git({ action: 'push' }));
  check(gitPush.ok === false, 'desk git never pushes');
  check(existsSync(join(workspace, '.git', 'HEAD')), 'the repository really exists on disk');
} catch (error) {
  failures.push(`gate threw: ${error?.stack || error}`);
  console.error(error);
} finally {
  if (app) await app.close().catch(() => {});
  stopApiServer(api);
  rmSync(userData, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\ndesktop-smoke-gate FAILED — ${failures.length} check(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  if (diagnostics.length) {
    console.error(`\nRenderer diagnostics (${diagnostics.length}):`);
    for (const line of diagnostics.slice(-80)) console.error(`  ${line}`);
  }
  process.exit(1);
}
console.log('\ndesktop-smoke-gate passed.');
process.exit(0);
