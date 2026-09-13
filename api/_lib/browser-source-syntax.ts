import { transformSync, type Loader } from 'esbuild';

const BROWSER_SOURCE = /\.(?:jsx?|tsx?)$/i;

function sourceContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { content?: unknown }).content === 'string') {
    return (value as { content: string }).content;
  }
  if (value && typeof value === 'object' && typeof (value as { code?: unknown }).code === 'string') {
    return (value as { code: string }).code;
  }
  return '';
}

function loaderFor(filePath: string): Loader {
  const lower = String(filePath || '').toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.ts')) return 'ts';
  if (lower.endsWith('.jsx')) return 'jsx';
  return 'js';
}

export type BrowserSourceSyntaxResult = {
  ok: boolean;
  file: string | null;
  error: string | null;
};

/**
 * Parse every generated browser source file with the same esbuild parser family
 * used by the production Preview compiler.
 *
 * This deliberately does not bundle or resolve packages. The artifact contract
 * already has separate dependency/path checks, while this gate owns the earlier
 * invariant: a response whose App.jsx ends halfway through an expression can
 * never be admitted as a successful build and only fail later in Preview.
 */
export function validateBrowserSourceSyntax(vfs: Record<string, unknown> = {}): BrowserSourceSyntaxResult {
  for (const [filePath, value] of Object.entries(vfs || {})) {
    if (!BROWSER_SOURCE.test(filePath)) continue;
    const source = sourceContent(value);
    try {
      transformSync(source, {
        loader: loaderFor(filePath),
        jsx: 'automatic',
        target: 'es2020',
        logLevel: 'silent',
        sourcemap: false,
      });
    } catch (error: any) {
      const first = Array.isArray(error?.errors) ? error.errors[0] : null;
      const detail = String(first?.text || error?.message || 'Browser source syntax is invalid')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
      return { ok: false, file: filePath, error: detail };
    }
  }
  return { ok: true, file: null, error: null };
}
