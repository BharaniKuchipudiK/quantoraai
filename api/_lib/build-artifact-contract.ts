export type BuildArtifactContractResult = {
  ok: boolean;
  detailCode: string;
};

function fencedFiles(text: string) {
  const files: Array<{ path: string; content: string }> = [];
  const pattern = /```(?:\w+)?[ \t]*(.*?)\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const attributes = match[1] || '';
    const pathMatch = attributes.match(/(?:filepath|filename)=["']([^"']+)["']/i);
    files.push({ path: pathMatch?.[1] || '', content: match[2] || '' });
  }
  return files;
}

function cleanPath(path: string) {
  return String(path || '').replace(/^\/+/, '');
}

function hasReactRootMount(content: string) {
  const source = String(content || '');
  const findsRoot = /document\s*\.\s*(?:getElementById\s*\(\s*["']root["']|querySelector\s*\(\s*["']#root["'])/.test(source);
  const createsRoot = /\bcreateRoot\s*\(/.test(source) || /\bReactDOM\s*\.\s*render\s*\(/.test(source);
  const rendersComponent = /\.\s*render\s*\(\s*<\s*[A-Z][A-Za-z0-9_$]*/.test(source)
    || /\bReactDOM\s*\.\s*render\s*\(\s*<\s*[A-Z][A-Za-z0-9_$]*/.test(source);
  return findsRoot && createsRoot && rendersComponent;
}

function isReactLike(files: Array<{ path: string; content: string }>) {
  return files.some((file) => /\.(?:jsx|tsx)$/i.test(cleanPath(file.path)))
    || files.some((file) => /(?:from\s+["']react["']|from\s+["']react-dom(?:\/client)?["']|\bcreateRoot\s*\(|\buseState\s*\()/i.test(file.content));
}

function runtimeVfsShape(files: Array<{ path: string; content: string }>) {
  const paths = new Set(files.map((file) => cleanPath(file.path)));
  const entry = files.find((file) => ['src/main.jsx', 'src/main.tsx', 'src/main.js', 'src/main.ts'].includes(cleanPath(file.path)));
  const hasApp = ['src/App.jsx', 'src/App.tsx', 'src/App.js', 'src/App.ts'].some((path) => paths.has(path));
  return {
    paths,
    entry,
    valid: paths.has('package.json') && Boolean(entry) && hasApp,
  };
}

function regexEscape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasCalculatorInteraction(content: string) {
  const state = String(content || '').match(
    /\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*(?:React\s*\.\s*)?useState\s*\(\s*['"]?0['"]?\s*\)/,
  );
  if (!state) return false;
  const value = regexEscape(state[1]);
  const setter = regexEscape(state[2]);
  const displayReadsState = new RegExp(`data-testid\\s*=\\s*["']calculator-display["'][^>]*>[\\s\\S]*?\\{\\s*${value}\\s*\\}`).test(content);
  const setterCanReachOne = new RegExp(`${setter}\\s*\\(\\s*["']?1["']?\\s*\\)`).test(content);
  const buttonHasClickHandler = /<button\b[^>]*data-testid\s*=\s*["']calculator-one["'][^>]*onClick\s*=/i.test(content)
    || /<button\b[^>]*onClick\s*=[^>]*data-testid\s*=\s*["']calculator-one["']/i.test(content);
  return displayReadsState && setterCanReachOne && buttonHasClickHandler;
}

/**
 * Validate deterministic runtime invariants before a provider route is committed.
 * Golden transactions add observable interaction assertions, but real user builds
 * must satisfy the same executable runtime shape instead of receiving a weaker path.
 */
export function validateBuildArtifactResponse(text: unknown, transaction: string | null = null): BuildArtifactContractResult {
  const source = typeof text === 'string' ? text : '';
  const files = fencedFiles(source);
  if (!files.length) return { ok: false, detailCode: 'code-fences-missing' };
  if (files.some((file) => !cleanPath(file.path))) return { ok: false, detailCode: 'build-filepath-missing' };

  const code = files.map((file) => file.content).join('\n');
  if (/\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\b/.test(code)) {
    return { ok: false, detailCode: 'opaque-storage-access' };
  }

  const reactLike = isReactLike(files);
  const runtime = runtimeVfsShape(files);
  if (reactLike) {
    if (!runtime.valid) {
      return {
        ok: false,
        detailCode: transaction === 'calculator' || transaction === 'simple-website'
          ? 'golden-vfs-shape-missing'
          : 'runtime-vfs-shape-missing',
      };
    }
    if (!hasReactRootMount(runtime.entry?.content || '')) {
      return {
        ok: false,
        detailCode: transaction === 'calculator' || transaction === 'simple-website'
          ? 'golden-root-mount-missing'
          : 'runtime-root-mount-missing',
      };
    }
  } else if (![...runtime.paths].some((path) => /(?:^|\/)index\.html$/i.test(path) || /\.html$/i.test(path))) {
    return { ok: false, detailCode: 'html-entry-missing' };
  }

  if (transaction === 'calculator' || transaction === 'simple-website') {
    const hasRequiredVfs = runtime.valid
      && [...runtime.paths].some((path) => path.startsWith('src/') && path.endsWith('.css'));
    if (!hasRequiredVfs) return { ok: false, detailCode: 'golden-vfs-shape-missing' };
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

export function buildArtifactContractError(detailCode: string) {
  const error: any = new Error(`Generated build artifact failed the ${detailCode} execution contract.`);
  error.status = 502;
  error.code = 'BUILD_ARTIFACT_CONTRACT';
  error.detailCode = detailCode;
  return error;
}
