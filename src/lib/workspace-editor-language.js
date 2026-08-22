export function languageFromPath(path = '') {
  const name = String(path || '').split('/').pop() || '';
  const lower = name.toLowerCase();
  if (lower.endsWith('.tsx') || lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.jsx') || lower.endsWith('.js') || lower === 'code') return 'javascript';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  return 'javascript';
}
