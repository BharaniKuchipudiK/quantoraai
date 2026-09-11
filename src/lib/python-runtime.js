import { validateDeskSyncEntries } from '../../shared/desk-runtime-contract.js';
import { parsePythonRuntimeCommand } from './python-runtime-command.js';
import { requestedDeliverablePaths } from './requested-deliverables.js';
import { studioWorkspaceFileEntries } from './studio-workspace-tree.js';

const PYTHON_BOOT_TIMEOUT_MS = 30_000;
const PYTHON_RUN_TIMEOUT_MS = 20_000;
const PYTHON_MAX_FILES = 200;
const PYTHON_MAX_WORKSPACE_BYTES = 2 * 1024 * 1024;
let sequence = 0;

export async function runPythonCommandInWorkspace(vfs, commandLine, { timeoutMs = PYTHON_RUN_TIMEOUT_MS } = {}) {
  const command = parsePythonRuntimeCommand(commandLine);
  if (!command.ok) return { ok: false, exitCode: 2, output: command.error };
  const entries = studioWorkspaceFileEntries(vfs).map(({ path, content }) => ({ path, content }));
  const valid = validateDeskSyncEntries(entries);
  if (!valid.ok) return { ok: false, exitCode: 2, output: `Python workspace refused: ${valid.reason}` };
  const workspaceBytes = valid.entries.reduce((total, entry) => total + new TextEncoder().encode(entry.content).byteLength, 0);
  if (valid.entries.length > PYTHON_MAX_FILES || workspaceBytes > PYTHON_MAX_WORKSPACE_BYTES) {
    return { ok: false, exitCode: 2, output: 'Python workspace refused: browser execution is limited to 200 files and 2 MB.' };
  }
  if (command.kind === 'script' && !valid.entries.some((entry) => entry.path === command.path)) {
    return { ok: false, exitCode: 2, output: `${command.path} is not on this desk.` };
  }

  // One worker per command prevents a terminal run and automatic verification
  // from sharing mutable Python state or terminating each other.
  const active = new Worker(new URL('./python-runtime.worker.js', import.meta.url), { type: 'module' });
  const id = ++sequence;
  return new Promise((resolve) => {
    const effectiveTimeoutMs = PYTHON_BOOT_TIMEOUT_MS + Math.max(1000, timeoutMs);
    const timer = setTimeout(() => {
      active.terminate();
      resolve({ ok: false, exitCode: 124, output: 'Python exceeded its bounded startup/execution deadline. The desk files are unchanged.' });
    }, effectiveTimeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      active.removeEventListener('message', onMessage);
      active.removeEventListener('error', onError);
    };
    const onMessage = (event) => {
      if (event.data?.id !== id) return;
      cleanup();
      active.terminate();
      const detail = event.data.error ? [event.data.output, event.data.error].filter(Boolean).join('\n') : event.data.output;
      resolve({ ok: Boolean(event.data.ok), exitCode: event.data.exitCode, output: detail || `(exit ${event.data.exitCode || 0})` });
    };
    const onError = (event) => {
      cleanup();
      active.terminate();
      resolve({ ok: false, exitCode: 1, output: event.message || 'The browser Python runtime could not start.' });
    };
    active.addEventListener('message', onMessage);
    active.addEventListener('error', onError);
    active.postMessage({ id, command, files: valid.entries });
  });
}

export async function verifyPythonWorkspace(vfs = {}, brief = '') {
  const requested = requestedDeliverablePaths(brief).filter((path) => /\.py$/i.test(path));
  if (!requested.length) return null;
  const tests = Object.keys(vfs || {}).filter((path) => /(?:^|\/)(?:test_.+|.+_test)\.py$/i.test(path));
  const command = tests.length ? 'pytest -q' : `python -m py_compile ${requested.join(' ')}`;
  let result;
  try {
    result = await runPythonCommandInWorkspace(vfs, command);
  } catch (error) {
    result = { ok: false, exitCode: 1, output: error?.message || 'The browser Python runtime could not start.' };
  }
  return {
    ...result,
    runtime: 'Python 3.14 (Pyodide)',
    isolation: 'ephemeral worker; browser network and page capabilities disabled',
    level: tests.length ? 'tests' : 'syntax',
    command,
    files: requested,
  };
}
