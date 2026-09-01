import { test } from "node:test";
import assert from "node:assert/strict";
import { collectRemoteImageProbes, heuristicChecks, probeImageLiveness, verifyBuild } from "./verify-build.ts";

function checkById(checks: ReturnType<typeof heuristicChecks>, id: string) {
  return checks.find((c) => c.id === id);
}

const GOOD = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hira's Cafe</title><style>body{font-family:Inter}</style></head><body><header><nav><a href="/menu">Menu</a></nav></header><main><h1>Welcome</h1><img src="https://images.unsplash.com/x" alt="Latte"><button>Order</button></main><footer>© Hira's Cafe</footer></body></html>`;

test("a well-formed styled document passes the critical checks", () => {
  const checks = heuristicChecks(GOOD, "a cafe website");
  assert.equal(checkById(checks, "doctype")?.ok, true);
  assert.equal(checkById(checks, "styled")?.ok, true);
  assert.equal(checkById(checks, "responsive")?.ok, true);
  assert.equal(checkById(checks, "structure")?.ok, true);
  assert.equal(checkById(checks, "img-alt")?.ok, true);
});

test("an unstyled document with class names still fails the critical 'styled' check", () => {
  const classOnly = `<!doctype html><html><body><div class="display">0</div><button class="key">7</button></body></html>`;
  const checks = heuristicChecks(classOnly);
  assert.equal(checkById(checks, "styled")?.ok, false);
  assert.equal(checkById(checks, "styled")?.critical, true);
});

test("leftover placeholder tokens are flagged", () => {
  const withToken = GOOD.replace("https://images.unsplash.com/x", "{{QUANTORA_IMAGE_1}}");
  const checks = heuristicChecks(withToken);
  assert.equal(checkById(checks, "no-tokens")?.ok, false);
});

test("a shop brief without a cart fails the cart feature check", () => {
  const checks = heuristicChecks(GOOD, "an online boutique to sell handmade jewelry");
  const cart = checkById(checks, "feat-cart");
  assert.ok(cart, "cart feature check should be present for a shop brief");
  assert.equal(cart?.ok, false);
});

test("a shop brief WITH a cart passes the cart feature check", () => {
  const shop = GOOD.replace("<button>Order</button>", '<button class="add-to-cart">Add to cart</button>');
  const checks = heuristicChecks(shop, "sell products online with a checkout");
  assert.equal(checkById(checks, "feat-cart")?.ok, true);
  assert.equal(checkById(checks, "feat-photos")?.ok, true);
});

test("a boutique with empty frames fails the product photo check", () => {
  const empty = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Aaranya</title><style>body{font-family:Inter}</style></head><body><header><nav></nav></header><main><h1>Aaranya</h1><svg></svg><button class="add-to-cart">Add to bag</button></main><footer></footer></body></html>`;
  const checks = heuristicChecks(empty, "an Indian ethnic saree boutique website");
  assert.equal(checkById(checks, "feat-photos")?.ok, false);
  assert.equal(checkById(checks, "feat-photos")?.critical, true);
});

test("a local stylesheet link without inlined CSS fails the critical styled check", () => {
  const linked = `<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><button class="key">7</button></body></html>`;
  const checks = heuristicChecks(linked);
  assert.equal(checkById(checks, "styled")?.ok, false);
});

test("a calculator is not scored as a missing website header and footer", () => {
  const calc = `<!doctype html><html><head><title>Calc</title><style>.key{display:grid}</style></head><body><button class="key">7</button></body></html>`;
  const checks = heuristicChecks(calc, "build a scientific calculator");
  assert.equal(checkById(checks, "styled")?.ok, true);
  assert.equal(checkById(checks, "structure"), undefined);
});

test("a React routing error page fails the runnable-preview check", () => {
  const routed = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:24px"><strong>React preview routing error.</strong><p>This generated app must run in the Quantora project runtime.</p></body></html>`;
  const checks = heuristicChecks(routed);
  assert.equal(checkById(checks, "runnable-preview")?.ok, false);
  assert.equal(checkById(checks, "runnable-preview")?.critical, true);
});

