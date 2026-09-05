/*
 * Desktop smoke gate — Quantora Desktop, driven end to end.
 *
 * What only this catches (docs/architecture/desktop-client-v1.md §10):
 *   - the shell not booting, or booting somewhere other than quantora://app
 *   - the desktop renderer not mounting, or mounting the wrong screen
 *   - /api/* not being proxied to the API origin (or losing the bearer)
 *   - the deep-link sign-in not completing, or completing for the wrong state
 *   - the launcher not opening a folder, the explorer not showing its files
 *   - the editor not reading/writing the real file, the terminal or git not
 *     running in the folder, the chat not reporting an API failure honestly
 *   - sign-out leaving a session behind
 *
 * The API is the repo's own Express mirror (server.ts) on a local port with a
 * known SESSION_SECRET, so the gate can mint a browser cookie session and
 * play the "user signed in on the website" half itself. Nothing here talks
 * to production.
 *
 * Preconditions (the gate fails loudly, never skips, if they are missing):
 *   (cd desktop && npm ci && npm run build) → desktop/dist/main.cjs, dist/renderer, Electron
 *
 * Run headless on Linux with:  xvfb-run -a node scripts/desktop-smoke-gate.mjs
 */
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

precondition(join(ROOT, 'desktop', 'dist', 'main.cjs'), 'run `npm run build` inside desktop/ first');
precondition(join(ROOT, 'desktop', 'dist', 'renderer', 'index.html'), 'run `npm run build` inside desktop/ first');

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
writeFileSync(join(workspace, 'index.html'), '<!DOCTYPE html><h1>desk</h1>\n');
const api = await startApiServer();
let app = null;

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read `path` until it contains `needle` or `timeoutMs` passes; returns the last text read. */
async function waitForFileToContain(path, needle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let text = '';
    try { text = readFileSync(path, 'utf8'); } catch { text = ''; }
    if (text.includes(needle) || Date.now() >= deadline) return text;
    await settle(100);
  }
}

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

  const screen = async () => window.evaluate(() => document.querySelector('[data-qd-screen]')?.getAttribute('data-qd-screen') || '');
  /*
   * WHY THIS REPORTS SO MUCH ON FAILURE
   *
   * This gate went red on two pull requests that could not have caused it
   * (#509, #520), and both times it printed a 60-second timeout for
   * [data-qd-signin] next to a DOM dump CONTAINING that button, rendered and
   * enabled. Those two facts contradict each other, so the only available
   * reading was "flaky" — and a gate read that way is one the next person mutes
   * under pressure. Muting one cost this repo three production endpoints on
   * 2026-08-31.
   *
   * The dump was not wrong, it was answering the wrong question. `waitForSelector`
   * defaults to state 'visible', and so does click(): an element can be present
   * and still unwaitable if the window has no size, the document never painted,
   * or an ancestor is hidden. None of that is visible in markup.
   *
   * So a failure now reports the state that decides visibility, before the
   * markup. The file already claimed this standard for itself — "a red run
   * names its cause instead of a selector (CLAUDE.md §8)" — and did not meet it.
   *
   * That reporting paid for itself on the third occurrence (2026-09-05, run
   * 33956885420, a docs-only PR; main's own run 33955304819 failed the same
   * way minutes earlier). With the wait already at state 'attached', it still
   * timed out — and in the SAME run the report above said targetAttached:
   * true, targetRect 1280x893, display flex, visibility visible, readyState
   * complete. Then click('[data-qd-signin]') timed out on a button the DOM
   * dump contained. Every failing call was a selector-engine operation; every
   * passing call was an evaluate. That is not a visibility problem and it is
   * not a missing element: Playwright's selector engine runs in its own
   * isolated "utility" world, and in these runs that world never bound to the
   * frame, while the page's main world — where evaluate runs — was fine.
   *
   * So every wait, click and keystroke below uses the main world and CDP
   * input, never the selector engine: waitForFunction runs in the main world,
   * and page.mouse / page.keyboard dispatch real input events. The gate keeps
   * what it asserted before — the element exists, has a box, is the thing at
   * its own centre, and receives a real click — and drops only the dependency
   * that failed. WHY the utility world fails to bind is not established here;
   * this removes the dependency, not the cause, and says so.
   */
  const failureState = async (selector) => {
    const state = await window.evaluate((sel) => {
      const target = document.querySelector(sel);
      const rect = target?.getBoundingClientRect?.();
      const styles = target ? getComputedStyle(target) : null;
      return {
        windowSize: `${window.innerWidth}x${window.innerHeight}`,
        outerSize: `${window.outerWidth}x${window.outerHeight}`,
        readyState: document.readyState,
        visibilityState: document.visibilityState,
        screenShowing: document.querySelector('[data-qd-screen]')?.getAttribute('data-qd-screen') ?? '(no screen element)',
        targetAttached: Boolean(target),
        targetRect: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)} at ${Math.round(rect.x)},${Math.round(rect.y)}` : '(not attached)',
        targetDisplay: styles?.display ?? '(n/a)',
        targetVisibility: styles?.visibility ?? '(n/a)',
      };
    }, selector).catch((e) => ({ evaluateFailed: e.message }));

    /*
     * The line that would have ended both investigations in one read. An
     * element that is attached but has no box, in a window with no size, is
     * never going to satisfy a 'visible' wait however long the timeout is.
     */
    const verdict = state.evaluateFailed
      ? `the renderer could not be evaluated at all: ${state.evaluateFailed}`
      : state.windowSize === '0x0'
        ? 'the Electron window reported 0x0, so NOTHING is visible to Playwright however long it waits — this is not a missing element'
        : !state.targetAttached
          ? 'the element is genuinely not in the DOM'
          : 'the element IS attached — compare its box and computed styles below against what a "visible" wait requires';

    return [
      `WHY: ${verdict}`,
      ...Object.entries(state).map(([key, value]) => `  ${key}: ${value}`),
    ].join('\n');
  };

  // ---- main-world primitives (see the header above for why) ---------------
  const present = (selector) => window.evaluate((sel) => Boolean(document.querySelector(sel)), selector);
  const waitFor = async (selector, timeout = 60_000) => {
    try {
      await window.waitForFunction((sel) => Boolean(document.querySelector(sel)), selector, { timeout, polling: 100 });
      return true;
    } catch {
      return false;
    }
  };
  /*
   * A real click at the element's centre, after the page itself confirms the
   * element is there, has a box, and is what sits at that point. A covered or
   * missing target is a named failure, never a silent no-op.
   */
  const click = async (selector) => {
    const target = await window.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { why: 'is not in the DOM' };
      el.scrollIntoView?.({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return { why: `has no box (${Math.round(r.width)}x${Math.round(r.height)})` };
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === el || el.contains(hit))) {
        return { why: `is covered at its centre by <${hit?.tagName?.toLowerCase() || 'nothing'}>` };
      }
      if (el.disabled) return { why: 'is disabled' };
      return { x, y };
    }, selector);
    if (target.why) throw new Error(`click ${selector}: the element ${target.why}`);
    await window.mouse.click(target.x, target.y);
  };
  const type = async (selector, text) => {
    await click(selector);
    await window.keyboard.type(text);
  };

  const waitScreen = async (name, timeout = 60_000) => {
    const selector = `[data-qd-screen="${name}"]`;
    try {
      /*
       * `attached`, not the default `visible`: this check asserts that the
       * renderer MOUNTED, which is what attached means. Whether it is painted
       * at a non-zero size is a different claim, and the checks that need it
       * (the clicks below) assert it themselves.
       */
      if (!(await waitFor(selector, timeout))) throw new Error('timeout');
      return true;
    } catch {
      diagnostics.push(`Waiting for screen ${name} failed.\n${await failureState(selector)}`);
      const dom = await window.evaluate(() => document.documentElement.outerHTML.slice(0, 1200)).catch((e) => `evaluate failed: ${e.message}`);
      diagnostics.push(`DOM at that moment (truncated):\n${dom}`);
      return false;
    }
  };

  // 1. the shell boots on its own origin and shows the sign-in screen
  check(await waitScreen('signin'), 'renderer mounted on the sign-in screen (signed out)');
  // Ask the renderer where it thinks it is, rather than reading Playwright's
  // window.url(). That property is a cached mirror of the last main-frame
  // navigation Playwright observed, and for a custom scheme it can still be
  // empty at this point: CI run 1992 printed "got " here with the sign-in
  // screen already rendered and all 30 other checks green. location.href is
  // the page's own truth and is populated by the time the DOM exists, so the
  // check is deterministic — and it still fails if the shell ever boots on a
  // remote origin, which is the whole point of asking.
  const origin = await window.evaluate(() => location.href);
  check(origin.startsWith('quantora://app/'), `window is on quantora://app (got ${origin})`);
  const policy = await window.evaluate(async () => {
    const response = await fetch('/');
    return { csp: response.headers.get('content-security-policy') || '' };
  });
  check(policy.csp.includes("script-src 'self'") && policy.csp.includes("frame-src 'none'"), 'renderer is served the desktop CSP');

  // 2. relative /api calls reach the API origin through the host
  const providers = await window.evaluate(async () => {
    const response = await fetch('/api/auth/providers');
    return { status: response.status, text: await response.text() };
  });
  let parsedProviders = null;
  try { parsedProviders = JSON.parse(providers.text); } catch { /* reported below */ }
  check(providers.status === 200 && parsedProviders && 'email' in parsedProviders, `/api/auth/providers proxied to the API mirror (status ${providers.status})`);

  // 3. the bridge is exposed with the contracted shape
  const bridge = await window.evaluate(() => ({ present: Boolean(window.quantoraDesktop), version: window.quantoraDesktop?.version }));
  check(bridge.present && bridge.version === DESKTOP_BRIDGE_VERSION, `window.quantoraDesktop bridge present (v${DESKTOP_BRIDGE_VERSION})`);
  const host = await window.evaluate(() => window.quantoraDesktop.host());
  check(host.apiOrigin === API_ORIGIN, `host reports the configured API origin (${host.apiOrigin})`);

  // 4. sign-in through the UI: the button asks the host, the host (smoke mode)
  //    hands back the grant URL, we play the browser, the deep link completes it
  const grantUrlPromise = app.evaluate(() => null); // keep evaluate ordering explicit
  await grantUrlPromise;
  await click('[data-qd-signin]');
  await settle(500);
  const waitingCopy = await window.evaluate(() => document.querySelector('[data-qd-signin]')?.textContent || '');
  check(/browser/i.test(waitingCopy), `sign-in button hands off to the browser (${waitingCopy.trim()})`);
  // The UI call already created the pending attempt; ask the host for the grant
  // URL of a fresh attempt so the gate holds the matching state.
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

  await emitDeepLink(deepLink.replace(/state=[^&]+/, 'state=not-our-attempt-0000'));
  await settle(1500);
  check((await screen()) === 'signin', 'a deep link with a foreign state leaves us signed out');

  await emitDeepLink(deepLink);
  check(await waitScreen('launcher', 30_000), 'the real deep link signs us in and shows the launcher');
  const session = await window.evaluate(() => fetch('/api/auth/session').then((r) => r.json()));
  check(session?.user?.email === USER.email, `bearer session restored through the proxy (${session?.user?.email || 'none'})`);
  const whoami = await window.evaluate(() => document.querySelector('[data-qd-user]')?.textContent || '');
  check(whoami.includes(USER.email), `launcher shows who is signed in (${whoami})`);

  // 4c. the persistent host reports its capabilities honestly and polls without inventing news
  const hostAfter = await window.evaluate(() => window.quantoraDesktop.host());
  check(typeof hostAfter.capabilities.notifications === 'boolean' && typeof hostAfter.capabilities.background === 'boolean',
    `host reports notification/background support as booleans (notifications=${hostAfter.capabilities.notifications}, background=${hostAfter.capabilities.background})`);
  const poll = await app.evaluate(() => globalThis.__quantoraSmoke.pollWatches());
  check(poll.ok === false && poll.reason === 'unavailable' && poll.status === 503 && poll.notified === 0,
    `watch poll reports the mirror's 503 honestly and raises nothing (${JSON.stringify(poll)})`);

  // 5. open the folder from the launcher → workspace with the real files
  await click('[data-qd-open-folder]');
  check(await waitScreen('workspace', 30_000), 'open folder shows the workspace');
  const shownRoot = await window.evaluate(() => document.querySelector('[data-qd-screen="workspace"]')?.getAttribute('data-qd-workspace') || '');
  check(shownRoot.endsWith(workspace.split('/').pop()), `workspace title shows the folder (${shownRoot})`);
  await waitFor('[data-qd-file="index.html"]', 15_000);
  check(await present('[data-qd-file="index.html"]'), 'explorer lists the folder\'s file');

  // 6. editor: open the file, edit, save with the keyboard, verify on disk
  await click('[data-qd-file="index.html"]');
  await waitFor('[data-qd-editor="index.html"] .monaco-editor', 30_000);
  check(await present('[data-qd-editor="index.html"] .monaco-editor'), 'Monaco opened the file');
  /*
   * The container exists before the file's text does. Workspace opens the tab
   * with content "" and loading:true, fills it from disk afterwards, and the
   * Editor resets its model when that value arrives — so keystrokes typed into
   * that window are discarded, and a click that lands before Monaco's textarea
   * is interactive focuses nothing at all. On #548 and #551 this act failed on
   * a loaded runner even with a 10s wait for the save, and reproduced here
   * under CPU load: the save was fine; the typing had never reached the file.
   * So: wait for the seeded text, then click until the editor owns focus.
   */
  const editorText = () => window.evaluate(() => document.querySelector('[data-qd-editor="index.html"] .monaco-editor .view-lines')?.textContent || '');
  let shown = '';
  for (const shownDeadline = Date.now() + 15_000; Date.now() < shownDeadline; await settle(100)) {
    shown = await editorText();
    if (shown.includes('desk')) break;
  }
  check(shown.includes('desk'), `the editor shows the file's text before editing — editor shows: ${JSON.stringify(shown.slice(-80))}`);
  let focused = false;
  let lastClickFailure = '';
  for (let attempt = 0; attempt < 8 && !focused; attempt += 1) {
    // The main-world click above: a covered or missing target is named, and
    // the name survives into the check below instead of being swallowed.
    await click('[data-qd-editor="index.html"] .monaco-editor .view-lines').catch((error) => { lastClickFailure = error?.message || String(error); });
    await settle(150);
    // Monaco's hidden input is a textarea.inputarea on older builds and a
    // div.native-edit-context on newer ones; what matters is that focus sits
    // inside this editor.
    focused = await window.evaluate(() => Boolean(document.activeElement?.closest?.('[data-qd-editor="index.html"] .monaco-editor')));
  }
  check(focused, `the editor owns keyboard focus${lastClickFailure ? ` — last click: ${lastClickFailure}` : ''}`);
  const nonce = `edited-${randomBytes(3).toString('hex')}`;
  /*
   * Keystrokes are delivered one event at a time and a loaded runner drops
   * some: under CPU load this typed "<!-edited-…" for "<!-- edited-…". A drop
   * inside the nonce fails the disk check for a reason that has nothing to do
   * with saving, so the keys are spaced out, and the act is tried again once
   * if the editor does not show the nonce. The two halves — typing that never
   * reached the editor, a save that never reached disk — are checked by name,
   * because they fail for different owners.
   */
  let typed = '';
  for (let attempt = 0; attempt < 2 && !typed.includes(nonce); attempt += 1) {
    await window.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
    await window.keyboard.type(`\n<!-- ${nonce} -->`, { delay: 15 });
    for (const typedDeadline = Date.now() + 5_000; Date.now() < typedDeadline; await settle(100)) {
      typed = await editorText();
      if (typed.includes(nonce)) break;
    }
  }
  check(typed.includes(nonce), `typing landed in the editor (${nonce}) — editor shows: ${JSON.stringify(typed.slice(-80))}`);
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  // Poll, never sleep: a fixed 800ms budget for keypress -> IPC -> disk missed
  // once on a shared runner (#548); the write lands, or the check fails naming
  // the nonce it never saw.
  const onDisk = await waitForFileToContain(join(workspace, 'index.html'), nonce, 10_000);
  check(onDisk.includes(nonce), `Cmd/Ctrl+S wrote the edit to disk (${nonce}) — on disk: ${JSON.stringify(onDisk.slice(-80))}`);

  // 7. terminal: whichever the host has, it must run in the folder for real
  const caps = (await window.evaluate(() => window.quantoraDesktop.workspace.info())).capabilities;
  const shellNonce = `quantora-${randomBytes(4).toString('hex')}`;
  if (caps.terminal) {
    const seen = await window.evaluate(async (n) => {
      const api = window.quantoraDesktop;
      let out = '';
      const off = api.pty.onData(({ chunk }) => { out += chunk; });
      const opened = await api.pty.open({ cols: 80, rows: 24 });
      if (!opened.ok) { off(); return `open failed: ${opened.error}`; }
      await new Promise((r) => setTimeout(r, 800));
      await api.pty.write(opened.id, `echo ${n}\r`);
      await new Promise((r) => setTimeout(r, 1500));
      await api.pty.close(opened.id);
      off();
      return out;
    }, shellNonce);
    check(seen.split(shellNonce).length >= 3, `the pty terminal echoed ${shellNonce} in the folder`);
    check(await present('[data-qd-terminal="pty"]'), 'terminal pane is the interactive terminal');
  } else {
    const echoed = await window.evaluate((n) => window.quantoraDesktop.runCollected(`echo ${n} && pwd`), shellNonce);
    check(echoed.ok && echoed.output.startsWith(shellNonce), `collected shell echoed ${shellNonce}`);
    check(echoed.output.trim().endsWith(workspace.split('/').pop()), 'collected shell runs in the folder');
    check(await present('[data-qd-terminal="collected"]'), 'terminal pane says it is collected-output mode (no pty on this machine)');
  }
  const refused = await window.evaluate(() => window.quantoraDesktop.files.sync([{ path: '../escape.txt', content: 'x' }]));
  check(refused.ok === false && !existsSync(join(workspace, '..', 'escape.txt')), 'a path outside the folder is refused and nothing lands outside');

  // 8. git panel: init, then status shows the file
  await click('[data-qd-bottom-git]');
  await click('[data-qd-git-init]');
  await settle(800);
  await click('[data-qd-git-status]');
  await settle(800);
  const gitOut = await window.evaluate(() => document.querySelector('[data-qd-git-output]')?.textContent || '');
  check(/\?\? index\.html/.test(gitOut), 'git status in the panel lists the untracked file');
  check(existsSync(join(workspace, '.git', 'HEAD')), 'the repository really exists on disk');

  // 9. chat: a turn against a mirror with no model keys must report the failure, not invent a reply
  await type('[data-qd-chat-input]', 'Add a footer to index.html');
  await click('[data-qd-chat-send]');
  await waitFor('[data-qd-message="ai"]', 15_000);
  let aiText = '';
  for (let i = 0; i < 40; i += 1) {
    aiText = await window.evaluate(() => document.querySelector('[data-qd-message="ai"]')?.textContent || '');
    if (aiText && !/Thinking/.test(aiText)) break;
    await settle(500);
  }
  const aiIsError = await window.evaluate(() => document.querySelector('[data-qd-message="ai"]')?.getAttribute('data-qd-message-error') === 'true');
  check(aiText.length > 0 && !/Thinking/.test(aiText), `chat turn finished with a visible outcome (${aiText.slice(0, 80)})`);
  check(aiIsError || /Wrote|Did not apply|footer/i.test(aiText), 'chat reported an error from the mirror or a real file change, never a blank success');

  // 10. sign-out drops the token everywhere and returns to sign-in
  await app.evaluate(({ BrowserWindow }) => {
    // The menu's Sign Out item sends the same action the launcher's button uses.
    BrowserWindow.getAllWindows()[0].webContents.send('quantora:menu:action', 'sign-out');
  });
  check(await waitScreen('signin', 15_000), 'Sign Out from the menu returns to the sign-in screen');
  const after = await window.evaluate(() => fetch('/api/auth/session').then((r) => r.json()));
  check(after.user === null, 'sign-out leaves no session behind');
  const pollSignedOut = await app.evaluate(() => globalThis.__quantoraSmoke.pollWatches());
  check(pollSignedOut.reason === 'signed-out', 'the watch loop does nothing once signed out');
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
