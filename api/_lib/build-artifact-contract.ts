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

/**
 * Validate only deterministic runtime invariants. This is intentionally not a
 * subjective quality scorer: a model may choose any design as long as the
 * artifact can execute in Quantora's opaque-origin preview sandbox.
 */
export function validateBuildArtifactResponse(text: unknown, transaction: string | null = null): BuildArtifactContractResult {
  const source = typeof text === 'string' ? text : '';
  const files = fencedFiles(source);
  if (!files.length) return { ok: false, detailCode: 'code-fences-missing' };

  const code = files.map((file) => file.content).join('\n');
  if (/\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\b/.test(code)) {
    return { ok: false, detailCode: 'opaque-storage-access' };
  }

  if (transaction === 'calculator' || transaction === 'simple-website') {
    const paths = new Set(files.map((file) => file.path.replace(/^\/+/, '')));
    const hasRequiredVfs = paths.has('package.json')
      && ['src/main.jsx', 'src/main.tsx', 'src/main.js', 'src/main.ts'].some((path) => paths.has(path))
      && ['src/App.jsx', 'src/App.tsx', 'src/App.js', 'src/App.ts'].some((path) => paths.has(path))
      && [...paths].some((path) => path.startsWith('src/') && path.endsWith('.css'));
    if (!hasRequiredVfs) return { ok: false, detailCode: 'golden-vfs-shape-missing' };
  }

  if (transaction === 'calculator' && (!code.includes('calculator-display') || !code.includes('calculator-one'))) {
    return { ok: false, detailCode: 'calculator-contract-missing' };
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
