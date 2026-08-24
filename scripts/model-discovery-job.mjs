#!/usr/bin/env node
/**
 * Model discovery + canary promotion job.
 *
 * Production already schedules this path via Vercel cron (vercel.json):
 *   GET /api/models  daily at 03:15 UTC
 * with header: Authorization: Bearer $CRON_SECRET
 *
 * That handler runs scanModelCatalog() (catalogue sync + bounded canaries).
 *
 * Manual / ops usage (same contract):
 *
 *   MODEL_DISCOVERY_URL=https://quantoraai.app/api/models \
 *   CRON_SECRET=... \
 *   node scripts/model-discovery-job.mjs
 *
 * Or with APP_URL (appends /api/models):
 *
 *   APP_URL=https://quantoraai.app CRON_SECRET=... node scripts/model-discovery-job.mjs
 *
 * Requires: OPENROUTER_API_KEY (canaries), SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (registry), CRON_SECRET (auth). GEMINI_API_KEY is optional for admin internet lists.
 */
function resolveDiscoveryUrl() {
  if (process.env.MODEL_DISCOVERY_URL) {
    const raw = process.env.MODEL_DISCOVERY_URL.replace(/\/+$/, '');
    return raw.endsWith('/api/models') ? raw : `${raw}/api/models`;
  }
  if (process.env.APP_URL) {
    return `${process.env.APP_URL.replace(/\/+$/, '')}/api/models`;
  }
  return null;
}

const url = resolveDiscoveryUrl();
const secret = process.env.CRON_SECRET;

if (!url || !secret) {
  console.error('Set MODEL_DISCOVERY_URL (or APP_URL) and CRON_SECRET.');
  process.exit(1);
}

const response = await fetch(url, {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${secret}`,
    Accept: 'application/json',
  },
});

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error('Discovery failed', response.status, body);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: body.ok === true,
  scannedAt: body.scannedAt,
  freeModels: body.freeModels,
  changes: body.changes,
  events: body.events,
  canaries: body.canaries,
  telemetryPurged: body.telemetryPurged,
}, null, 2));
