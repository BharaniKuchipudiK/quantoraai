/*
 * Privacy-safe website traffic telemetry.
 *
 * This module never stores IP addresses, cookies, user ids, referrers, paths,
 * or browser fingerprints. It increments one hourly aggregate counter through
 * a service-role-only RPC. The counter therefore means page/app loads while no
 * Quantora session existed; it is deliberately NOT labelled as unique users.
 */

const WRITE_TIMEOUT_MS = 1_500;

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function recordSignedOutSiteHit(): void {
  // Preview/dev/browser-gate traffic must never inflate the production metric.
  if (process.env.VERCEL_ENV !== "production") return;

  const cfg = config();
  if (!cfg) return;

  void fetch(`${cfg.url}/rest/v1/rpc/record_signed_out_hit`, {
    method: "POST",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: "{}",
    signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
  }).then((response) => {
    if (!response.ok) {
      console.warn(`Supabase POST rpc/record_signed_out_hit -> ${response.status}`);
    }
  }).catch((err: any) => {
    console.warn("Signed-out traffic telemetry failed:", err?.message || err);
  });
}
