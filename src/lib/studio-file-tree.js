export function listStudioFiles(vfs = {}) {
  return Object.keys(vfs)
    .filter((path) => path && vfs[path] && typeof vfs[path].content === 'string')
    .sort((a, b) => a.localeCompare(b));
}

export function studioFileLabel(path) {
  const value = String(path || '').trim();
  if (!value || value === 'preview') return 'Preview';
  if (value === 'terminal') return 'Terminal';
  if (value === 'code') return 'Code';
  return value;
}
