import fs from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { crossOriginHeadersForPath } from './src/lib/vercel-headers.js';

function copyMonacoAssets() {
  const vsSrc = path.resolve('node_modules/monaco-editor/min/vs');
  return {
    name: 'copy-monaco-assets',
    closeBundle() {
      fs.cpSync(vsSrc, path.resolve('dist/monaco/vs'), { recursive: true });
    },
  };
}

/*
 * Serve the SAME cross-origin isolation headers vercel.json serves, derived
 * from that file rather than hand-copied here.
 *
 * Hand-copying is what broke the Preview shell: vercel.json gave /preview/*
 * CORP but not COEP, while this dev server applied COEP to the whole origin.
 * Under COEP require-corp a browser refuses to load a nested document that has
 * no COEP of its own, so the shell iframe was blocked in production only —
 * dev worked, every browser gate (which runs against `vite preview`) passed,
 * and the bug was invisible until it reached users. Deriving the headers means
 * dev and prod cannot disagree again.
 *
 * CSP is deliberately NOT mirrored: production's policy forbids the eval and
 * websocket traffic Vite needs for HMR.
 */
function vercelParityHeaders() {
  const config = JSON.parse(
    fs.readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
  );
  const apply = (req, res, next) => {
    const url = String(req.url || '').split('?')[0];
    // Static assets and module requests fall into the catch-all rule, same as
    // production; /preview/* and /desk get their own rules from the file.
    const headers = crossOriginHeadersForPath(config, url);
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    // Vite writes its own COOP later in the chain; keep the resolved value.
    const opener = headers['Cross-Origin-Opener-Policy'];
    if (opener) {
      const original = res.setHeader.bind(res);
      res.setHeader = (name, value) => (
        String(name).toLowerCase() === 'cross-origin-opener-policy'
          ? original(name, opener)
          : original(name, value)
      );
    }
    next();
  };
  return {
    name: 'vercel-parity-headers',
    configureServer(server) {
      server.middlewares.use(apply);
    },
    configurePreviewServer(server) {
      server.middlewares.use(apply);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [vercelParityHeaders(), react(), tailwindcss(), copyMonacoAssets()],
    /*
     * State the browsers this app actually runs on.
     *
     * Vite 6 defaults build.target to "modules" — chrome87, firefox78,
     * safari14, edge88 — and nothing here overrode it, so the project declared
     * support it does not have. react-markdown ships three bare, un-guarded
     * `Object.hasOwn` calls into the bundle, and that needs Chrome 93 /
     * Firefox 92 / Safari 15.4. On anything older the desk threw before it
     * finished rendering; the config simply said otherwise.
     *
     * These numbers are the measured floor of the dependency tree, not a
     * preference. Deliberately not raised further: a higher target would let
     * esbuild emit syntax that breaks browsers which run the app today, and
     * "honest" means declaring what works, not the newest thing available.
     *
     * Re-measure before lowering, and when a dependency bump adds a newer
     * built-in. `structuredClone` is already in the bundle at Chrome 98 but
     * does not count — it is feature-detected with a fallback, which is the
     * distinction that matters: a bare call sets the floor, a guarded one
     * does not.
     */
    build: {
      target: ['es2022', 'chrome93', 'edge93', 'firefox92', 'safari15.4'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
    server: {
      // Cross-origin headers come from vercel.json via vercelParityHeaders().
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? undefined : {},
    },
  };
});
