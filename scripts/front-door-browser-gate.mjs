#!/usr/bin/env node
/*
 * THE FRONT DOOR: sign in with email and password, come back still signed in,
 * sign out.
 *
 * Every browser gate on this platform restored a synthetic signed-in session
 * before its first click. None had typed into the sign-in modal, none had
 * reloaded to see whether the session cookie brought the person back, and
 * none had ever clicked Sign Out — so the three things every person does
 * first, again, and last were "helpers only" in the ledger (2026-09-06).
 *
 * The server side is stubbed at the wire with the shapes the real handlers
 * answer (api/_lib/handlers/auth-login.ts answers formatClientUser;
 * auth-session.ts answers { user } or { user: null }; logout clears the
 * cookie). The cookie is real: the stub SETS it on sign-in and CLEARS it on
 * sign-out, and reads the browser's jar to decide whether the person is
 * signed in, so a session that survives a reload survives it the way the
 * real one does — by the browser sending the cookie back.
 *
 * What it proves, in order:
 *   1. The landing's "Try Quantora" opens the sign-in modal for a signed-out
 *      visitor (the landing offers data-quantora-login until someone is
 *      signed in, and data-quantora-enter-studio after).
 *   2. A wrong password is refused with the server's own sentence, shown.
 *   3. The right password signs in: the modal closes, the signed-in hub offers
 *      the Studio — and only the modules this build shows — and the desk's
 *      header shows the person.
 *   4. A reload of the desk comes back signed in, from the cookie alone.
 *   5. Sign Out asks for its confirmation word, tells the server, and returns
 *      the visitor to the landing signed out — and a reload stays signed out.
 *
 * The verdict is the last line. FRONT DOOR | passed … or FRONT DOOR | FAILED
 * at <step> | <why> | <state>.
 */
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { exploratorySurfacesShown } from './lib/parked-surfaces.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = 'artifacts/e2e';
mkdirSync(ARTIFACT_DIR, { recursive: true });

const EMAIL = 'front-door@quantora.invalid';
const PASSWORD = 'correct-horse-battery-staple-42';
const WRONG_PASSWORD = 'not-the-password';
const COOKIE_NAME = 'quantora_session';
const COOKIE_VALUE = 'front-door-gate-session';
const REFUSAL = 'Invalid email or password.';
const CONFIRM_WORD = 'LOGOUT';

const sessionUser = { name: 'Front Door', email: EMAIL, picture: '', authProvider: 'Email & password', isAdmin: false };
// formatClientUser's shape (api/_lib/auth-response.ts): the sign-in body is
// the person as the app holds them.
const clientUser = {
  name: 'Front Door',
  email: EMAIL,
  avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent('Front Door')}&background=f97316&color=ffffff&bold=true`,
  authProvider: 'Email & password',
  tier: 'Indie Creator ($0 / mo)',
  joinedDate: 'September 2026',
  isAdmin: false,
};

const evidence = {
  baseUrl: BASE_URL,
  startedAt: new Date().toISOString(),
  steps: [],
  sessionReads: [],
  loginAttempts: [],
  logoutCalls: 0,
};

const browser = await chromium.launch({
  headless: true,
  ...(process.env.QUANTORA_E2E_CHROMIUM ? { executablePath: process.env.QUANTORA_E2E_CHROMIUM } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(error.message));

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_user');
});

async function hasSessionCookie() {
  const cookies = await context.cookies(BASE_URL);
  return cookies.some((cookie) => cookie.name === COOKIE_NAME && cookie.value === COOKIE_VALUE);
}

const json = (status, body, headers = {}) => ({
  status,
  contentType: 'application/json',
  headers,
  body: JSON.stringify(body),
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (path === '/api/auth/providers') {
    return route.fulfill(json(200, { google: false, github: false, email: true, passwordReset: true }));
  }
  if (path === '/api/auth/session') {
    const signedIn = await hasSessionCookie();
    evidence.sessionReads.push(signedIn ? 'with-cookie' : 'no-cookie');
    return route.fulfill(json(200, signedIn ? { user: sessionUser } : { user: null }));
  }
  if (path === '/api/auth/login' && request.method() === 'POST') {
    let body = {};
    try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
    const accepted = body.email === EMAIL && body.password === PASSWORD;
    evidence.loginAttempts.push({ email: body.email || null, accepted });
    if (!accepted) return route.fulfill(json(401, { error: REFUSAL }));
    return route.fulfill(json(200, clientUser, {
      'Set-Cookie': `${COOKIE_NAME}=${COOKIE_VALUE}; Path=/; HttpOnly; SameSite=Lax`,
    }));
  }
  if (path === '/api/auth/logout' && request.method() === 'POST') {
    evidence.logoutCalls += 1;
    return route.fulfill(json(200, { ok: true }, {
      'Set-Cookie': `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    }));
  }
  return route.fulfill(json(200, { ok: true, projects: [], sessions: [] }));
});