test("a coffee shop landing page is not scored as an online store", () => {
  // The reported failure: "one-page site for a coffee shop" matched a bare
  // \bshop\b, attached a CRITICAL >=10-photo catalog check, capped the score at
  // 45 (bar is 80) and made the build permanently unpassable.
  const brief = 'a one-page site for a coffee shop called "Ember & Oak" - hero, a 3-item menu with prices, and hours';
  const checks = heuristicChecks(GOOD, brief);
  assert.equal(checkById(checks, "feat-cart"), undefined, "a cafe menu is not a checkout");
  assert.equal(checkById(checks, "feat-photos"), undefined, "no catalog was requested");
});

test("generic venue and product nouns do not imply e-commerce", () => {
  for (const brief of [
    "a landing page for a book store",
    "a page describing our product",
    "a barber shop website with opening hours",
  ]) {
    const checks = heuristicChecks(GOOD, brief);
    assert.equal(checkById(checks, "feat-photos"), undefined, `should not demand a catalog: ${brief}`);
  }
});

test("a real catalog brief still gets the CRITICAL product photo bar", () => {
  const empty = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Aaranya</title><style>body{font-family:Inter}</style></head><body><header><nav></nav></header><main><h1>Aaranya</h1><svg></svg><button class="add-to-cart">Add to bag</button></main><footer></footer></body></html>`;
  const checks = heuristicChecks(empty, "an e-commerce storefront with a product catalogue of sarees");
  assert.equal(checkById(checks, "feat-photos")?.ok, false);
  assert.equal(checkById(checks, "feat-photos")?.critical, true, "a genuine catalog must still be capped");
});

test("commerce without a catalog is checked but not capped", () => {
  // Selling a subscription has a checkout but no product shots to prove.
  const checks = heuristicChecks(GOOD, "a page to sell a subscription with a checkout");
  assert.ok(checkById(checks, "feat-cart"), "checkout still demands a cart");
  assert.equal(checkById(checks, "feat-photos")?.critical, false, "no catalog => not critical");
});

test("a real shop job card still imposes the CRITICAL photo bar", () => {
  // Guards the fix itself: narrowing the brief regexes must not let a genuine
  // shop turn through unchecked. This is the job card from the reported
  // boutique session, formatted exactly as verifyBuild judges it.
  const brief = [
    "A shop website",
    "A shop website. Catalog and bag still work. At least 10 loadable catalog photos. Add to Cart on Preview",
  ].join("\n");
  const empty = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Aaranya</title><style>body{font:16px Inter}</style></head><body><header><nav></nav></header><main><h1>Aaranya</h1><svg></svg></main><footer></footer></body></html>`;
  const checks = heuristicChecks(empty, brief);
  assert.ok(checkById(checks, "feat-cart"), "a shop job card must still demand a cart");
  assert.equal(checkById(checks, "feat-photos")?.ok, false);
  assert.equal(checkById(checks, "feat-photos")?.critical, true);
});

test("catalog and catalogue spellings are both recognised", () => {
  for (const word of ["catalog", "catalogue"]) {
    const checks = heuristicChecks(GOOD, `an online store with a product ${word}`);
    assert.equal(checkById(checks, "feat-photos")?.critical, true, `"${word}" should be a catalog brief`);
  }
});

/*
 * Controls that are wired, not merely present.
 *
 * Before build-truth was connected here, this boutique page scored 100/100 and
 * passed: doctype, lang, title, viewport, styling, header/nav/footer, alt text,
 * a real <img>, the words "Add to Cart" — every check this file asked was about
 * the SOURCE. Its nav, its Add to Cart and its Checkout were all dead.
 */
