import path from 'node:path';
import { build } from 'esbuild';
import { DESK_PROBE_FN_SOURCE } from '../../src/lib/desk-probe-script.js';

const MAX_FILES = 80;
const MAX_SOURCE_BYTES = 750_000;
const VFS_NAMESPACE = 'quantora-preview-vfs';
const ENTRY_TOKEN = 'quantora-preview-entry';
const ALLOWED_BROWSER_PACKAGES = new Set([
  'react',
  'react-dom',
  'lucide-react',
  'framer-motion',
  'recharts',
]);

function fileContent(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.content === 'string') return value.content;
  if (value && typeof value.code === 'string') return value.code;
  return '';
}

function normalizePath(value = '') {
  const normalized = path.posix.normalize(String(value || '').replace(/\\/g, '/').replace(/^\/+/, ''));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

function loaderFor(filePath = '') {
  const ext = path.posix.extname(filePath).toLowerCase();
  if (ext === '.jsx') return 'jsx';
  if (ext === '.tsx') return 'tsx';
  if (ext === '.ts') return 'ts';
  if (ext === '.css') return 'css';
  if (ext === '.json') return 'json';
  if (ext === '.svg') return 'dataurl';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'dataurl';
  return 'js';
}

/**
 * The automatic JSX transform removes the need to import React for JSX, but
 * generated entry files still need a real binding when they explicitly use
 * React.StrictMode (or another React.* API). Keep the authored VFS untouched;
 * this is a compile-time compatibility shim for the preview only.
 */
export function ensureReactNamespaceBinding(source = '', filePath = '') {
  const content = String(source || '');
  if (!/\.(?:jsx?|tsx?)$/i.test(String(filePath || ''))) return content;
  if (!/\bReact\s*\./.test(content)) return content;
  const hasBinding = /\bimport\s+React(?:\s*,\s*\{[\s\S]*?\})?\s+from\s+['"]react['"]/.test(content)
    || /\bimport\s+\*\s+as\s+React\s+from\s+['"]react['"]/.test(content)
    || /\bimport\s*\{[^}]*\bdefault\s+as\s+React\b[^}]*\}\s+from\s+['"]react['"]/.test(content)
    || /^[ \t]*import\s+React\s*=\s*require\s*\(\s*['"]react['"]\s*\)/m.test(content)
    || /^[ \t]*(?:const|let|var|class|function)\s+React\b/m.test(content);
  return hasBinding ? content : `import React from 'react';\n${content}`;
}

/*
 * The React 17 mount on the React 19 runtime.
 *
 * Production, 2026-09-05 (run 33998084340): with Gemini refusing, a fallback
 * engine built the website transaction with `import ReactDOM from 'react-dom';
 * ReactDOM.render(<App />, root)`. build-artifact-contract.ts counts that as a
 * mount; project-runtime-preview.js sees "its own mount" and injects none; so
 * the project reached the iframe as written — where react-dom 19 has no
 * `render`, and the preview died before its h1 with
 * "Uncaught TypeError: re.default.render is not a function". Two surfaces
 * accepted the artifact and the runtime refused it.
 *
 * Like ensureReactNamespaceBinding, this is a preview-only compatibility shim:
 * a bare `react-dom` import resolves to a module that carries the legacy API
 * (render, hydrate, unmountComponentAtNode) on top of react-dom/client, and
 * re-exports everything react-dom still has. `react-dom/client` is untouched,
 * so a createRoot project never pays for it. The authored files are not
 * rewritten.
 *
 * createLegacyReactDomApi is serialized into the preview bundle with
 * Function.prototype.toString, so the exact code that runs in the iframe is the
 * code the unit test exercises in Node.
 */
const LEGACY_REACT_DOM_NAMESPACE = 'quantora-preview-react-dom';

export function createLegacyReactDomApi(client, dom) {
  var ROOT_KEY = '__quantoraLegacyRoot';
  function settle(callback) {
    if (typeof callback === 'function') setTimeout(callback, 0);
  }
  function render(element, container, callback) {
    if (!container) throw new Error('ReactDOM.render needs a container element.');
    var root = container[ROOT_KEY];
    if (!root) {
      root = client.createRoot(container);
      container[ROOT_KEY] = root;
    }
    root.render(element);
    settle(callback);
    return null;
  }
  function hydrate(element, container, callback) {
    if (!container) throw new Error('ReactDOM.hydrate needs a container element.');
    var root = container[ROOT_KEY];
    if (!root) {
      root = client.hydrateRoot(container, element);
      container[ROOT_KEY] = root;
    }
    root.render(element);
    settle(callback);
    return null;
  }
  function unmountComponentAtNode(container) {
    var root = container && container[ROOT_KEY];
    if (!root) return false;
    root.unmount();
    delete container[ROOT_KEY];
    return true;
  }
  var namespace = Object.assign({}, dom && dom.default, dom, {
    render: render,
    hydrate: hydrate,
    unmountComponentAtNode: unmountComponentAtNode,
    createRoot: client.createRoot,
    hydrateRoot: client.hydrateRoot,
  });
  return { render: render, hydrate: hydrate, unmountComponentAtNode: unmountComponentAtNode, namespace: namespace };
}

const LEGACY_REACT_DOM_SHIM = `
import * as __quantoraReactDom from 'react-dom';
import * as __quantoraReactDomClient from 'react-dom/client';
${createLegacyReactDomApi.toString()}
const __quantoraLegacy = createLegacyReactDomApi(__quantoraReactDomClient, __quantoraReactDom);
export const render = __quantoraLegacy.render;
export const hydrate = __quantoraLegacy.hydrate;
export const unmountComponentAtNode = __quantoraLegacy.unmountComponentAtNode;
export const createRoot = __quantoraReactDomClient.createRoot;
export const hydrateRoot = __quantoraReactDomClient.hydrateRoot;
export * from 'react-dom';
export default __quantoraLegacy.namespace;
`;

function packageRoot(specifier = '') {
  const source = String(specifier || '').trim();
  if (!source || source.startsWith('.') || source.startsWith('/')) return null;
  if (source.startsWith('@')) {
    const [scope, name] = source.split('/');
    return scope && name ? `${scope}/${name}` : source;
  }
  return source.split('/')[0];
}

function normalizeVfs(vfs = {}) {
  if (!vfs || typeof vfs !== 'object' || Array.isArray(vfs)) throw new Error('Preview project is missing.');
  const entries = Object.entries(vfs);
  if (!entries.length) throw new Error('Preview project is empty.');
  if (entries.length > MAX_FILES) throw new Error(`Preview project exceeds ${MAX_FILES} files.`);

  const files = new Map();
  let totalBytes = 0;
  for (const [rawPath, value] of entries) {
    const filePath = normalizePath(rawPath);
    if (!filePath) continue;
    const content = fileContent(value);
    if (/\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\b/.test(content)) {
      throw new Error(`Preview project cannot use localStorage or sessionStorage inside the opaque-origin sandbox (${filePath}).`);
    }
    totalBytes += Buffer.byteLength(content, 'utf8');
    if (totalBytes > MAX_SOURCE_BYTES) throw new Error('Preview project is too large to compile safely.');
    files.set(filePath, content);
  }
  if (!files.size) throw new Error('Preview project has no compilable files.');
  return files;
}

function resolveLocalFile(files, importer, specifier) {
  const clean = String(specifier || '').split(/[?#]/)[0];
  const base = clean.startsWith('/')
    ? normalizePath(clean)
    : normalizePath(path.posix.join(path.posix.dirname(importer || ''), clean));
  if (!base) return null;

  const candidates = [
    base,
    `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, `${base}.json`, `${base}.css`,
    `${base}/index.js`, `${base}/index.jsx`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.css`,
  ];
  return candidates.find((candidate) => files.has(candidate)) || null;
}

function findEntry(files) {
  const preferred = [
    'src/main.jsx', 'src/main.tsx', 'src/main.js', 'src/main.ts',
    'src/App.jsx', 'src/App.tsx', 'src/App.js', 'src/App.ts',
  ];
  return preferred.find((candidate) => files.has(candidate))
    || [...files.keys()].find((candidate) => /\.(?:jsx|tsx|js|ts)$/i.test(candidate));
}

function escapeInlineScript(source = '') {
  return String(source).replace(/<\/script/gi, '<\\/script');
}

function escapeInlineStyle(source = '') {
  return String(source).replace(/<\/style/gi, '<\\/style');
}

function buildPreviewHtml(js, css = '', correlationId = null) {
  const correlation = JSON.stringify(typeof correlationId === 'string' ? correlationId : null);
  const harness = `var __quantoraCorrelationId=${correlation},__quantoraTerminal=false;function __quantoraReport(kind,message){if(__quantoraTerminal)return;__quantoraTerminal=true;try{parent.postMessage({__quantoraProjectPreview:true,kind:kind,message:message||null,correlationId:__quantoraCorrelationId},'*')}catch(_){}}function __quantoraDeskRun(){try{__quantoraDeskProbe(function(facts){try{parent.postMessage({__quantoraProjectPreview:true,kind:'desk-probe',facts:facts,correlationId:__quantoraCorrelationId},'*')}catch(_){}})}catch(_){}}window.addEventListener('error',function(e){__quantoraReport('error',e.message||'Preview runtime error')});window.addEventListener('unhandledrejection',function(e){var r=e.reason;__quantoraReport('error',(r&&r.message)||String(r||'Unhandled promise rejection'))});window.addEventListener('load',function(){var deadline=Date.now()+5000;(function check(){if(__quantoraTerminal)return;var root=document.getElementById('root');if(root&&root.hasChildNodes()){__quantoraReport('ready');__quantoraDeskRun();return}if(Date.now()>=deadline){__quantoraReport('error','Preview loaded but the generated application rendered no content.');return}setTimeout(check,50)})()});
${DESK_PROBE_FN_SOURCE}`;
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: https:; font-src data:; connect-src https:; media-src data: blob: https:;"><style>html,body,#root{min-height:100%;margin:0}*{box-sizing:border-box}${escapeInlineStyle(css)}</style></head><body><div id="root"></div><script>${harness}</script><script>${escapeInlineScript(js)}</script></body></html>`;
}

export async function compilePreviewVfs(vfs = {}, options = {}) {
  const files = normalizeVfs(vfs);
  const entry = findEntry(files);
  if (!entry) throw new Error('Preview project has no JavaScript/TypeScript entry file.');

  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [ENTRY_TOKEN],
    bundle: true,
    write: false,
    outdir: 'out',
    entryNames: 'app',
    platform: 'browser',
    format: 'iife',
    target: ['es2020'],
    jsx: 'automatic',
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    treeShaking: true,
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': '"production"',
      'global': 'globalThis',
    },
    plugins: [{
      name: 'quantora-preview-vfs',
      setup(builder) {
        builder.onResolve({ filter: /^quantora-preview-entry$/ }, () => ({ path: entry, namespace: VFS_NAMESPACE }));

        builder.onResolve({ filter: /.*/, namespace: VFS_NAMESPACE }, async (args) => {
          if (args.path.startsWith('.') || args.path.startsWith('/')) {
            const resolved = resolveLocalFile(files, args.importer, args.path);
            if (!resolved) return { errors: [{ text: `Missing local preview module: ${args.path}` }] };
            return { path: resolved, namespace: VFS_NAMESPACE };
          }

          const root = packageRoot(args.path);
          if (!root || !ALLOWED_BROWSER_PACKAGES.has(root)) {
            return { errors: [{ text: `Unsupported preview dependency: ${args.path}` }] };
          }

          // Bare `react-dom` carries the React 17 API on the React 19 runtime;
          // `react-dom/client` and everything else resolve to the real package.
          if (args.path === 'react-dom') {
            return { path: 'react-dom', namespace: LEGACY_REACT_DOM_NAMESPACE };
          }

          return builder.resolve(args.path, {
            resolveDir: process.cwd(),
            kind: args.kind,
          });
        });

        // The shim's own imports must reach the real react-dom, never itself.
        builder.onResolve({ filter: /.*/, namespace: LEGACY_REACT_DOM_NAMESPACE }, (args) => builder.resolve(args.path, {
          resolveDir: process.cwd(),
          kind: args.kind,
        }));

        builder.onLoad({ filter: /.*/, namespace: LEGACY_REACT_DOM_NAMESPACE }, () => ({
          contents: LEGACY_REACT_DOM_SHIM,
          loader: 'js',
          resolveDir: process.cwd(),
        }));

        builder.onLoad({ filter: /.*/, namespace: VFS_NAMESPACE }, (args) => ({
          contents: ensureReactNamespaceBinding(files.get(args.path) || '', args.path),
          loader: loaderFor(args.path),
          resolveDir: process.cwd(),
        }));
      },
    }],
  });

  const javascript = result.outputFiles?.find((file) => /\.js$/i.test(file.path))?.text || '';
  const css = result.outputFiles?.find((file) => /\.css$/i.test(file.path))?.text || '';
  if (!javascript) throw new Error('Preview compiler produced no runnable JavaScript.');

  return {
    html: buildPreviewHtml(javascript, css, options.correlationId),
    javascriptBytes: Buffer.byteLength(javascript, 'utf8'),
    cssBytes: Buffer.byteLength(css, 'utf8'),
    entry,
    correlationId: typeof options.correlationId === 'string' ? options.correlationId : null,
  };
}
