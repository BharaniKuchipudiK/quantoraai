import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mimeTypeFor, rendererHeaders, routeStaticPath } from "./static-policy.ts";
import { resolveHeadersForPath } from "../../src/lib/vercel-headers.js";

const files = new Set(["index.html", "assets/app.js", "preview/embed.html", "monaco/vs/loader.js"]);
const exists = (relativePath: string) => files.has(relativePath);

test("real files are served, unknown app routes fall back to the SPA shell", () => {
  assert.deepEqual(routeStaticPath("/", exists), { kind: "index" });
  assert.deepEqual(routeStaticPath("/index.html", exists), { kind: "index" });
  assert.deepEqual(routeStaticPath("/assets/app.js", exists), { kind: "file", relativePath: "assets/app.js" });
  assert.deepEqual(routeStaticPath("/desk", exists), { kind: "index" });
  assert.deepEqual(routeStaticPath("/?tab=hub", exists), { kind: "index" });
});

test("preview and monaco never fall back to index.html — a missing file is a 404, mirroring vercel.json", () => {
  assert.deepEqual(routeStaticPath("/preview/embed.html", exists), { kind: "file", relativePath: "preview/embed.html" });
  assert.deepEqual(routeStaticPath("/preview/missing.html", exists), { kind: "forbidden" });
  assert.deepEqual(routeStaticPath("/monaco/vs/missing.js", exists), { kind: "forbidden" });
  assert.deepEqual(routeStaticPath("/robots.txt", exists), { kind: "forbidden" });
});

test("path traversal and NUL bytes are refused before any filesystem call", () => {
  const spy = (relativePath: string) => {
    assert.doesNotMatch(relativePath, /\.\./, "exists() must never see a traversal");
    return files.has(relativePath);
  };
  assert.deepEqual(routeStaticPath("/../package.json", spy), { kind: "forbidden" });
  assert.deepEqual(routeStaticPath("/assets/../../package.json", spy), { kind: "forbidden" });
  assert.deepEqual(routeStaticPath("/%2e%2e/package.json", spy), { kind: "forbidden" });
  assert.deepEqual(routeStaticPath("/assets/app.js%00.html", spy), { kind: "forbidden" });
  assert.deepEqual(routeStaticPath("/%E0%A4%A", spy), { kind: "forbidden" });
});

test("mime types cover what vite emits", () => {
  assert.equal(mimeTypeFor("assets/app.js"), "text/javascript; charset=utf-8");
  assert.equal(mimeTypeFor("assets/app.css"), "text/css; charset=utf-8");
  assert.equal(mimeTypeFor("monaco/vs/editor.woff2"), "font/woff2");
  assert.equal(mimeTypeFor("weird.bin"), "application/octet-stream");
});

test("the renderer is served vercel.json's own COOP/COEP/CSP for / and /desk, minus HSTS", () => {
  const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  for (const path of ["/", "/desk"]) {
    const headers = rendererHeaders(resolveHeadersForPath(config, path) as Record<string, string>);
    assert.ok(headers["content-security-policy"], `${path} has a CSP`);
    assert.ok(headers["cross-origin-opener-policy"], `${path} has COOP`);
    assert.ok(headers["cross-origin-embedder-policy"], `${path} has COEP`);
    assert.equal("strict-transport-security" in headers, false, "HSTS is meaningless on quantora://");
  }
  const desk = rendererHeaders(resolveHeadersForPath(config, "/desk") as Record<string, string>);
  assert.equal(desk["cross-origin-opener-policy"], "same-origin");
});