const DEAD_SHOP = `<!doctype html><html lang="en"><head><title>Bella Boutique</title><meta name="viewport" content="width=device-width"><style>body{font-family:system-ui;padding:2rem}</style></head><body><header><nav><a href="#">Home</a><a href="#">Shop</a></nav></header><main><h1>Bella Boutique</h1><img src="https://img.example/dress.jpg" alt="Dress"><button class="btn">Add to Cart</button><button class="btn">Checkout</button><a href="#missing-section">See sizing</a></main><footer><p>&copy; Bella</p></footer></body></html>`;

const WIRED_SHOP = `<!doctype html><html lang="en"><head><title>Bella</title><meta name="viewport" content="width=device-width"><style>body{font-family:system-ui;padding:2rem}</style></head><body><header><nav><a href="/shop">Shop</a></nav></header><main><h1>Bella</h1><img src="https://img.example/dress.jpg" alt="Dress"><button onclick="addToCart('dress')">Add to Cart</button><a href="/checkout">Checkout</a></main><footer>&copy; Bella</footer><script>function addToCart(id){window.cart=(window.cart||0)+1}</script></body></html>`;

function scoreOf(checks: ReturnType<typeof heuristicChecks>) {
  const total = checks.reduce((s, c) => s + c.weight, 0) || 1;
  const earned = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  const raw = Math.round((earned / total) * 100);
  return checks.some((c) => c.critical && !c.ok) ? Math.min(raw, 45) : raw;
}

test("a shop whose Add to Cart does nothing cannot pass", () => {
  const checks = heuristicChecks(DEAD_SHOP, "an online shop to sell dresses with a product catalog");
  const wired = checkById(checks, "controls-wired");
  assert.equal(wired?.ok, false, "four dead controls must be seen");
  assert.equal(wired?.critical, true, "a dead Add to Cart on a selling brief is the shop not existing");
  assert.equal(checkById(checks, "links-resolve")?.ok, false, "#missing-section goes nowhere");
  // The string checks still pass — which is exactly why they were not enough.
  assert.equal(checkById(checks, "feat-cart")?.ok, true);
  assert.equal(checkById(checks, "interactive")?.ok, true);
  assert.ok(scoreOf(checks) <= 45, `dead shop scored ${scoreOf(checks)}, must be capped`);
});

test("a shop whose Add to Cart is wired still scores full marks", () => {
  const checks = heuristicChecks(WIRED_SHOP, "an online shop to sell dresses with a product catalog");
  assert.equal(checkById(checks, "controls-wired")?.ok, true);
  assert.equal(checkById(checks, "links-resolve")?.ok, true);
  assert.equal(scoreOf(checks), 100, "wiring the controls must not cost a working page anything");
});

test("a dead link on a non-selling brief is scored down, never capped", () => {
  const landing = `<!doctype html><html lang="en"><head><title>Yoga</title><meta name="viewport" content="width=device-width"><style>body{font-family:system-ui}</style></head><body><header><nav><a href="/about">About</a></nav></header><main><h1>Yoga Studio</h1><p>Calm classes daily.</p><img src="https://img.example/y.jpg" alt="Studio"><a href="#">Follow us</a></main><footer>&copy; Yoga</footer></body></html>`;
  const checks = heuristicChecks(landing, "a landing page for a yoga studio");
  const wired = checkById(checks, "controls-wired");
  assert.equal(wired?.ok, false);
  assert.notEqual(wired?.critical, true, "a dead social link is a defect, not a destroyed build");
  const score = scoreOf(checks);
  assert.ok(score > 45 && score < 100, `expected a scored-down but living page, got ${score}`);
});

test("when the wiring lives in a framework the check is absent, never a green it did not earn", () => {
  /*
   * build-truth stands down when a component framework owns the wiring. A
   * check that reports ok because it never ran buys false confidence at full
   * price, so nothing may be pushed at all.
   */
  const react = `<!doctype html><html lang="en"><head><title>App</title><meta name="viewport" content="width=device-width"><style>body{font-family:system-ui}</style></head><body><div id="root"></div><script type="module">import React from 'react'; import { createRoot } from 'react-dom/client';</script></body></html>`;
  const ids = heuristicChecks(react, "an online shop to sell dresses").map((c) => c.id);
  assert.equal(ids.includes("controls-wired"), false, "must not claim to have checked framework wiring");
});

