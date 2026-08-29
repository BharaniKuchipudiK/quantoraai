import { test } from "node:test";
import assert from "node:assert/strict";
import { heuristicChecks } from "./verify-build.ts";

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
