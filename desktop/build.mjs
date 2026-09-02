/*
 * Bundle the Electron main and preload entry points.
 *
 * Both must be single CommonJS files: a sandboxed preload cannot require
 * anything but `electron` at runtime, and the main process stays CJS so the
 * native modules (node-pty) load without ESM interop surprises. Everything
 * else — shared/ contracts, src/lib/vercel-headers.js — is inlined here.
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');
mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  define: { 'process.env.QUANTORA_DESKTOP_VERSION': JSON.stringify(process.env.npm_package_version || '0.0.0') },
};

await build({
  ...common,
  entryPoints: [join(here, 'main/index.ts')],
  outfile: join(out, 'main.cjs'),
  external: ['electron', 'node-pty', 'chokidar', 'electron-updater'],
});

await build({
  ...common,
  entryPoints: [join(here, 'preload/index.ts')],
  outfile: join(out, 'preload.cjs'),
  external: ['electron'],
});
