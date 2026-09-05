#!/usr/bin/env node
/**
 * A useCallback/useMemo dependency array that names a binding declared LATER in
 * the same component crashes it — every render, before anything mounts.
 *
 * WHY THIS EXISTS
 *
 * On 2026-09-05 a nav helper was added near the top of AiStudio.jsx:
 *
 *     const navRowStyle = useCallback((active) => ({ … }), [isLight, textColor]);
 *
 * `textColor` is declared ~1000 lines below it. The BODY of a hook runs later,
 * so the closure is fine — but the dependency array is an ordinary expression
 * evaluated on the spot, and reading a `const` before its declaration is a
 * temporal dead zone ReferenceError. AiStudio threw on first render and the
 * studio never mounted.
 *
 * WHAT IT COST, AND WHY A UNIT TEST WOULD NOT HAVE HELPED
 *
 * `npm run lint` (tsc) exits 0. `vite build` exits 0. All 1645 node tests pass
 * — none of them render this component. The only thing that caught it was the
 * browser suite, at the end of a CI cycle, reporting a timeout waiting for a
 * textarea: two failing gates and twenty-four skipped, none of which named the
 * cause. This gate turns that into a filename, a line and an identifier in
 * under a second.
 *
 * WHAT IT DOES WHEN THE BUG IS PRESENT (CLAUDE.md §4/§8)
 *
 * Reproduced by moving navRowStyle back above the colours and reading the
 * output — not by grepping for "FAILED":
 *
 *   src/components/AiStudio.jsx:409  'textColor' in a useCallback dependency
 *     array is declared later, at line 1466 — reading it here throws.
 *
 * SCOPE, DELIBERATELY NARROW (§5)
 *
 * It fires only on a bare identifier that has a top-level `const`/`let`
 * declaration LATER in the same file. Props, imports, parameters and anything
 * declared earlier are not hazards and are not reported, so this cannot become
 * a gate someone mutes because it cries wolf.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['src/components', 'src/hooks'];
/*
 * `\)?` is load-bearing. A hook returning an object literal closes with
 * `}), [deps])`, not `}, [deps])` — and navRowStyle, the defect this gate was
 * written for, is exactly that shape. Without it the scanner matched nothing in
 * the one file that mattered and printed a confident pass over 69 files.
 */
const HOOK_DEPS = /\}\s*\)?\s*,\s*\[([^\]]*)\]\s*\)/g;
const HOOK_OPEN = /\b(useCallback|useMemo|useEffect|useLayoutEffect)\s*\(/;

/*
 * TWO conditions, both required, and the second is what keeps this precise.
 *
 * The first attempt reported `code` in LivePreviewCanvas.jsx — a PROP, named
 * again a thousand lines below as a local `const` inside a nested effect. Two
 * different bindings, no hazard, and exactly the kind of finding that gets a
 * gate muted by the next person under pressure (§5).
 *
 * So a hazard is a name that (a) has a component-body declaration below the
 * dependency array — indented two spaces, not nested deeper — and (b) does not
 * appear ANYWHERE above it. Props, imports and parameters are all introduced
 * near the top of a file, so (b) rules every one of them out; a genuine TDZ
 * read has nothing above it by definition, because the declaration is the
 * first mention.
 */
/*
 * BOTH checks are scoped to the ENCLOSING component, and that is not a detail.
 *
 * The first working version of this gate reported nothing with the bug
 * deliberately reintroduced — it "passed" over the exact defect it was written
 * for. AiStudio.jsx declares a small `TechBadge` component a thousand lines
 * above, taking `textColor` as a PARAMETER, and a whole-file search saw that
 * mention and concluded the name was already bound. A different component's
 * parameter says nothing about this one's scope.
 *
 * That is CLAUDE.md §8 turned on this gate's own author: it was confirmed by
 * reading "passed" on a clean tree, which a gate that can never fire also
 * prints.
 */
function componentStart(source, index) {
  let start = 0;
  for (const match of source.matchAll(/^(?:export default )?(?:function|const)\s+[A-Z][\w$]*/gm)) {
    if (match.index >= index) break;
    start = match.index;
  }
  return start;
}

function componentBodyDeclaration(scope, name) {
  const declaration = new RegExp(`^  (?:const|let)\\s+${name}\\b`, 'm');
  const match = declaration.exec(scope);
  return match ? match.index : -1;
}

function mentionedBefore(scope, name) {
  return new RegExp(`\\b${name}\\b`).test(scope);
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function scan(file) {
  const source = fs.readFileSync(file, 'utf8');
  const findings = [];
  for (const match of source.matchAll(HOOK_DEPS)) {
    const depsAt = match.index;
    // Only a real hook call, not any `}, [ ... ])` in the file. The opening
    // token is somewhere above; the nearest one wins.
    const windowStart = Math.max(0, depsAt - 20_000);
    const before = source.slice(windowStart, depsAt);
    const openAt = before.search(new RegExp(`${HOOK_OPEN.source}(?![\\s\\S]*${HOOK_OPEN.source})`));
    if (openAt === -1) continue;
    /*
     * Everything from here to the dependency array is the hook's BODY, and a
     * name read there is a closure read — legal, deferred, not a hazard. The
     * body is therefore excluded from the "was it bound above?" question: the
     * defect this gate was written for reads `color: textColor` five lines
     * above the array that throws on it, and counting that as a prior binding
     * is what made the gate pass over its own reproduction case.
     */
    const hookOpensAt = windowStart + openAt;

    for (const raw of match[1].split(',')) {
      const name = raw.trim().split('?.')[0].split('.')[0].trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      const scopeAt = componentStart(source, depsAt);
      const declaredAt = componentBodyDeclaration(source.slice(scopeAt), name);
      if (declaredAt === -1 || scopeAt + declaredAt < depsAt) continue;
      if (mentionedBefore(source.slice(scopeAt, hookOpensAt), name)) continue;
      findings.push({
        file,
        line: lineOf(source, depsAt),
        name,
        declaredLine: lineOf(source, scopeAt + declaredAt),
      });
    }
  }
  return findings;
}

const files = [];
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const entry of fs.readdirSync(root)) {
    if (/\.(jsx?|tsx?)$/.test(entry) && !/\.test\./.test(entry)) files.push(path.join(root, entry));
  }
}

/*
 * A gate that finds nothing to inspect must fail rather than report a clean run
 * over zero files — the same rule the capability-claims gate learned.
 */
if (files.length === 0) {
  console.error('Hook dependency order gate FAILED: no components found to scan.');
  process.exit(1);
}

const findings = files.flatMap(scan);
if (findings.length) {
  console.error('Hook dependency order gate FAILED — a dependency array reads a binding declared below it.');
  console.error('The hook body runs later, but the array is evaluated where it is written, so this throws on first render.\n');
  for (const found of findings) {
    console.error(`  ${found.file}:${found.line}  '${found.name}' is declared later, at line ${found.declaredLine} — reading it here throws.`);
  }
  console.error('\nMove the hook below the declaration it depends on.');
  process.exit(1);
}

console.log(`Hook dependency order gate passed — ${files.length} component/hook file(s), no dependency array reads a later binding.`);
