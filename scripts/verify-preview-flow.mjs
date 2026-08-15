import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { injectPreviewHarness } from '../src/lib/preview-utils.js';

const logPath = join(dirname(fileURLToPath(import.meta.url)), '../.cursor/debug-d0f2b5.log');
mkdirSync(dirname(logPath), { recursive: true });

const sampleHtml = `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><nav class="hidden md:flex">Desktop</nav><nav class="md:hidden">Mobile</nav></body></html>`;
const harnessed = injectPreviewHarness(sampleHtml);

const probeMatch = harnessed.match(/getElementById\('__quantora_tailwind_probe'\)/);
const probeElMatch = harnessed.match(/id="__quantora_tailwind_probe"/);

const escapeMatch = harnessed.match(/preview-close-request/);

appendFileSync(logPath, `${JSON.stringify({
  sessionId: 'd0f2b5',
  runId: 'preview-close-v9',
  location: 'scripts/verify-preview-flow.mjs',
  message: 'harness escape check',
  data: {
    hasDedicatedProbeId: Boolean(probeMatch && probeElMatch),
    hasEscapeForward: Boolean(escapeMatch),
    usesOldHiddenSelector: /querySelector\('\.hidden'\)/.test(harnessed),
    htmlLength: harnessed.length,
  },
  timestamp: Date.now(),
  hypothesisId: 'preview-close-iframe',
})}\n`);

console.log('wrote harness verification log');
