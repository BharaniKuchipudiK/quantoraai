import type {} from 'workflow/nitro';
import { defineNitroConfig } from 'nitro/config';
export default defineNitroConfig({
  compatibilityDate: '2026-09-12',
  modules: ['workflow/nitro'],
  workflow: { runtime: 'nodejs24.x' },
  vercel: { entryFormat: 'node', functions: { maxDuration: 300 } },
  routes: { '/**': { handler: './index.ts', format: 'node' } },
});
