import { defineNitroConfig } from 'nitro/config';
export default defineNitroConfig({ compatibilityDate: '2026-09-12', modules: ['workflow/nitro'], rolldownConfig: { external: ['@workflow/world-local'] }, traceDeps: ['@workflow/world-local'], routes: { '/**': { handler: './index.ts', format: 'node' } } });