test("dead-control detail carries the specific controls, not just a count", () => {
  // The refinement loop feeds these strings back to the repair pass; "some
  // controls are dead" is not something a repair can act on.
  const detail = checkById(heuristicChecks(DEAD_SHOP, "an online shop to sell dresses"), "controls-wired")?.detail || "";
  assert.match(detail, /Add to Cart/, "the failing control must be named");
});

/*
 * Both found in review of #432, both reproduced before either was fixed.
 */
test("a dead cart is caught even when its accessible name hides the words", () => {
  // build-truth prefers the accessible name, so aria-label wins over visible
  // text and data.label reads "Add dress". Classifying on the label alone let
  // this shop score 88 and pass with an Add to Cart that does nothing.
  const aria = `<!doctype html><html lang="en"><head><title>S</title><meta name="viewport" content="width=device-width"><style>body{font-family:system-ui;padding:2rem}</style></head><body><header><nav><a href="/shop">Shop</a></nav></header><main><h1>Shop</h1><img src="https://i.example/d.jpg" alt="Dress"><button aria-label="Add dress">Add to Cart</button></main><footer>&copy; S</footer></body></html>`;
  const checks = heuristicChecks(aria, "an online shop to sell dresses with a product catalog");
  assert.equal(checkById(checks, "controls-wired")?.critical, true, "the selling control must be classified by its source, not its label");
  assert.ok(scoreOf(checks) <= 45);
});

test("a shop whose cart is wired by an external script is never destroyed", () => {
  /*
   * build-truth reads script BODIES, so a commerce SDK loaded by src is
   * invisible to it and its Add to Cart reads as dead. Capping that build at
   * 45 asserts knowledge we do not have. The finding still surfaces — only the
   * cap stands down — so the page is annotated, not sentenced.
   */
  const ext = `<!doctype html><html lang="en"><head><title>S</title><meta name="viewport" content="width=device-width"><style>body{font-family:system-ui;padding:2rem}</style></head><body><header><nav><a href="/shop">Shop</a></nav></header><main><h1>Shop</h1><img src="https://i.example/d.jpg" alt="Dress"><button class="buy">Add to Cart</button></main><footer>&copy; S</footer><script src="https://cdn.example/commerce.js"></script></body></html>`;
  const checks = heuristicChecks(ext, "an online shop to sell dresses with a product catalog");
  const wired = checkById(checks, "controls-wired");
  assert.equal(wired?.ok, false, "the finding is still reported");
  assert.notEqual(wired?.critical, true, "code we cannot read is not proof the shop is broken");
  const score = scoreOf(checks);
  assert.ok(score >= 80, `an externally wired shop must still pass, got ${score}`);
});

/*
 * IMAGE LIVENESS — the "confidently wrong raises no error" class.
 *
 * On 2026-09-01 a boutique shop shipped with cart and checkout working and
 * every product frame EMPTY: the model invented Unsplash photo IDs and used
 * the retired source.unsplash.com, then claimed "verified photographs" three
 * turns in a row. Every existing image check asked about the STRING (src
 * present, src shaped like a URL) so all of them passed. Whether a URL loads
 * is network truth; these tests pin the probe that asks it.
 *
 * Precision rule (§5): only a definitive upstream verdict is "dead" — HTTP
 * 4xx, or a 2xx that is not an image. Timeouts and 5xx are indeterminate and
 * never fail a build, so this check cannot become the next muted gate.
 */
const LIVE_PNG_HEADERS = { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/jpeg' : null) };
const HTML_HEADERS = { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) };

