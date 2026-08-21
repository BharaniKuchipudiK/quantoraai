function fileContent(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.content === 'string') return value.content;
  if (value && typeof value.code === 'string') return value.code;
  return '';
}

export function isProjectRuntimeVfs(vfs = {}) {
  const names = Object.keys(vfs || {});
  if (!names.includes('package.json')) return false;
  return names.some((name) => /(?:^|\/)src\/(?:main|App)\.(?:jsx|tsx|js|ts)$/i.test(name));
}

export function projectRuntimeConfig(vfs = {}) {
  if (!isProjectRuntimeVfs(vfs)) return null;

  let pkg = {};
  try {
    pkg = JSON.parse(fileContent(vfs['package.json']) || '{}');
  } catch {
    pkg = {};
  }

  const names = Object.keys(vfs || {});
  const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const usesReact = Boolean(dependencies.react)
    || names.some((name) => /(?:^|\/)src\/(?:main|App)\.(?:jsx|tsx)$/i.test(name));
  const usesTypeScript = names.some((name) => /\.tsx?$/i.test(name));
  const template = usesReact
    ? (usesTypeScript ? 'vite-react-ts' : 'vite-react')
    : (usesTypeScript ? 'vanilla-ts' : 'vanilla');

  const files = {};
  for (const [path, value] of Object.entries(vfs || {})) {
    if (path === 'package.json') continue;
    files[`/${path.replace(/^\/+/, '')}`] = { code: fileContent(value) };
  }

  return { template, files, dependencies, packageJson: pkg };
}
