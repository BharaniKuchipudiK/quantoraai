#!/usr/bin/env node

// This gate intentionally runs only on the Travel provider Preview branch so
// Vercel-held provider credentials are exercised without exposing them to CI.
const isTargetPreview =
  process.env.VERCEL === '1' &&
  process.env.VERCEL_ENV === 'preview' &&
  process.env.VERCEL_GIT_COMMIT_REF === 'travel/provider-gateway-v1';

if (!isTargetPreview) {
  console.log('○ Travel provider live gate skipped outside PR #187 Preview.');
  process.exit(0);
}

console.log('Running PR #187 live Duffel provider gate with Vercel Preview credentials...');
await import('./travel-provider-canary.mjs');
