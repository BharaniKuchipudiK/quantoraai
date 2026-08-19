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

// Temporary auth diagnostic. Google OAuth web client IDs are public identifiers,
// but compare only a boolean so the build log remains minimal.
const productionGoogleClientId = '611965897691-f0438nl28r23au5lbc0t7naqub6f66j5.apps.googleusercontent.com';
const previewGoogleClientId = String(process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
console.log(`Preview Google OAuth client matches Production=${previewGoogleClientId === productionGoogleClientId}`);
console.log(`Preview SESSION_SECRET configured=${Boolean(String(process.env.SESSION_SECRET || '').trim())}`);

console.log('Running PR #187 live Duffel provider gate with Vercel Preview credentials...');
await import('./travel-provider-canary.mjs');
