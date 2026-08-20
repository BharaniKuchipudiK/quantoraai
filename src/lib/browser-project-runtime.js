const SCRIPT_EXTENSIONS = ['.jsx', '.tsx', '.js', '.ts', '.mjs', '.cjs'];
const STYLE_EXTENSIONS = ['.css'];

function normalizePath(value) {
  const raw = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function dirname(path) {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

function extname(path) {
  const normalized = normalizePath(path);
  const base = normalized.split('/').pop() || '';
  const index = base.lastIndexOf('.');
  return index >= 0 ? base.slice(index).toLowerCase() : '';
}

function fileText(file) {
  if (typeof file === 'string') return file;
  return String(file?.content ?? file?.code ?? '');
}

export function normalizeProjectFiles(vfs = {}) {
  const files = {};
  for (const [rawPath, file] of Object.entries(vfs || {})) {
    const path = normalizePath(rawPath);
    if (!path) continue;
    files[path] = fileText(file);
  }
  return files;
}

function parsePackage(files) {
  try {
    return JSON.parse(files['package.json'] || '{}');
  } catch {
    return {};
  }
}

function packageNameForSpecifier(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

function cleanVersion(value) {
  const text = String(value || '').trim();
  const match = text.match(/\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?/);
  return match?.[0] || '';
}

function externalModuleUrl(specifier, pkg) {
  const packageName = packageNameForSpecifier(specifier);
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.peerDependencies || {}) };
  const version = cleanVersion(deps[packageName]);
  const suffix = specifier.slice(packageName.length);
  const versioned = `${packageName}${version ? `@${version}` : ''}${suffix}`;
  const params = packageName === 'react' || packageName === 'react-dom'
    ? '?dev=false'
    : '?external=react,react-dom,react%2Fjsx-runtime';
  return `https://esm.sh/${versioned}${params}`;
}

function candidatePaths(base) {
  const ext = extname(base);
  if (ext) return [base];
  return [
    base,
    ...SCRIPT_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...STYLE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SCRIPT_EXTENSIONS.map((extension) => `${base}/index${extension}`),
    ...STYLE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ];
}

function resolveLocalSpecifier(fromPath, specifier, files) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;
  const base = specifier.startsWith('/')
    ? normalizePath(specifier)
    : normalizePath(`${dirname(fromPath)}/${specifier}`);
  return candidatePaths(base).find((candidate) => Object.prototype.hasOwnProperty.call(files, candidate)) || null;
}

