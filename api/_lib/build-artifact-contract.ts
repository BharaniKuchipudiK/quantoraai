import { parseVFSWithReport } from '../../src/lib/vfs-parser.js';
import { pickPreviewEntryPath } from '../../src/lib/preview-utils.js';
import { posix as path } from 'node:path';
import { isValidWorkspaceRelativePath } from '../../shared/desk-runtime-contract.js';
import { missingRequestedDeliverables } from '../../src/lib/requested-deliverables.js';
import { validateBrowserSourceSyntax } from './browser-source-syntax.js';

export type BuildArtifactContractResult = {
  ok: boolean;
  detailCode: string;
};

function fencedFiles(text: string) {
  const files: Array<{ path: string; language: string; content: string; end: number }> = [];
  const pattern = /```(\w+)?[ \t]*(.*?)\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const language = String(match[1] || '').toLowerCase();
    const attributes = match[2] || '';
    const pathMatch = attributes.match(/(?:filepath|filename)\s*=\s*["']([^"']+)["']/i)
      || attributes.match(/(?:filepath|filename)\s*=\s*([^\s"']+)/i);
    files.push({
      path: pathMatch?.[1] || '',
      language,
      content: match[3] || '',
      end: match.index + match[0].length,
    });
  }
  return files;
}

function hasReactRootMount(content: string) {
  const source = String(content || '');
  const findsRoot = /document\s*\.\s*(?:getElementById\s*\(\s*["']root["']|querySelector\s*\(\s*["']#root["'])/.test(source);
  const createsRoot = /\bcreateRoot\s*\(/.test(source) || /\bReactDOM\s*\.\s*render\s*\(/.test(source);
  const rendersComponent = /\.\s*render\s*\(\s*<\s*[A-Z][A-Za-z0-9_$]*/.test(source)
    || /\bReactDOM\s*\.\s*render\s*\(\s*<\s*[A-Z][A-Za-z0-9_$]*/.test(source);
  return findsRoot && createsRoot && rendersComponent;
}

function regexEscape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The opening tag that carries `needle`, with `=>` inside braces skipped.
 */
function openingTagCarrying(source: string, needle: RegExp): string {
  const match = source.match(needle);
  if (!match || match.index === undefined) return '';
  const start = source.lastIndexOf('<button', match.index);
  if (start === -1) return '';
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    else if (character === '>' && depth === 0) return source.slice(start, index + 1);
  }
  return '';
}

/** A JSX attribute's braced expression, matched by brace depth rather than regex. */
function jsxAttributeExpression(tag: string, attribute: string): string {
  const at = tag.search(new RegExp(`${attribute}\\s*=\\s*\\{`, 'i'));
  if (at === -1) return '';
  const open = tag.indexOf('{', at);
  let depth = 0;
  for (let index = open; index < tag.length; index += 1) {
    if (tag[index] === '{') depth += 1;
    else if (tag[index] === '}') {
      depth -= 1;
      if (depth === 0) return tag.slice(open + 1, index);
    }
  }
  return '';
}

function hasCalculatorInteraction(content: string) {
  const source = String(content || '');
  const state = source.match(
    /\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*(?:React\s*\.\s*)?useState\s*\(/,
  );
  if (!state) return false;
  const value = regexEscape(state[1]);
  const setter = regexEscape(state[2]);

  const displayTag = source.match(/data-testid\s*=\s*["']calculator-display["']/);
  if (!displayTag) return false;
  const afterDisplay = source.slice(displayTag.index ?? 0);
  const rendersState = new RegExp(`>[^<]*\\{[^}]*\\b${value}\\b[^}]*\\}`).test(afterDisplay.slice(0, 400));
  if (!rendersState) return false;

  const button = openingTagCarrying(source, /data-testid\s*=\s*["']calculator-one["']/);
  if (!button) return false;
  const onClick = jsxAttributeExpression(button, 'onClick');
  if (!onClick) return false;

  if (new RegExp(`\\b${setter}\\s*\\(`).test(onClick)) return true;

  const HANDLER_BODY_WINDOW = 300;
  const candidates = [...onClick.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((hit) => hit[1]);
  return candidates.some((name) => {
    const definition = source.search(new RegExp(
      `(?:function\\s+${regexEscape(name)}\\b|(?:const|let|var)\\s+${regexEscape(name)}\\s*=)`,
    ));
    if (definition === -1) return false;
    return new RegExp(`\\b${setter}\\s*\\(`).test(source.slice(definition, definition + HANDLER_BODY_WINDOW));
  });
}

function isHtmlDocument(source: string) {
  return /<!DOCTYPE html>/i.test(source) || /<html[\s>]/i.test(source);
}

const NATIVE_PATH = /\.(swift|kt|kts|java|m|mm|cs)$/i;
const SEARCH_REPLACE_PATCH = /(?:^|\n)\s*<<<<\s*\r?\n[\s\S]*?\r?\n\s*====\s*\r?\n[\s\S]*?\r?\n\s*>>>>(?:\s*$|\s*\n)/;

function hasExistingFilePatchArtifact(source: string) {
  return fencedFiles(source).some((file) => (
    Boolean(file.path)
    && !NATIVE_PATH.test(file.path)
    && SEARCH_REPLACE_PATCH.test(file.content)
  ));
}

export function hasBrowserPreviewArtifact(text: unknown): boolean {
  const source = typeof text === 'string' ? text : '';
  if (isHtmlDocument(source)) return true;
  if (hasExistingFilePatchArtifact(source)) return true;
  const parsed = parseVFSWithReport(source, {});
  return Boolean(pickPreviewEntryPath(parsed.vfs));
}

function hasGuidedIntakeMove(source: string) {
  return /<quantora-(modal|choices)>[\s\S]*?<\/quantora-\1>/.test(source);
}

function normalizedVfsPath(value: unknown): string | null {
  const normalized = path.normalize(String(value || '').replace(/\\/g, '/').replace(/^\/+/, ''));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

function localDependencySpecifiers(source: unknown): string[] {
  const text = String(source || '');
  const specifiers: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?["']([^"']+)["']/g,
    /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
    /@import\s+(?:url\(\s*)?["']([^"']+)["']/g,
    /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]?.startsWith('.') || match[1]?.startsWith('/')) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function recoveredDependenciesAreClosed(source: string): boolean {
  const parsed = parseVFSWithReport(source, {});
  const files = new Set(
    Object.keys(parsed.vfs || {})
      .map(normalizedVfsPath)
      .filter((file): file is string => Boolean(file)),
  );
  for (const [rawImporter, value] of Object.entries(parsed.vfs || {})) {
    const importer = normalizedVfsPath(rawImporter);
    if (!importer) return false;
    const content = typeof value === 'string'
      ? value
      : String((value as { content?: unknown })?.content || '');
    for (const rawSpecifier of localDependencySpecifiers(content)) {
      const clean = rawSpecifier.split(/[?#]/)[0];
      const base = normalizedVfsPath(
        clean.startsWith('/') ? clean : path.join(path.dirname(importer), clean),
      );
      if (!base) return false;
      const candidates = [
        base,
        `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, `${base}.json`, `${base}.css`,
        `${base}/index.js`, `${base}/index.jsx`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.css`,
      ];
      if (!candidates.some((candidate) => files.has(candidate))) return false;
    }
  }
  return true;
}

export function validateBuildArtifactResponse(
  text: unknown,
  transaction: string | null = null,
  options: { allowIntake?: boolean; requestedFiles?: string[]; requestBrief?: string } = {},
): BuildArtifactContractResult {
  const source = typeof text === 'string' ? text : '';
  const files = fencedFiles(source);
  const pythonRequested = !transaction && options.requestedFiles?.some((file) => /\.py$/i.test(file));
  if (pythonRequested) {
    const sourceFiles = files.filter((file) => file.path.trim());
    if (!sourceFiles.length) return { ok: false, detailCode: 'code-fences-missing' };
    if (sourceFiles.some((file) => !isValidWorkspaceRelativePath(file.path))) {
      return { ok: false, detailCode: 'source-path-invalid' };
    }
    const parsed = parseVFSWithReport(source, {});
    const missing = missingRequestedDeliverables(options.requestBrief || '', parsed.vfs);
    if (missing.length || options.requestedFiles?.some((file) => !Object.hasOwn(parsed.vfs, file))) {
      return { ok: false, detailCode: 'requested-source-files-missing' };
    }
    if (!options.requestedFiles?.some((file) => /\.(?:html?|jsx|tsx|css)$/i.test(file))) {
      return { ok: true, detailCode: 'python-source-files-valid' };
    }
  }
  if (!files.length && !isHtmlDocument(source)) {
    if (options.allowIntake && !transaction && hasGuidedIntakeMove(source)) {
      return { ok: true, detailCode: 'guided-intake-valid' };
    }
    return { ok: false, detailCode: 'code-fences-missing' };
  }

  const code = files.length ? files.map((file) => file.content).join('\n') : source;
  if (/\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage|indexedDB)\b/i.test(code)) {
    return { ok: false, detailCode: 'opaque-storage-access' };
  }

  if (!transaction && files.some((file) => NATIVE_PATH.test(file.path) || file.language === 'swift' || file.language === 'kotlin') && !hasBrowserPreviewArtifact(source)) {
    return { ok: false, detailCode: 'browser-preview-missing' };
  }
  if (!transaction && files.length && !hasBrowserPreviewArtifact(source) && !isHtmlDocument(source)) {
    return { ok: false, detailCode: 'browser-preview-missing' };
  }

  // Fail closed before the assistant can call a generated browser project done.
  // Existing-file patches are applied against the browser-owned current VFS, so
  // the server cannot parse them in isolation and intentionally defers them.
  if (files.length && !hasExistingFilePatchArtifact(source)) {
    const parsed = parseVFSWithReport(source, {});
    const syntax = validateBrowserSourceSyntax(parsed.vfs as Record<string, unknown>);
    if (!syntax.ok) return { ok: false, detailCode: 'browser-source-syntax-invalid' };
  }

  if (transaction === 'calculator' || transaction === 'simple-website') {
    const paths = new Set(files.map((file) => file.path.replace(/^\/+/, '')));
    const entry = files.find((file) => ['src/main.jsx', 'src/main.tsx', 'src/main.js', 'src/main.ts'].includes(file.path.replace(/^\/+/, '')));
    const hasRequiredVfs = paths.has('package.json')
      && Boolean(entry)
      && ['src/App.jsx', 'src/App.tsx', 'src/App.js', 'src/App.ts'].some((path) => paths.has(path))
      && [...paths].some((path) => path.startsWith('src/') && path.endsWith('.css'));
    if (!hasRequiredVfs) return { ok: false, detailCode: 'golden-vfs-shape-missing' };
    if (!hasReactRootMount(entry?.content || '')) return { ok: false, detailCode: 'golden-root-mount-missing' };
  }

  if (transaction === 'calculator' && (!code.includes('calculator-display') || !code.includes('calculator-one'))) {
    return { ok: false, detailCode: 'calculator-contract-missing' };
  }
  if (transaction === 'calculator' && !hasCalculatorInteraction(code)) {
    return { ok: false, detailCode: 'calculator-interaction-missing' };
  }
  if (transaction === 'simple-website' && (!code.includes('Sunrise Bakery') || !code.includes('website-cta'))) {
    return { ok: false, detailCode: 'website-contract-missing' };
  }

  return { ok: true, detailCode: 'build-artifact-valid' };
}

export function recoverInterruptedBuildArtifactResponse(
  text: unknown,
  transaction: string | null = null,
  options: { allowIntake?: boolean; requestedFiles?: string[]; requestBrief?: string } = {},
): string | null {
  const source = typeof text === 'string' ? text : '';
  const files = fencedFiles(source);
  let candidate = files.length
    ? source.slice(0, files[files.length - 1].end).trim()
    : '';

  if (!candidate) {
    let htmlEnd = 0;
    for (const match of source.matchAll(/<\/html\s*>/ig)) {
      htmlEnd = (match.index ?? 0) + match[0].length;
    }
    if (htmlEnd > 0) {
      candidate = source.slice(0, htmlEnd).trim();
    }
  }

  if (!candidate) return null;
  return validateBuildArtifactResponse(candidate, transaction, options).ok
    && recoveredDependenciesAreClosed(candidate)
    ? candidate
    : null;
}

export function buildArtifactContractError(detailCode: string) {
  const error: any = new Error(`Generated build artifact failed the ${detailCode} execution contract.`);
  error.status = 502;
  error.code = 'BUILD_ARTIFACT_CONTRACT';
  error.detailCode = detailCode;
  return error;
}
