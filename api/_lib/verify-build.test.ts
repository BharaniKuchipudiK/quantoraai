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
