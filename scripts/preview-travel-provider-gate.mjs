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

// Safe Preview auth diagnostics: booleans only, never secret values.
console.log('Preview auth configuration:');
console.log(`  VITE_GOOGLE_CLIENT_ID=${Boolean(String(process.env.VITE_GOOGLE_CLIENT_ID || '').trim())}`);
console.log(`  GOOGLE_CLIENT_ID=${Boolean(String(process.env.GOOGLE_CLIENT_ID || '').trim())}`);
console.log(`  SESSION_SECRET=${Boolean(String(process.env.SESSION_SECRET || '').trim())}`);
console.log(`  SUPABASE_URL=${Boolean(String(process.env.SUPABASE_URL || '').trim())}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY=${Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim())}`);

console.log('Running PR #187 live Duffel provider gate with Vercel Preview credentials...');
await import('./travel-provider-canary.mjs');
