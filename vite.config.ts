import fs from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { isIsolatedStudioPath } from './src/lib/studio-isolation.js';

function copyMonacoAssets() {
  const vsSrc = path.resolve('node_modules/monaco-editor/min/vs');
  return {
    name: 'copy-monaco-assets',
    closeBundle() {
      fs.cpSync(vsSrc, path.resolve('dist/monaco/vs'), { recursive: true });
    },
  };
}

function isolatedDeskHeaders() {
  const apply = (req, res, next) => {
    const url = String(req.url || '').split('?')[0];
    if (url.startsWith('/preview/')) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    const isolated = isIsolatedStudioPath(url);
    const original = res.setHeader.bind(res);
    res.setHeader = (name, value) => {
      if (String(name).toLowerCase() === 'cross-origin-opener-policy' && isolated) {
        return original(name, 'same-origin');
      }
      return original(name, value);
    };
    if (isolated) original('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  };
  return {
    name: 'isolated-desk-headers',
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
    plugins: [isolatedDeskHeaders(), react(), tailwindcss(), copyMonacoAssets()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
      },
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? undefined : {},
    },
    preview: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
  };
});
