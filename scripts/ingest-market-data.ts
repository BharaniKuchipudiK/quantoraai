/**
 * Entry point for the Market Data Ingestion workflow (ADR-025, P1).
 *
 * Safe by default: if Supabase is not configured (no repo secrets yet) it prints
 * a notice and exits 0 — so a scheduled run is a clean no-op, never a red X,
 * until you wire SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Exits non-zero only
 * if every provider failed, so a partial pull still counts as success.
 */

import { isMarketDataStoreConfigured } from "../api/_lib/market-data-store.js";
import { runIngestion } from "../api/_lib/market-data/ingest.js";

async function main(): Promise<void> {
  if (!isMarketDataStoreConfigured()) {
    console.log(
      "[market-data] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping ingestion (no-op).",
    );
    return;
  }

  const outcomes = await runIngestion();
  for (const o of outcomes) {
    const counts = `instruments=${o.wrote.instruments} fx=${o.wrote.fxRates} fundamentals=${o.wrote.fundamentals}`;
    console.log(`[market-data] ${o.provider}: ${o.ok ? "ok" : "FAILED"} — ${counts}${o.error ? ` (${o.error})` : ""}`);
  }

  const allFailed = outcomes.length > 0 && outcomes.every((o) => !o.ok);
  if (allFailed) {
    console.error("[market-data] every provider failed.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[market-data] fatal:", err?.message || err);
  process.exitCode = 1;
});
