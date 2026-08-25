#!/usr/bin/env node
/**
 * Deployed shop Preview act against an HTTPS Vercel deployment.
 *
 * Requires the same secrets as deployed-golden-transactions:
 *   QUANTORA_E2E_BASE_URL, VERCEL_AUTOMATION_BYPASS_SECRET
 * Optional: QUANTORA_GOLDEN_CANARY_TOKEN, QUANTORA_DEPLOYMENT_SHA
 *
 * Hits `${BASE}/preview/embed.html` (path-first prod shell). Full /desk stays
 * behind Vercel protection (403 without bypass) — see docs/SHOP_PREVIEW_PROD_CHECKLIST.md.
 */
import { runShopPreviewActGate } from './shop-preview-act-gate.mjs';

await runShopPreviewActGate({ requireDeployed: true }).catch((error) => {
  console.error('Deployed shop preview act FAILED:', error?.stack || error);
  process.exitCode = 1;
});
