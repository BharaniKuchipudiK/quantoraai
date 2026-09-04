export type BuildArtifactContractResult = {
  ok: boolean;
  detailCode: string;
};

function fencedFiles(text: string) {
  const files: Array<{ path: string; language: string; content: string }> = [];
  const pattern = /```(\w+)?[ \t]*(.*?)\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const language = String(match[1] || '').toLowerCase();
    const attributes = match[2] || '';
    const pathMatch = attributes.match(/(?:filepath|filename)\s*=\s*["']([^"']+)["']/i)
      || attributes.match(/(?:filepath|filename)\s*=\s*([^\s"']+)/i);
    files.push({ path: pathMatch?.[1] || '', language, content: match[3] || '' });
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
 *
 * A plain /<button[^>]*testid[^>]*>/ cannot do this: `onClick={() => setX(1)}`
 * contains a `>`, so the character class ends the tag in the middle of the
 * handler — which is why the previous version needed two alternative patterns
 * and still only matched handlers with no arrow at all.
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

/**
 * Is the calculator WIRED — not, is it written the one way these regexes
 * happened to imagine.
 *
 * THE INCIDENT. On 2026-09-04 the deployed golden burned all five attempts on
 * `calculator-interaction-missing`. The models were not failing; they were
 * writing the calculator the way it is normally written:
 *
 *   const handleDigit = (d) => setDisplay((prev) => prev === '0' ? d : prev + d);
 *   <button data-testid="calculator-one" onClick={() => handleDigit('1')}>1</button>
 *
 * The old check demanded a LITERAL `setDisplay(1)` or `setDisplay('1')`, so a
 * functional updater behind a generic digit handler — the correct
 * implementation — failed, while a naive one passed. Reproduced both ways
 * locally before this was touched.
 *
 * That is the guided-intake contradiction again, one function down: the
 * platform punishing the model for obeying it. Worse here, because the
 * artifact never reached the browser gate that clicks the button and asserts
 * the display reads 1 — the REAL verifier, which proves behaviour and does not
 * care how the state got there.
 *
 * So this checks wiring and stops: state exists, the display renders it, and
 * the "1" button's handler reaches the setter — directly or through one named
 * function. A static mockup still fails, which is all this needs to catch
 * before handing the artifact to a browser that can prove the rest.
 */
function hasCalculatorInteraction(content: string) {
  const source = String(content || '');
  const state = source.match(
    /\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*(?:React\s*\.\s*)?useState\s*\(/,
  );
  if (!state) return false;
  const value = regexEscape(state[1]);
  const setter = regexEscape(state[2]);

  /*
   * The display renders the state — through a formatter if the model chose one.
   * Requiring a bare `{value}` rejected `{display.toLocaleString()}`, which is
   * the same shape-over-behaviour mistake in miniature.
   */
  const displayTag = source.match(/data-testid\s*=\s*["']calculator-display["']/);
  if (!displayTag) return false;
  const afterDisplay = source.slice(displayTag.index ?? 0);
  const rendersState = new RegExp(`>[^<]*\\{[^}]*\\b${value}\\b[^}]*\\}`).test(afterDisplay.slice(0, 400));
  if (!rendersState) return false;

  const button = openingTagCarrying(source, /data-testid\s*=\s*["']calculator-one["']/);
  if (!button) return false;
  const onClick = jsxAttributeExpression(button, 'onClick');
  if (!onClick) return false;

  // Directly: onClick={() => setDisplay(...)}
  if (new RegExp(`\\b${setter}\\s*\\(`).test(onClick)) return true;

  /*
   * Or one hop, covering both ways a handler is passed:
   *   onClick={() => handleDigit('1')}   — called inside the expression
   *   onClick={chooseOne}                — passed by reference
   * so every identifier in the expression is a candidate, not only called ones.
   *
   * The hop checks the handler's OWN body rather than merely that the setter
   * appears somewhere in the module: a button wired to an unrelated function
   * must still fail while some other code sets state.
   */
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

/**
 * Validate only deterministic runtime invariants. This is intentionally not a
 * subjective quality scorer: a model may choose any design as long as the
 * artifact can execute in Quantora's opaque-origin preview sandbox.
 */
function isHtmlDocument(source: string) {
  return /<!DOCTYPE html>/i.test(source) || /<html[\s>]/i.test(source);
}

const BROWSER_LANG = /^(html|css|javascript|js|jsx|tsx|react)$/i;
const BROWSER_PATH = /\.(html|css|js|jsx|tsx|mjs|cjs)$/i;
const NATIVE_PATH = /\.(swift|kt|kts|java|m|mm|cs)$/i;

export function hasBrowserPreviewArtifact(text: unknown): boolean {
  const source = typeof text === 'string' ? text : '';
  if (isHtmlDocument(source)) return true;
  const files = fencedFiles(source);
  return files.some((file) => (
    BROWSER_LANG.test(file.language)
    || BROWSER_PATH.test(file.path)
    || isHtmlDocument(file.content)
  ));
}

/**
 * A genuine guided-intake move: the reply asks the user something through the
 * platform's own choice markers. Anchored on the durable marker tags (the same
 * law as data-quantora-* hooks, §6), never on question-mark prose — a plan
 * that muses "shall we?" is not an intake move.
 */
function hasGuidedIntakeMove(source: string) {
  return /<quantora-(modal|choices)>[\s\S]*?<\/quantora-\1>/.test(source);
}

export function validateBuildArtifactResponse(
  text: unknown,
  transaction: string | null = null,
  options: { allowIntake?: boolean } = {},
): BuildArtifactContractResult {
  const source = typeof text === 'string' ? text : '';
  const files = fencedFiles(source);
  if (!files.length && !isHtmlDocument(source)) {
    /*
     * THE GUIDED-INTAKE CONTRADICTION (2026-09-01). GUIDED_BUILD_DIRECTIVE
     * orders the model's first turn on a website ask to output NO code and ask
     * ONE question with <quantora-modal> — and this line then failed every
     * reply that obeyed, burning the whole route ladder on compliant answers
     * ("The model answered in chat without files" / "no healthy AI route").
     * A guided turn owes EITHER a runnable artifact OR a genuine intake move;
     * golden canary turns (transaction set) always owe the artifact.
     */
    if (options.allowIntake && !transaction && hasGuidedIntakeMove(source)) {
      return { ok: true, detailCode: 'guided-intake-valid' };
    }
    return { ok: false, detailCode: 'code-fences-missing' };
  }

  const code = files.length ? files.map((file) => file.content).join('\n') : source;
  if (/\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\b/.test(code)) {
    return { ok: false, detailCode: 'opaque-storage-access' };
  }

  if (!transaction && files.some((file) => NATIVE_PATH.test(file.path) || file.language === 'swift' || file.language === 'kotlin') && !hasBrowserPreviewArtifact(source)) {
    return { ok: false, detailCode: 'browser-preview-missing' };
  }
  if (!transaction && files.length && !hasBrowserPreviewArtifact(source) && !isHtmlDocument(source)) {
    return { ok: false, detailCode: 'browser-preview-missing' };
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

export function buildArtifactContractError(detailCode: string) {
  const error: any = new Error(`Generated build artifact failed the ${detailCode} execution contract.`);
  error.status = 502;
  error.code = 'BUILD_ARTIFACT_CONTRACT';
  error.detailCode = detailCode;
  return error;
}
