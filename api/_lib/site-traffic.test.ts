import assert from "node:assert/strict";
import test from "node:test";
import { recordSignedOutSiteHit, shouldCountSignedOutBrowserHit } from "./site-traffic.js";

const CHROME_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

test("signed-out website-hit policy counts normal browsers only", () => {
  assert.equal(shouldCountSignedOutBrowserHit(CHROME_UA), true);
  assert.equal(shouldCountSignedOutBrowserHit(`${CHROME_UA} Electron/39.0.0 QuantoraDesktop/1.0`), false);
  assert.equal(shouldCountSignedOutBrowserHit("curl/8.7.1"), false);
  assert.equal(shouldCountSignedOutBrowserHit("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), false);
  assert.equal(shouldCountSignedOutBrowserHit("Mozilla/5.0 HeadlessChrome/140.0.0.0 Safari/537.36"), false);
});

test("signed-out hit writer never records preview traffic", async () => {
  const originalEnv = process.env.VERCEL_ENV;
  const originalFetch = globalThis.fetch;
  try {
    process.env.VERCEL_ENV = "preview";
    globalThis.fetch = (async () => {
      throw new Error("preview traffic must not write");
    }) as typeof fetch;

    await recordSignedOutSiteHit();
  } finally {
    if (originalEnv == null) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test("production signed-out hit writer awaits the aggregate RPC and sends no visitor data", async () => {
  const originals = {
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: globalThis.fetch,
  };
  let call: { url: string; init?: RequestInit } | null = null;

  try {
    process.env.VERCEL_ENV = "production";
    process.env.SUPABASE_URL = "https://example.supabase.co/";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      call = { url: String(input), init };
      return { ok: true, status: 204 } as Response;
    }) as typeof fetch;

    await recordSignedOutSiteHit();

    assert.ok(call);
    assert.equal(call.url, "https://example.supabase.co/rest/v1/rpc/record_signed_out_hit");
    assert.equal(call.init?.method, "POST");
    assert.equal(call.init?.body, "{}");
    const headers = call.init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer service-role-test-key");
    assert.equal(headers.apikey, "service-role-test-key");
    assert.equal(JSON.stringify(call.init).includes("user"), false);
    assert.equal(JSON.stringify(call.init).includes("cookie"), false);
    assert.equal(JSON.stringify(call.init).includes("referrer"), false);
  } finally {
    if (originals.vercelEnv == null) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originals.vercelEnv;
    if (originals.supabaseUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originals.supabaseUrl;
    if (originals.serviceKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originals.serviceKey;
    globalThis.fetch = originals.fetch;
  }
});
