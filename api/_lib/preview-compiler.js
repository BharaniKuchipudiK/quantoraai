import path from 'node:path';
import { build } from 'esbuild';

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
  const harness = `var __quantoraCorrelationId=${correlation},__quantoraTerminal=false;function __quantoraReport(kind,message){if(__quantoraTerminal)return;__quantoraTerminal=true;try{parent.postMessage({__quantoraProjectPreview:true,kind:kind,message:message||null,correlationId:__quantoraCorrelationId},'*')}catch(_){}}window.addEventListener('error',function(e){__quantoraReport('error',e.message||'Preview runtime error')});window.addEventListener('unhandledrejection',function(e){var r=e.reason;__quantoraReport('error',(r&&r.message)||String(r||'Unhandled promise rejection'))});window.addEventListener('load',function(){var deadline=Date.now()+5000;(function check(){if(__quantoraTerminal)return;var root=document.getElementById('root');if(root&&root.hasChildNodes()){__quantoraReport('ready');return}if(Date.now()>=deadline){__quantoraReport('error','Preview loaded but the generated application rendered no content.');return}setTimeout(check,50)})()});`;
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

          return builder.resolve(args.path, {
            resolveDir: process.cwd(),
            kind: args.kind,
          });
        });

        builder.onLoad({ filter: /.*/, namespace: VFS_NAMESPACE }, (args) => ({
          contents: files.get(args.path) || '',
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