function entryFromIndex(files) {
  const html = files['index.html'] || '';
  const match = html.match(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/i)
    || html.match(/<script\b[^>]*src=["']([^"']+)["'][^>]*type=["']module["'][^>]*>/i);
  if (!match?.[1]) return null;
  return normalizePath(match[1]);
}

export function resolveBrowserProjectEntry(vfs = {}) {
  const files = normalizeProjectFiles(vfs);
  const explicit = entryFromIndex(files);
  if (explicit && files[explicit]) return explicit;
  const preferred = [
    'src/main.jsx', 'src/main.tsx', 'src/main.js', 'src/main.ts',
    'src/index.jsx', 'src/index.tsx', 'src/index.js', 'src/index.ts',
    'main.jsx', 'main.tsx', 'main.js', 'main.ts',
    'App.jsx', 'App.tsx', 'App.js', 'App.ts',
  ];
  return preferred.find((path) => files[path]) || null;
}

export function isBrowserProjectVfs(vfs = {}) {
  const files = normalizeProjectFiles(vfs);
  return Boolean(files['package.json'] && resolveBrowserProjectEntry(files));
}

function stripLocalStyleImports(code, fromPath, files) {
  return code.replace(/(^|\n)\s*import\s+(?:[^'";]+?\s+from\s+)?["']([^"']+\.css)["']\s*;?/g, (full, prefix, specifier) => {
    const resolved = resolveLocalSpecifier(fromPath, specifier, files);
    return resolved ? prefix : full;
  });
}

function rewriteImports(code, fromPath, files, externals) {
  const importPattern = /((?:from\s*|import\s*\(|import\s*)["'])([^"']+)(["'])/g;
  return code.replace(importPattern, (full, before, specifier, after) => {
    const local = resolveLocalSpecifier(fromPath, specifier, files);
    if (local) {
      if (STYLE_EXTENSIONS.includes(extname(local))) return full;
      return `${before}@quantora/${local}${after}`;
    }
    if (specifier.startsWith('.') || specifier.startsWith('/')) return full;
    externals.add(specifier);
    return full;
  });
}

function transformScript(path, source, files, ts, externals) {
  const extension = extname(path);
  const jsx = extension === '.jsx' || extension === '.tsx';
  const result = ts.transpileModule(stripLocalStyleImports(source, path, files), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      jsx: jsx ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
    fileName: path,
    reportDiagnostics: false,
  });
  return rewriteImports(result.outputText, path, files, externals);
}

function dataModuleUrl(code) {
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
}

function collectStyles(files) {
  const styles = Object.entries(files)
    .filter(([path]) => STYLE_EXTENSIONS.includes(extname(path)))
    .map(([, source]) => source)
    .join('\n\n')
    .replace(/@tailwind\s+(?:base|components|utilities)\s*;?/gi, '')
    .replace(/@import\s+["']tailwindcss["']\s*;?/gi, '');
  return styles;
}

function cleanIndexHtml(source) {
  const html = source || '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
  return html
    .replace(/<script\b[^>]*type=["']module["'][^>]*src=["'][^"']+["'][^>]*>\s*<\/script>/gi, '')
    .replace(/<script\b[^>]*src=["'][^"']+["'][^>]*type=["']module["'][^>]*>\s*<\/script>/gi, '')
    .replace(/<link\b[^>]*href=["'][^"']+\.css["'][^>]*>/gi, '');
}

function insertBeforeClosingTag(html, tag, content) {
  const pattern = new RegExp(`</${tag}>`, 'i');
  if (pattern.test(html)) return html.replace(pattern, `${content}</${tag}>`);
  return `${html}${content}`;
}

function escapeHtmlAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function compileBrowserProject(vfs, ts) {
  const files = normalizeProjectFiles(vfs);
  const entry = resolveBrowserProjectEntry(files);
  if (!entry) throw new Error('No browser entry file was found.');
  if (!ts?.transpileModule || !ts?.ModuleKind) throw new Error('The browser compiler is unavailable.');

  const pkg = parsePackage(files);
  const externals = new Set();
  const imports = {};

  for (const [path, source] of Object.entries(files)) {
    if (!SCRIPT_EXTENSIONS.includes(extname(path))) continue;
    const transformed = transformScript(path, source, files, ts, externals);
    imports[`@quantora/${path}`] = dataModuleUrl(transformed);
  }

  for (const specifier of externals) imports[specifier] = externalModuleUrl(specifier, pkg);
  // React's automatic JSX runtime can be introduced by the TypeScript transform
  // even when the original source did not import it explicitly.
  for (const specifier of ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client']) {
    if (!imports[specifier]) imports[specifier] = externalModuleUrl(specifier, pkg);
  }

  const importMap = JSON.stringify({ imports }).replace(/</g, '\\u003c');
  const styles = collectStyles(files);
  const usesTailwind = Object.values(files).some((source) => /@tailwind\b|@import\s+["']tailwindcss["']/i.test(source))
    || Boolean(pkg.dependencies?.tailwindcss || pkg.devDependencies?.tailwindcss);

  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline' data: https://esm.sh https://cdn.tailwindcss.com",
    "style-src 'unsafe-inline' https:",
    "img-src data: blob: https:",
    "font-src data: https:",
    "connect-src https://esm.sh https://cdn.tailwindcss.com https:",
    "media-src data: blob: https:",
    "worker-src blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(csp)}">`,
    '<meta name="referrer" content="no-referrer">',
    usesTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : '',
    styles ? `<style>${styles.replace(/<\/style/gi, '<\\/style')}</style>` : '',
    `<script type="importmap">${importMap}</script>`,
  ].join('');

  const runner = `<script type="module">
window.addEventListener('error', (event) => parent.postMessage({ __quantoraProjectPreview: true, kind: 'error', message: String(event.message || 'Runtime error') }, '*'));
window.addEventListener('unhandledrejection', (event) => parent.postMessage({ __quantoraProjectPreview: true, kind: 'error', message: String(event.reason?.message || event.reason || 'Unhandled promise rejection') }, '*'));
try {
  await import(${JSON.stringify(`@quantora/${entry}`)});
  requestAnimationFrame(() => requestAnimationFrame(() => parent.postMessage({ __quantoraProjectPreview: true, kind: 'ready', bodyText: document.body?.innerText?.slice(0, 1000) || '' }, '*')));
} catch (error) {
  parent.postMessage({ __quantoraProjectPreview: true, kind: 'error', message: String(error?.message || error || 'Preview failed to start') }, '*');
}
</script>`;

  let html = cleanIndexHtml(files['index.html']);
  if (!/<head[\s>]/i.test(html)) html = `<head></head>${html}`;
  html = html.replace(/<head([^>]*)>/i, `<head$1>${head}`);
  html = insertBeforeClosingTag(html, 'body', runner);

  return { html, entry, imports, usesTailwind };
}
