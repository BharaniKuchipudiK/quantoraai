import assert from "node:assert/strict";
import test from "node:test";
import { fetchResearchSourceText, htmlToText } from "./research-source-fetch.js";

function fakeResponse({
  status = 200,
  headers = {},
  body = "",
}: { status?: number; headers?: Record<string, string>; body?: string }): Response {
  const map = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null },
    text: async () => body,
  } as unknown as Response;
}

function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const key = String(input);
    const route = routes[key];
    if (!route) throw new Error(`unexpected fetch: ${key}`);
    return route();
  }) as typeof fetch;
}

test("htmlToText strips markup, scripts and entities into searchable prose", () => {
  const text = htmlToText(
    '<html><head><style>p{color:red}</style><script>steal()</script></head>' +
    "<body><h1>Report</h1><p>Solar &amp; wind cost &lt; nuclear.</p><!-- note --></body></html>",
  );
  assert.match(text, /Report/);
  assert.match(text, /Solar & wind cost < nuclear\./);
  assert.doesNotMatch(text, /steal|color:red|note/);
});

test("a textual page fetches and converts", async () => {
  const result = await fetchResearchSourceText(
    "https://www.example.com/report",
    fakeFetch({
      "https://www.example.com/report": () => fakeResponse({
        headers: { "content-type": "text/html; charset=utf-8" },
        body: "<p>The finding text lives here.</p>",
      }),
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.text, "The finding text lives here.");
});

test("redirects are followed with each hop re-admitted; an internal target is refused", async () => {
  const good = await fetchResearchSourceText(
    "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
    fakeFetch({
      "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc": () => fakeResponse({
        status: 302,
        headers: { location: "https://www.reuters.com/article" },
      }),
      "https://www.reuters.com/article": () => fakeResponse({
        headers: { "content-type": "text/plain" },
        body: "Publisher text.",
      }),
    }),
  );
  assert.equal(good.ok, true);
  if (good.ok) assert.equal(good.finalUrl, "https://www.reuters.com/article");

  const bad = await fetchResearchSourceText(
    "https://www.example.com/hop",
    fakeFetch({
      "https://www.example.com/hop": () => fakeResponse({
        status: 302,
        headers: { location: "https://169.254.169.254/latest/meta-data" },
      }),
    }),
  );
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.reason, "redirect_source_url_ip_literal");
});

test("non-textual, oversized, failing and looping sources report reasons instead of throwing", async () => {
  const pdf = await fetchResearchSourceText(
    "https://www.example.com/file.pdf",
    fakeFetch({
      "https://www.example.com/file.pdf": () => fakeResponse({
        headers: { "content-type": "application/pdf" },
        body: "%PDF",
      }),
    }),
  );
  assert.equal(pdf.ok, false);
  if (!pdf.ok) assert.equal(pdf.reason, "source_not_textual");

  const huge = await fetchResearchSourceText(
    "https://www.example.com/huge",
    fakeFetch({
      "https://www.example.com/huge": () => fakeResponse({
        headers: { "content-type": "text/plain", "content-length": String(10_000_000) },
        body: "x",
      }),
    }),
  );
  assert.equal(huge.ok, false);
  if (!huge.ok) assert.equal(huge.reason, "source_too_large");

  const down = await fetchResearchSourceText(
    "https://www.example.com/down",
    fakeFetch({
      "https://www.example.com/down": () => fakeResponse({ status: 503 }),
    }),
  );
  assert.equal(down.ok, false);
  if (!down.ok) assert.equal(down.reason, "source_http_503");

  const loop = await fetchResearchSourceText(
    "https://www.example.com/loop",
    fakeFetch({
      "https://www.example.com/loop": () => fakeResponse({
        status: 301,
        headers: { location: "https://www.example.com/loop" },
      }),
    }),
  );
  assert.equal(loop.ok, false);
  if (!loop.ok) assert.equal(loop.reason, "source_too_many_redirects");
});

test("an inadmissible URL never reaches the network", async () => {
  const result = await fetchResearchSourceText(
    "https://localhost/secrets",
    fakeFetch({}),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "source_url_internal_host");
});
