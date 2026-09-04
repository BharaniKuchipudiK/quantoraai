import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { targetUrl, unwrapNestedProxyTarget } from "./preview-image.js";
import { isAllowedPreviewImageUrl } from "../../../src/lib/preview-images.js";

/**
 * ---------------------------------------------------------------------------
 * THE PROXY MUST NOT BE ASKED TO FETCH ITSELF.
 *
 * The system prompt tells the model, in bold, that every product and hero image
 * MUST be `/api/preview-image?u=<photo url>`. On a follow-up turn the model is
 * looking at markup whose urls were ALREADY absolutised to
 * `https://<origin>/api/preview-image?u=...`, because that is what the preview
 * shell needs. It obeys the instruction again and wraps the wrapped url.
 *
 * Reported from production on 2026-09-04, byte for byte:
 *
 *   https://quantoraai.app/api/preview-image?u=https%3A%2F%2Fquantoraai.app
 *   %2Fapi%2Fpreview-image%3Fu%3Dhttps%3A%2F%2Fimages.unsplash.com%2Fphoto-
 *   1559056199-641a0ac8b55e%3Fw%3D1200%26q%3D80
 *
 * The proxy was asked to fetch quantoraai.app, which is not a photo host, so it
 * answered 400 and every product frame was empty.
 *
 * proxyRemoteShopImages and rewritePreviewImageUrls each guard against OUR code
 * wrapping twice. Nothing unwrapped a nesting the MODEL wrote — and refusing it
 * would punish the model for following the brief we gave it, the same shape as
 * the intake modal discarded over a newline.
 * ---------------------------------------------------------------------------
 */

const PHOTO = "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=1200&q=80";
const PRODUCTION_URL =
  "/api/preview-image?u=https%3A%2F%2Fquantoraai.app%2Fapi%2Fpreview-image%3Fu%3D"
  + "https%3A%2F%2Fimages.unsplash.com%2Fphoto-1559056199-641a0ac8b55e%3Fw%3D1200%26q%3D80";

test("the exact production url resolves to the photo it always meant", () => {
  assert.equal(targetUrl({ url: PRODUCTION_URL }), PHOTO);
});

test("an ordinary single wrap is unchanged", () => {
  // The overwhelmingly common case must not be touched by this at all.
  assert.equal(targetUrl({ url: `/api/preview-image?u=${PHOTO}` }), PHOTO);
  assert.equal(targetUrl({ url: `/api/preview-image?u=${encodeURIComponent(PHOTO)}` }), PHOTO);
  assert.equal(unwrapNestedProxyTarget(PHOTO), PHOTO);
});

test("the raw-inner contract still holds", () => {
  /*
   * `u` owns everything after it, unencoded — the contract that exists because
   * the prompt teaches the model to write ?u=https://…?w=1200&q=80 with its own
   * query string attached. Unwrapping must not disturb that.
   */
  assert.equal(
    targetUrl({ url: "/api/preview-image?u=https://images.unsplash.com/photo-x?w=800&q=80&ixid=abc" }),
    "https://images.unsplash.com/photo-x?w=800&q=80&ixid=abc",
  );
});

test("deeper nesting collapses to the photo", () => {
  const twice = `https://q.app/api/preview-image?u=${encodeURIComponent(
    `https://q.app/api/preview-image?u=${encodeURIComponent(PHOTO)}`,
  )}`;
  assert.equal(unwrapNestedProxyTarget(twice), PHOTO);
});

test("unwrapping is bounded and cannot be made to hang", () => {
  // A hostile caller must not be able to spend the request budget in here.
  let nested = PHOTO;
  for (let i = 0; i < 40; i += 1) nested = `https://q.app/api/preview-image?u=${encodeURIComponent(nested)}`;
  const started = Date.now();
  const out = unwrapNestedProxyTarget(nested);
  assert.ok(Date.now() - started < 1_000, "unwrapping must not spin");
  // What survives the limit is still a proxy url — and therefore still refused
  // by the allowlist below, which is the point: the bound cannot open a hole.
  assert.equal(isAllowedPreviewImageUrl(out), false);
});

test("the allowlist still judges what comes OUT of the unwrap", () => {
  /*
   * The security question. Unwrapping must not become a way to smuggle a host
   * past the check — so what it returns is exactly what the handler tests, and
   * a link-local address nested inside a proxy url is still refused.
   */
  const smuggled = `https://q.app/api/preview-image?u=${encodeURIComponent("https://169.254.169.254/latest/meta-data/")}`;
  assert.equal(unwrapNestedProxyTarget(smuggled), "https://169.254.169.254/latest/meta-data/");
  assert.equal(isAllowedPreviewImageUrl(unwrapNestedProxyTarget(smuggled)), false, "unwrapping must not bypass the allowlist");

  const source = readFileSync(path.join(import.meta.dirname, "preview-image.ts"), "utf8");
  assert.match(source, /isAllowedPreviewImageUrl\(raw\)/, "the handler must still allowlist the resolved target");
});

test("a target that is not a proxy url is returned untouched", () => {
  for (const value of ["", "not a url", "https://images.pexels.com/photos/1.jpg", "/relative/path.png"]) {
    assert.equal(unwrapNestedProxyTarget(value), value);
  }
});

test("a proxy url with an empty or unusable inner is not mangled", () => {
  // Better to hand the allowlist something it will refuse than to invent a url.
  assert.equal(unwrapNestedProxyTarget("https://q.app/api/preview-image?u="), "https://q.app/api/preview-image?u=");
  const junk = "https://q.app/api/preview-image?u=not-a-url";
  assert.equal(unwrapNestedProxyTarget(junk), junk);
});
