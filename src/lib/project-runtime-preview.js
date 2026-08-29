function fileContent(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.content === 'string') return value.content;
  if (value && typeof value.code === 'string') return value.code;
  return '';
}

const RUNTIME_DEPENDENCY_VERSIONS = Object.freeze({
  react: '^18.2.0',
  'react-dom': '^18.2.0',
  'lucide-react': '^0.546.0',
  'framer-motion': '^12.23.12',
  recharts: '^3.1.2',
});

function barePackageName(specifier = '') {
  const source = String(specifier || '').trim();
  if (!source || source.startsWith('.') || source.startsWith('/') || source.startsWith('@/') || source.startsWith('~')) return null;
  if (source.startsWith('@')) {
    const [scope, name] = source.split('/');
    return scope && name ? `${scope}/${name}` : null;
  }
  return source.split('/')[0] || null;
}

function importedSpecifiers(code = '') {
  const source = String(code || '');
  const pattern = /(?:import\s+(?:[^'\"]+?\s+from\s+)?|import\s*)['\"]([^'\"]+)['\"]/g;
  return Array.from(source.matchAll(pattern), (match) => match[1]).filter(Boolean);
}

function normalizeVirtualPath(path = '') {
  const parts = [];
  for (const part of String(path || '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function resolveRelativeVirtualPath(entryPath, specifier) {
  const cleanSpecifier = String(specifier || '').replace(/[?#].*$/, '');
  const entryParts = String(entryPath || '').split('/');
  entryParts.pop();
  return normalizeVirtualPath([...entryParts, ...cleanSpecifier.split('/')].join('/'));
}

function existingStyleContent(existingVfs, resolvedPath, specifier) {
  const cleanSpecifier = String(specifier || '').replace(/[?#].*$/, '');
  const basename = cleanSpecifier.split('/').pop();
  const candidates = [
    resolvedPath,
    resolvedPath.replace(/^src\//, ''),
    cleanSpecifier.replace(/^\.\//, ''),
    basename,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(existingVfs || {}, candidate)) {
      return fileContent(existingVfs[candidate]);
    }
  }
  return '';
}

function hydrateRelativeStyles(files, code, entryPath, existingVfs) {
  for (const specifier of importedSpecifiers(code)) {
    const cleanSpecifier = String(specifier || '').replace(/[?#].*$/, '');
    if (!cleanSpecifier.startsWith('.') || !/\.css$/i.test(cleanSpecifier)) continue;

    const resolvedPath = resolveRelativeVirtualPath(entryPath, cleanSpecifier);
    if (!resolvedPath || files[resolvedPath]) continue;

    files[resolvedPath] = {
      content: existingStyleContent(existingVfs, resolvedPath, cleanSpecifier),
      language: 'css',
    };
  }
}

export function extractRuntimeDependencies(code = '') {
  const dependencies = { react: RUNTIME_DEPENDENCY_VERSIONS.react, 'react-dom': RUNTIME_DEPENDENCY_VERSIONS['react-dom'] };
  for (const specifier of importedSpecifiers(code)) {
    const pkg = barePackageName(specifier);
    if (!pkg || pkg === 'react' || pkg === 'react-dom') continue;
    dependencies[pkg] = RUNTIME_DEPENDENCY_VERSIONS[pkg] || 'latest';
  }
  return dependencies;
}

export function isInlineReactRuntimeCode(code = '') {
  const source = String(code || '');
  if (!source.trim()) return false;
  return /(?:from\s+['\"]react['\"]|import\s+React\b|useState\s*\(|useEffect\s*\(|export\s+default\s+(?:function|class)|ReactDOM\.createRoot\s*\(|createRoot\s*\(|<[A-Z][A-Za-z0-9_.:-]*(?:\s|\/?>))/m.test(source);
}

function ensureDefaultExport(code) {
  const source = String(code || '').trim();
  if (/export\s+default\b/.test(source)) return source;
  const functionMatch = source.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/);
  const constMatch = source.match(/(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/);
  const component = functionMatch?.[1] || constMatch?.[1];
  return component ? `${source}\n\nexport default ${component};\n` : source;
}

export function createInlineReactRuntimeVfs(code = '', existingVfs = {}) {
  if (!isInlineReactRuntimeCode(code)) return null;
  if (isProjectRuntimeVfs(existingVfs)) return existingVfs;

  const source = String(code || '').trim();
  const dependencies = extractRuntimeDependencies(source);
  const hasOwnMount = /(?:ReactDOM\.)?createRoot\s*\(|ReactDOM\.render\s*\(/.test(source);
  const entryPath = hasOwnMount ? 'src/main.jsx' : 'src/App.jsx';
  const files = {
    'package.json': {
      content: JSON.stringify({
        name: 'quantora-generated-preview',
        private: true,
        version: '1.0.0',
        type: 'module',
        dependencies,
      }, null, 2),
      language: 'json',
    },
    'index.html': {
      content: '<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
      language: 'html',
    },
  };

  const css = [
    fileContent(existingVfs?.['src/index.css']),
    fileContent(existingVfs?.['index.css']),
    fileContent(existingVfs?.['src/App.css']),
    fileContent(existingVfs?.['App.css']),
    fileContent(existingVfs?.['styles.css']),
    fileContent(existingVfs?.['src/styles.css']),
  ].filter(Boolean).join('\n');
  files['src/index.css'] = {
    content: css || 'html,body,#root{min-height:100%;margin:0}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#0f172a}*{box-sizing:border-box}',
    language: 'css',
  };

  if (hasOwnMount) {
    files['src/main.jsx'] = { content: source, language: 'jsx' };
  } else {
    files['src/App.jsx'] = { content: ensureDefaultExport(source), language: 'jsx' };
    files['src/main.jsx'] = {
      content: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\nimport './index.css';\n\ncreateRoot(document.getElementById('root')).render(\n  <React.StrictMode><App /></React.StrictMode>,\n);\n",
      language: 'jsx',
    };
  }

  // A missing local stylesheet should never blank an otherwise valid generated app.
  // Preserve supplied CSS when available; otherwise create an empty virtual stylesheet.
  // Missing JS/TS modules are intentionally not fabricated so compile errors stay actionable.
  hydrateRelativeStyles(files, source, entryPath, existingVfs);

  return files;
}

export function isProjectRuntimeVfs(vfs = {}) {
  const names = Object.keys(vfs || {});
  if (!names.includes('package.json')) return false;
  return names.some((name) => /(?:^|\/)src\/(?:main|App)\.(?:jsx|tsx|js|ts)$/i.test(name));
}