function fetchStub(byUrl: Record<string, { status: number; headers?: any } | 'timeout'>) {
  return async (url: string) => {
    const plan = byUrl[url];
    if (!plan) throw new Error(`unexpected probe: ${url}`);
    if (plan === 'timeout') { const e: any = new Error('aborted'); e.name = 'AbortError'; throw e; }
    return { status: plan.status, ok: plan.status >= 200 && plan.status < 300, headers: plan.headers || LIVE_PNG_HEADERS } as any;
  };
}

test('collectRemoteImageProbes reads direct and proxied srcs, unencoded tails intact', () => {
  const html = '<img src="/api/preview-image?u=https://images.unsplash.com/photo-1?w=1200&q=80" alt="a">'
    + '<img src="https://images.pexels.com/photos/2.jpeg" alt="b">'
    + '<img src="data:image/png;base64,AAAA" alt="inline">'
    + '<img src="https://images.pexels.com/photos/2.jpeg" alt="dup">';
  const probes = collectRemoteImageProbes(html);
  assert.deepEqual(probes, [
    'https://images.unsplash.com/photo-1?w=1200&q=80',
    'https://images.pexels.com/photos/2.jpeg',
  ]);
});

test('[was-red] a 404 photo is dead, named, and fails the liveness check', async () => {
  const live = await probeImageLiveness(
    ['https://images.unsplash.com/photo-real?w=1200', 'https://images.unsplash.com/photo-invented?w=1200'],
    { fetchFn: fetchStub({
      'https://images.unsplash.com/photo-real?w=1200': { status: 200 },
      'https://images.unsplash.com/photo-invented?w=1200': { status: 404 },
    }) },
  );
  assert.equal(live.dead.length, 1);
  assert.match(live.dead[0].url, /photo-invented/);
  assert.match(live.dead[0].why, /404/);
});

test('a 200 that is not an image is dead — a photo host serving an error page', async () => {
  const live = await probeImageLiveness(
    ['https://source.unsplash.com/featured/400x300?tailor'],
    { fetchFn: fetchStub({ 'https://source.unsplash.com/featured/400x300?tailor': { status: 200, headers: HTML_HEADERS } }) },
  );
  assert.equal(live.dead.length, 1);
  assert.match(live.dead[0].why, /not an image/);
});

test('timeouts and 5xx are indeterminate, never dead — the gate stays precise', async () => {
  const live = await probeImageLiveness(
    ['https://images.unsplash.com/photo-slow', 'https://images.unsplash.com/photo-503'],
    { fetchFn: fetchStub({
      'https://images.unsplash.com/photo-slow': 'timeout',
      'https://images.unsplash.com/photo-503': { status: 503 },
    }) },
  );
  assert.equal(live.dead.length, 0);
  assert.equal(live.indeterminate, 2);
});

test('[was-red] verifyBuild fails a catalog whose photos are dead, naming the URL for repair', async () => {
  const html = '<!DOCTYPE html><html lang="en"><head><title>Saree Boutique</title>'
    + '<meta name="viewport" content="width=device-width"><style>body{margin:0;background:#fdf6f0;color:#333;font-family:serif}.card{display:grid}</style></head>'
    + '<body><header><nav>Shop</nav></header><main>'
    + '<img src="/api/preview-image?u=https://images.unsplash.com/photo-invented?w=1200&q=80" alt="Kanjivaram saree">'
    + '<button type="button">Add to Cart</button></main><footer>Boutique</footer></body></html>';
  const report = await verifyBuild({
    code: html,
    brief: 'boutique online shop with a product catalog and real product photos',
    fetchImage: fetchStub({ 'https://images.unsplash.com/photo-invented?w=1200&q=80': { status: 404 } }) as any,
  });
  const liveness = report.checks.find((c) => c.id === 'img-live');
  assert.ok(liveness, 'the liveness check ran');
  assert.equal(liveness?.ok, false);
  assert.ok(report.issues.some((issue) => /photo-invented/.test(issue)), 'the dead URL reaches the repair loop by name');
  assert.equal(report.passed, false);
});
