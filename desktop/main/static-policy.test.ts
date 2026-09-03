import test from "node:test";
import assert from "node:assert/strict";
import { mimeTypeFor, routeStaticPath } from "./static-policy.ts";

const files = new Set(["index.html", "assets/app.js", "monaco/vs/loader.js"]);
const exists = (relativePath: string) => files.has(relativePath);

test("real files are served, unknown app routes fall back to the SPA shell", () => {
  assert.deepEqual(routeStaticPath("/", exists), { kind: "index" });
  assert.deepEqual(routeStaticPath("/index.html", exists), { kind: "index" });
  assert.deepEqual(routeStaticPath("/assets/app.js", exists), { kind: "file", relativePath: "assets/app.js" });
  assert.deepEqual(routeStaticPath("/desk", exists), { kind: "index" });
  assert.deepEqual(routeStaticPath("/?tab=hub", exists), { kind: "index" });
});

test("assets and monaco never fall back to index.html — a missing file is a 404", () => {
  assert.deepEqual(routeStaticPath("/monaco/vs/loader.js", exists), { kind: "file", relativePath: "monaco/vs/loader.js" });
  assert.deepEqual(routeStaticPath("/assets/missing.js", exists), { kind: "forbidden" });
  assert.deepEqual(routeStaticPath("/monaco/vs/missing.js", exists), { kind: "forbidden" });
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
