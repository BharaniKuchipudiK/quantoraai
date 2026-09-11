import { isValidWorkspaceRelativePath } from '../../shared/desk-runtime-contract.js';

const PYTHON_BIN = new Set(['python', 'python3']);
const SAFE_MODULES = new Set(['unittest', 'py_compile', 'compileall']);

export function tokenizeDeskCommand(line = '') {
  const tokens = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (const char of String(line || '').trim()) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/.test(char)) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += char;
  }
  if (escaped || quote) return { ok: false, error: 'The command has an unfinished quote or escape.' };
  if (current) tokens.push(current);
  return { ok: true, tokens };
}

export function isPythonRuntimeCommand(line = '') {
  const first = String(line || '').trim().split(/\s+/, 1)[0];
  return PYTHON_BIN.has(first) || first === 'pytest' || first === 'py.test';
}

export function parsePythonRuntimeCommand(line = '') {
  const tokenized = tokenizeDeskCommand(line);
  if (!tokenized.ok) return tokenized;
  const tokens = tokenized.tokens;
  if (!tokens.length) return { ok: false, error: 'Enter a Python command.' };

  if (tokens[0] === 'pytest' || tokens[0] === 'py.test') {
    return { ok: true, kind: 'module', module: 'pytest', args: tokens.slice(1), packages: ['pytest'] };
  }
  if (!PYTHON_BIN.has(tokens[0])) return { ok: false, error: 'Only Python commands use the Python runtime.' };

  let cursor = 1;
  while (tokens[cursor] === '-u' || tokens[cursor] === '-B') cursor += 1;
  if (tokens[cursor] === '-m') {
    const module = tokens[cursor + 1];
    if (!SAFE_MODULES.has(module)) {
      return { ok: false, error: 'This browser runtime allows python -m unittest, py_compile, or compileall.' };
    }
    return { ok: true, kind: 'module', module, args: tokens.slice(cursor + 2), packages: [] };
  }
  const path = tokens[cursor];
  if (!path || !isValidWorkspaceRelativePath(path)) {
    return { ok: false, error: 'Name a Python file on this desk, for example: python3 parser.py' };
  }
  if (!/\.py$/i.test(path)) return { ok: false, error: 'The Python runtime only executes .py source files.' };
  return { ok: true, kind: 'script', path, args: tokens.slice(cursor + 1), packages: [] };
}