const signedOutEntry = () => page.locator('[data-quantora-login="true"]').first();
const enterStudio = () => page.locator('[data-quantora-enter-studio="true"]').first();
const authModal = () => page.locator('[data-quantora-auth-modal="true"]').first();
/*
 * WHERE THE PERSON IS SHOWN DEPENDS ON THE SHELL (2026-09-07).
 *
 * Outside the Studio the header carries the account entry; inside it the
 * header stands down (profileInShell) and the sidebar carries it, so there
 * is exactly one either way. What this gate is about is that the app shows
 * WHO YOU ARE and can sign you out — not which surface holds the control.
 * Pinning it to the header made the gate a test of the layout instead.
 */
const profileMenu = () => page.locator('[data-quantora-profile-menu="true"], [data-quantora-sidebar-profile="true"]').first();
const composer = () => page.locator('.app-shell--studio textarea').first();
const hubModule = (id) => page.locator(`[data-quantora-hub-module="${id}"]`).first();

async function visible(locator, message, timeout = 15_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}
async function gone(locator, message, timeout = 15_000) {
  await locator.waitFor({ state: 'hidden', timeout }).catch(() => {});
  if (await locator.isVisible().catch(() => false)) throw new Error(message);
}

async function pageState() {
  return {
    url: page.url(),
    authModal: await authModal().isVisible().catch(() => false),
    authError: await page.locator('[data-quantora-auth-error="true"]').first().innerText({ timeout: 800 }).catch(() => null),
    profileMenu: await profileMenu().isVisible().catch(() => false),
    enterStudio: await enterStudio().isVisible().catch(() => false),
    signedOutEntry: await signedOutEntry().isVisible().catch(() => false),
    hubStudio: await hubModule('studio').isVisible().catch(() => false),
    sessionCookie: await hasSessionCookie(),
    sessionReads: evidence.sessionReads.slice(),
    loginAttempts: evidence.loginAttempts.slice(),
    logoutCalls: evidence.logoutCalls,
    consoleErrors: consoleErrors.slice(-5),
  };
}

let currentStep = 'boot';
async function step(name, run) {
  currentStep = name;
  const startedAt = Date.now();
  await run();
  evidence.steps.push({ name, ms: Date.now() - startedAt });
}

