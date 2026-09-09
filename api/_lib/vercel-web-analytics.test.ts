import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchGrowthTraffic, summarizeGrowthTraffic } from "./vercel-web-analytics.js";

test("growth traffic uses visitor counts and keeps browser segments explicit", () => {
  const summary = summarizeGrowthTraffic({
    visits: { data: [{ timestamp: "2026-09-03", visitors: 20 }, { timestamp: "2026-09-04", visitors: 30 }] },
    authStates: { data: [
      { eventData: "signed_out", visitors: 32 },
      { eventData: "signed_in", visitors: 18 },
      { eventData: "unknown", visitors: 2 },
    ] },
    visitTypes: { data: [
      { eventData: "first_seen", visitors: 25 },
      { eventData: "returning", visitors: 15 },
      { eventData: "same_day", visitors: 10 },
    ] },
    studioActivations: { data: [{ timestamp: "2026-09-04", visitors: 9 }] },
  });

  assert.deepEqual(summary, {
    windowDays: 7,
    totalVisitors: 50,
    anonymousVisitors: 32,
    signedInVisitors: 18,
    returningVisitors: 15,
    firstTimeVisitors: 25,
    studioActivations: 9,
    anonymousToSignedInConversion: 36,
    signedInToStudioActivation: 50,
    source: "measured",
  });
});

test("empty analytics is a measured empty state, never an outage", () => {
  const summary = summarizeGrowthTraffic({
    visits: { data: [] },
    authStates: { data: [] },
    visitTypes: { data: [] },
    studioActivations: { data: [] },
  });

  assert.equal(summary.source, "no-rows");
  assert.equal(summary.totalVisitors, 0);
  assert.equal(summary.anonymousToSignedInConversion, null);
  assert.equal(summary.signedInToStudioActivation, null);
});

test("the Vercel reader queries only production data in the seven-day window", async () => {
  const requests: URL[] = [];
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-token");

    const by = url.searchParams.get("by");
    if (url.pathname.endsWith("/visits/aggregate")) {
      return Response.json({ data: [{ timestamp: "2026-09-09", visitors: 12 }] });
    }
    if (by === "eventData/auth_state") {
      return Response.json({ data: [{ eventData: "signed_out", visitors: 8 }, { eventData: "signed_in", visitors: 4 }] });
    }
    if (by === "eventData/visit_type") {
      return Response.json({ data: [{ eventData: "first_seen", visitors: 7 }, { eventData: "returning", visitors: 3 }] });
    }
    return Response.json({ data: [{ timestamp: "2026-09-09", visitors: 2 }] });
  };

  const result = await fetchGrowthTraffic(
    { token: "test-token", projectId: "quantora-platform", teamId: "team_quantora" },
    Date.parse("2026-09-09T12:00:00Z"),
    fetchFn as typeof fetch,
  );

  assert.equal(result.totalVisitors, 12);
  assert.equal(requests.length, 4);
  for (const url of requests) {
    assert.equal(url.searchParams.get("projectId"), "quantora-platform");
    assert.equal(url.searchParams.get("teamId"), "team_quantora");
    assert.equal(url.searchParams.get("since"), "2026-09-03");
    assert.equal(url.searchParams.get("until"), "2026-09-09");
    assert.match(url.searchParams.get("filter") || "", /environment eq 'production'/);
  }
});

test("one failed Vercel query makes the whole panel unavailable", async () => {
  let call = 0;
  const result = await fetchGrowthTraffic(
    { token: "test-token", projectId: "quantora-platform" },
    Date.parse("2026-09-09T12:00:00Z"),
    (async () => (++call === 2
      ? new Response("forbidden", { status: 403 })
      : Response.json({ data: [] }))) as typeof fetch,
  );

  assert.equal(result.source, "unavailable");
  assert.equal(result.totalVisitors, 0);
});

test("the existing admin metrics path renders the Vercel growth panel", () => {
  const handler = readFileSync(new URL("./handlers/admin-metrics.ts", import.meta.url), "utf8");
  assert.match(handler, /getGrowthTraffic\(/);
  assert.match(handler, /growthTraffic/);

  const dashboard = readFileSync(new URL("../../src/components/AdminDashboard.jsx", import.meta.url), "utf8");
  assert.match(dashboard, /growthTraffic=\{metrics\.growthTraffic\}/);

  const panel = readFileSync(new URL("../../src/components/ProductAnalyticsPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /<GrowthTrafficPanel growthTraffic=\{growthTraffic\}/);
});
