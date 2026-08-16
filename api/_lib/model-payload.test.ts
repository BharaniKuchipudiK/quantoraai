import assert from "node:assert/strict";
import test from "node:test";
import { stripDataUris, tokenizeDataUris, restoreDataUris } from "./model-payload.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA";
const bigB64 = "A".repeat(50_000);
const html = `<html><body>
  <img src="data:image/png;base64,${bigB64}" alt="hero">
  <div style="background:url(data:image/jpeg;base64,${"B".repeat(1000)})"></div>
  <p>real content</p>
</body></html>`;

test("stripDataUris elides base64 payloads but keeps structure", () => {
  const out = stripDataUris(html);
  assert.doesNotMatch(out, /A{100}/, "big base64 payload removed");
  assert.doesNotMatch(out, /B{100}/, "css url payload removed");
  assert.match(out, /data:image\/png;base64,…/, "mime prefix preserved");
  assert.match(out, /real content/, "real markup untouched");
  assert.ok(out.length < html.length / 10, "payload dramatically smaller");
});

test("stripDataUris is a no-op on code without data-URIs", () => {
  const plain = "<html><body><h1>hi</h1></body></html>";
  assert.equal(stripDataUris(plain), plain);
});

test("tokenize then restore is a perfect round-trip (images preserved byte-for-byte)", () => {
  const { tokenized, assets } = tokenizeDataUris(html);
  assert.equal(assets.length, 2, "both data-URIs captured");
  assert.doesNotMatch(tokenized, /A{100}/, "payload not sent to model");
  assert.ok(tokenized.length < html.length / 10, "tokenized payload is small");
  const restored = restoreDataUris(tokenized, assets);
  assert.equal(restored, html, "restored output identical to original");
});

test("restore survives a model reformatting around the token", () => {
  const { tokenized, assets } = tokenizeDataUris(`<img src="${PNG}">`);
  // Model returns the token intact but reindents / re-quotes around it.
  const modelReturned = tokenized.replace("<img", "  <img");
  const restored = restoreDataUris(modelReturned, assets);
  assert.match(restored, /iVBORw0KGgo/, "original image bytes restored");
  assert.doesNotMatch(restored, /quantora\/asset/, "no leftover tokens");
});

test("restore leaves unknown/dropped tokens untouched rather than crashing", () => {
  // Asset index out of range → token left as-is (image lost, but no throw).
  const out = restoreDataUris("data:quantora/asset;id=9 and text", ["only-one"]);
  assert.match(out, /data:quantora\/asset;id=9/);
  assert.match(out, /and text/);
});

test("empty / missing input is handled", () => {
  assert.equal(stripDataUris(""), "");
  assert.equal(restoreDataUris("x", []), "x");
  const { tokenized, assets } = tokenizeDataUris("");
  assert.equal(tokenized, "");
  assert.equal(assets.length, 0);
});