try {
  await step('open the landing signed out', async () => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await visible(signedOutEntry(), 'The landing never showed its signed-out entry control ([data-quantora-login]).');
    if (await enterStudio().isVisible().catch(() => false)) throw new Error('The landing offered the desk ([data-quantora-enter-studio]) to a visitor who is not signed in.');
    if (await hasSessionCookie()) throw new Error('A session cookie existed before anyone signed in.');
  });

  await step('the entry control opens the sign-in modal', async () => {
    await signedOutEntry().click();
    await visible(authModal(), 'Clicking Try Quantora while signed out did not open the sign-in modal ([data-quantora-auth-modal]).');
    await visible(page.locator('[data-quantora-auth-email="true"]').first(), 'The sign-in modal opened without its email field: the form is not in sign-in mode.');
  });

  await step('a wrong password is refused with the server\'s sentence', async () => {
    await page.locator('[data-quantora-auth-email="true"]').first().fill(EMAIL);
    await page.locator('[data-quantora-auth-password="true"]').first().fill(WRONG_PASSWORD);
    await page.locator('[data-quantora-auth-submit="login"]').first().click();
    const error = page.locator('[data-quantora-auth-error="true"]').first();
    await visible(error, 'The wrong password produced no visible refusal in the modal.');
    const text = (await error.innerText()).trim();
    if (!text.includes(REFUSAL)) throw new Error(`The refusal shown is not the server's sentence. Shown: "${text}"; server said: "${REFUSAL}".`);
    if (await hasSessionCookie()) throw new Error('A refused sign-in left a session cookie behind.');
    if (!(await authModal().isVisible())) throw new Error('The modal closed on a refused sign-in.');
  });

  await step('the right password signs in', async () => {
    await page.locator('[data-quantora-auth-password="true"]').first().fill(PASSWORD);
    await page.locator('[data-quantora-auth-submit="login"]').first().click();
    await gone(authModal(), 'The modal stayed open after the server accepted the sign-in.');
    await visible(hubModule('studio'), 'Signed in, but the hub never offered the Studio ([data-quantora-hub-module="studio"]).');
    await visible(profileMenu(), 'Signed in, but the hub never showed the person ([data-quantora-profile-menu] in the header).');
    // The hub offers exactly the modules this build shows: parked ones stay parked here too.
    for (const parked of ['canvas', 'quantum']) {
      const offered = await hubModule(parked).isVisible().catch(() => false);
      if (offered && !exploratorySurfacesShown()) throw new Error(`The signed-in hub offers the parked "${parked}" module although this build parks it (src/lib/platform-surfaces.js; VITE_QUANTORA_EXPLORATORY_SURFACES=on shows it).`);
      if (!offered && exploratorySurfacesShown()) throw new Error(`This build shows the exploratory surfaces, but the hub does not offer "${parked}".`);
    }
    if (!(await hasSessionCookie())) throw new Error('Signed in, but the browser holds no session cookie: the Set-Cookie from sign-in did not land.');
    const accepted = evidence.loginAttempts.filter((attempt) => attempt.accepted).length;
    if (accepted !== 1 || evidence.loginAttempts.length !== 2) {
      throw new Error(`Expected exactly two sign-in requests (one refused, one accepted); saw ${JSON.stringify(evidence.loginAttempts)}.`);
    }
  });

  await step('the desk opens and shows the person', async () => {
    await hubModule('studio').click();
    await page.waitForURL(/\/desk\/?(\?|$)/, { timeout: 20_000 }).catch(() => {});
    await visible(composer(), `The desk did not open after Try Quantora (url: ${page.url()}).`, 20_000);
    await visible(profileMenu(), 'The desk opened, but nothing showed the person: neither the header ([data-quantora-profile-menu]) nor the sidebar ([data-quantora-sidebar-profile]).');
  });

  await step('a reload comes back signed in from the cookie', async () => {
    const readsBefore = evidence.sessionReads.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await visible(composer(), 'After a reload the desk did not come back.', 20_000);
    await visible(profileMenu(), 'After a reload nothing shows the person: the session did not restore from the cookie.');
    if (await authModal().isVisible().catch(() => false)) throw new Error('After a reload the sign-in modal reappeared although the session cookie was present.');
    const reads = evidence.sessionReads.slice(readsBefore);
    if (!reads.includes('with-cookie')) throw new Error(`The reload never asked /api/auth/session with the cookie (reads after reload: ${JSON.stringify(reads)}).`);
  });

  await step('Sign Out asks for its word, tells the server, and returns the visitor to the landing', async () => {
    await profileMenu().click();
    const signOut = page.locator('[data-quantora-sign-out="true"]').first();
    await visible(signOut, 'The profile menu opened without a Sign Out row ([data-quantora-sign-out]).');
    await signOut.click();
    const confirmInput = page.locator('[data-quantora-confirm-input="true"]').first();
    await visible(confirmInput, 'Sign Out did not ask for its confirmation word ([data-quantora-confirm-input]).');
    const confirmAction = page.locator('[data-quantora-confirm-action="true"]').first();
    if (await confirmAction.isEnabled().catch(() => true)) throw new Error('The confirm button was enabled before the confirmation word was typed.');
    await confirmInput.fill(CONFIRM_WORD);
    await visible(confirmAction, 'The confirm button is missing ([data-quantora-confirm-action]).');
    await confirmAction.click();
    // The cause before the symptom: a sign-out that never tells the server
    // leaves the cookie alive, and what the page shows next depends on the
    // route. Broken on purpose (the logout POST removed) this reads
    // "told the server 0 time(s)", not a sentence about the landing.
    const toldBy = Date.now() + 5_000;
    while (evidence.logoutCalls < 1 && Date.now() < toldBy) await page.waitForTimeout(100);
    if (evidence.logoutCalls !== 1) throw new Error(`Sign Out told the server ${evidence.logoutCalls} time(s); expected exactly one POST /api/auth/logout.`);
    await visible(signedOutEntry(), 'After Sign Out the landing did not come back with its signed-out entry control.');
    await gone(profileMenu(), 'After Sign Out the app still shows the person.');
    await page.waitForFunction(() => !localStorage.getItem('quantora_user'), null, { timeout: 5_000 }).catch(() => {});
    if (await hasSessionCookie()) throw new Error('Sign Out left the session cookie in the browser: the server\'s clearing Set-Cookie did not land.');
  });

  await step('a reload after Sign Out stays signed out', async () => {
    const readsBefore = evidence.sessionReads.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await visible(signedOutEntry(), 'After Sign Out and a reload the landing did not show its signed-out entry control.');
    if (await enterStudio().isVisible().catch(() => false)) throw new Error('After Sign Out and a reload the landing offers the desk again.');
    const reads = evidence.sessionReads.slice(readsBefore);
    if (reads.includes('with-cookie')) throw new Error('After Sign Out the browser still sent a session cookie on reload.');
  });

  await page.screenshot({ path: `${ARTIFACT_DIR}/front-door.png`, fullPage: true });
  evidence.completedAt = new Date().toISOString();
  writeFileSync(`${ARTIFACT_DIR}/front-door-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  const verdict = `FRONT DOOR | passed | ${evidence.steps.map((entry) => `${entry.name} (${entry.ms}ms)`).join(' → ')}`;
  console.log(verdict);
  await browser.close();
  process.exit(0);
} catch (error) {
  const state = await pageState().catch(() => ({ snapshotFailed: true }));
  evidence.failedAt = new Date().toISOString();
  evidence.failedStep = currentStep;
  evidence.error = error?.message || String(error);
  evidence.pageState = state;
  writeFileSync(`${ARTIFACT_DIR}/front-door-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({ path: `${ARTIFACT_DIR}/front-door-failure.png`, fullPage: true }).catch(() => {});
  console.error('Front door gate FAILED:', error?.stack || error);
  console.error('Front door evidence:', JSON.stringify(evidence, null, 2));
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').slice(0, 240);
  console.error(`\nFRONT DOOR | FAILED at: ${currentStep} | why: ${oneLine(error?.message || error)} | state: url=${state.url} modal=${state.authModal} profile=${state.profileMenu} login=${state.signedOutEntry} hubStudio=${state.hubStudio} cookie=${state.sessionCookie} logins=${JSON.stringify(state.loginAttempts)} logouts=${state.logoutCalls} sessionReads=${JSON.stringify(state.sessionReads)}`);
  await browser.close();
  process.exit(1);
}
