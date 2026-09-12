import { defineNitroConfig } from 'nitro/config';
export default defineNitroConfig({
  compatibilityDate: '2026-09-12',
  modules: ['workflow/nitro'],
  vercel: { entryFormat: 'node', functions: { maxDuration: 300 } },
  routes: { '/**': { handler: './index.ts', format: 'node' } },
});
