/*
 * Privacy-safe website traffic telemetry.
 *
 * This module never stores IP addresses, cookies, user ids, referrers, paths,
 * or browser fingerprints. It increments one hourly aggregate counter through
 * a service-role-only RPC. The counter therefore means page/app loads while no
 * Quantora session existed; it is deliberately NOT labelled as unique users.
 */

const WRITE_TIMEOUT_MS = 800;

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/**
 * Keep the executive "signed-out website loads" number about normal browsers,
 * not every client that happens to ask the session endpoint.
 */
export function shouldCountSignedOutBrowserHit(userAgent: unknown): boolean {
  const value = String(userAgent || "");
  if (!/Mozilla\//i.test(value)) return false;
  if (/Electron|QuantoraDesktop/i.test(value)) return false;
  if (/bot|crawler|spider|slurp|headless|lighthouse|monitor|uptime/i.test(value)) return false;
  return true;
}

export async function recordSignedOutSiteHit(): Promise<void> {
  // Preview/dev/browser-gate traffic must never inflate the production metric.
  if (process.env.VERCEL_ENV !== "production") return;

  const cfg = config();
  if (!cfg) return;

  /*
   * Await this short write instead of firing it after the response. Serverless
   * runtimes do not promise to keep executing once a handler returns, so a
   * detached fetch would make the very counter we call "measured" lossy. The
   * timeout keeps telemetry fail-soft: a slow store may cost at most 800 ms and
   * can never turn a signed-out landing load into an auth failure.
   */
  try {
    const response = await fetch(`${cfg.url}/rest/v1/rpc/record_signed_out_hit`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: "{}",
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`Supabase POST rpc/record_signed_out_hit -> ${response.status}`);
    }
  } catch (err: any) {
    console.warn("Signed-out traffic telemetry failed:", err?.message || err);
  }
}
