#!/usr/bin/env node
/**
 * The application shell refusing the screen it was given.
 *
 * On 2026-09-09 a user reported wasted space on a wide monitor, and one inline
 * style in src/App.jsx was the whole cause: the <main> shell was capped at
 * 1800px in the studio and 1400px everywhere else, including the admin
 * dashboard. Measured before the fix:
 *
 *   viewport   studio <main>   unused        every other tab   unused
 *   1440       1440            0             1400              40
 *   2000       1800            200 (10.0%)   1400              600 (30.0%)
 *   2560       1800            760 (29.7%)   1400              1160 (45.3%)
 *
 * Nothing could see it. Every layout gate in this repository asks whether a
 * surface RENDERS or OVERFLOWS; none asked whether it USED the space, and a
 * shell that quietly stops at 1400px overflows nothing and renders perfectly.
 * The dashboard's own grid was already fluid — auto-fit, minmax(200px, 1fr) —
 * so the waste came from above it and no dashboard test could have found it.
 *
 * Two assertions, and they pull against each other on purpose:
 *
 *   FILLS      the shell takes at least MIN_USED of the viewport. This is what
 *              regresses the moment someone reintroduces a pixel cap.
 *   NO SPILL   the document never scrolls sideways. This is what would break if
 *              "use the width" were implemented by letting content escape, and
 *              it is why the first assertion cannot be satisfied cheaply.
 *
 * Running text is NOT covered here and must not be: .markdown-prose caps itself
 * at 860px and chat bubbles at 640-720px, which is correct typography. This gate
 * is about the shell, so it reads <main> and nothing inside it.
 */
import { chromium } from 'playwright';
import process from 'node:process';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const WIDTHS = [1440, 2000, 2560];
const MIN_USED = 0.98; // the shell may keep a gutter, not a third of the screen
const MAX_SPILL_PX = 4;

const failures = [];
const rows = [];

const browser = await chromium.launch({ headless: true });

async function stubbedPage(width) {
  const context = await browser.newContext({ viewport: { width, height: 1100 } });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('quantora_hide_welcome', 'true'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { sub: 'shell-width-user', name: 'Shell Width', email: 'shell@quantora.test', picture: null, isAdmin: true },
        }),
      });
    }
    if (path === '/api/models') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }] }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
  });
  return { context, page };
}

async function measure(page) {
  return page.evaluate(() => {
    const el = document.querySelector('main');
    if (!el) return null;
    return {
      width: Math.round(el.getBoundingClientRect().width),
      maxWidth: getComputedStyle(el).maxWidth,
      className: el.className,
      spill: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

function check(surface, width, m) {
  if (!m) {
    failures.push(`${surface} at ${width}px: no <main> element — the shell did not render, so nothing was measured.`);
    return;
  }
  const used = m.width / width;
  rows.push({ surface, viewport: width, rendered: m.width, maxWidth: m.maxWidth, spill: m.spill, used });

  if (used < MIN_USED) {
    const unused = width - m.width;
    failures.push(
      `${surface} at ${width}px used only ${m.width}px — ${unused}px (${((1 - used) * 100).toFixed(1)}%) of the ` +
      `screen is empty, against a floor of ${(MIN_USED * 100).toFixed(0)}%. The shell's computed max-width is ` +
      `"${m.maxWidth}". Look at the maxWidth on <main> in src/App.jsx: a fixed pixel cap there overrides every ` +
      `surface at once, including the admin dashboard, whose own grid is already fluid.`,
    );
  }
  if (m.spill > MAX_SPILL_PX) {
    failures.push(
      `${surface} at ${width}px scrolls sideways by ${m.spill}px. Width was taken by letting content escape the ` +
      `viewport rather than by widening the shell — that is a worse bug than the empty space it replaces.`,
    );
  }
}

try {
  for (const width of WIDTHS) {
    // 1. The studio: an application shell, and the surface a user sits in all day.
    {
      const { context, page } = await stubbedPage(width);
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await enterSignedInStudio(page);
      await page.waitForTimeout(400);
      check('studio', width, await measure(page));
      await context.close();
    }

    // 2. A non-studio tab, which is where the 1400px cap bit hardest. Reached by
    //    the app's own route (homeHrefForTab -> /?tab=hub) rather than by clicking the
    //    brand: from the isolated desk path that click is a full page navigation, so a
    //    gate that clicks and measures reads a document mid-flight and sees nothing.
    {
      const { context, page } = await stubbedPage(width);
      await page.goto(`${BASE_URL}/?tab=hub`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForSelector('main', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(600);
      const m = await measure(page);
      if (m && m.className.includes('app-main--studio')) {
        failures.push(
          `/?tab=hub at ${width}px rendered the STUDIO shell, so the non-studio cap went unmeasured. ` +
          `tabFromLocation in src/lib/studio-isolation.js no longer honours the tab query.`,
        );
      } else {
        check('non-studio', width, m);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log('SHELL WIDTH GATE');
console.log('  Does the shell use the screen it was given, without spilling out of it?\n');
console.log('  surface      viewport   <main>     used      spill   computed max-width');
for (const row of rows) {
  console.log(
    `  ${row.surface.padEnd(12)} ${String(row.viewport).padEnd(10)} ${String(row.rendered).padEnd(10)} ` +
    `${(row.used * 100).toFixed(1).padStart(5)}%   ${String(row.spill).padStart(5)}   ${row.maxWidth}`,
  );
}
console.log('');

if (failures.length) {
  console.error(`FAILED — ${failures.length} problem${failures.length === 1 ? '' : 's'}:\n`);
  for (const failure of failures) console.error(`  - ${failure}\n`);
  process.exit(1);
}
console.log(
  `Shell width gate OK — ${rows.length} measurements across ${WIDTHS.length} viewports, ` +
  `every surface using at least ${(MIN_USED * 100).toFixed(0)}% of the screen with no sideways scroll.`,
);
