import { validateDeskSyncEntries } from '../../shared/desk-runtime-contract.js';
import { parsePythonRuntimeCommand } from './python-runtime-command.js';
import { requestedDeliverablePaths } from './requested-deliverables.js';
import { studioWorkspaceFileEntries } from './studio-workspace-tree.js';
import { mergePythonOutputFiles, requestedPythonCommands } from './python-workspace-results.js';

const PYTHON_BOOT_TIMEOUT_MS = 30_000;
const PYTHON_RUN_TIMEOUT_MS = 20_000;
const PYTHON_MAX_FILES = 200;
const PYTHON_MAX_WORKSPACE_BYTES = 2 * 1024 * 1024;
let sequence = 0;

export async function runPythonCommandInWorkspace(vfs, commandLine, { timeoutMs = PYTHON_RUN_TIMEOUT_MS, totalTimeoutMs = null } = {}) {
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
    const effectiveTimeoutMs = totalTimeoutMs == null
      ? PYTHON_BOOT_TIMEOUT_MS + Math.max(1000, timeoutMs)
      : Math.max(1000, Math.min(50_000, totalTimeoutMs));
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
      const outputFiles = validateDeskSyncEntries(event.data.files || []);
      const outputBytes = outputFiles.ok ? outputFiles.entries.reduce((sum, file) => sum + new TextEncoder().encode(file.content).byteLength, 0) : Infinity;
      const safeOutput = outputFiles.ok && outputFiles.entries.length <= PYTHON_MAX_FILES && outputBytes <= PYTHON_MAX_WORKSPACE_BYTES;
      resolve({ ok: Boolean(event.data.ok) && safeOutput, exitCode: safeOutput ? event.data.exitCode : 1,
        output: safeOutput ? detail || `(exit ${event.data.exitCode || 0})` : 'Python output failed workspace validation; no output files were saved.',
        files: safeOutput && event.data.ok ? outputFiles.entries : [],
      });
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

export async function verifyPythonWorkspace(vfs = {}, brief = '', { run = runPythonCommandInWorkspace } = {}) {
  const requested = requestedDeliverablePaths(brief).filter((path) => /\.py$/i.test(path));
  if (!requested.length) return null;
  const tests = Object.keys(vfs || {}).filter((path) => /(?:^|\/)(?:test_.+|.+_test)\.py$/i.test(path));
  const command = tests.length ? 'pytest -q' : `python -m py_compile ${requested.join(' ')}`;
  let result;
  let verifiedVfs = vfs;
  const commands = [...new Set([command, ...requestedPythonCommands(brief)])];
  const executions = [];
  const deadline = Date.now() + 60_000;
  try {
    for (const nextCommand of commands) {
      if (Date.now() >= deadline) { result = { ok: false, exitCode: 124, output: 'Python verification budget exhausted; completed files were retained.' }; break; }
      result = await run(verifiedVfs, nextCommand, { totalTimeoutMs: deadline - Date.now() });
      executions.push({ command: nextCommand, ok: result.ok, exitCode: result.exitCode, output: result.output });
      if (!result.ok) break;
      const merged = mergePythonOutputFiles(verifiedVfs, verifiedVfs, result.files || []);
      if (!merged.ok) { result = { ok: false, exitCode: 1, output: merged.error }; break; }
      verifiedVfs = merged.vfs;
    }
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
    vfs: verifiedVfs,
    executions,
    outputFiles: Object.entries(verifiedVfs).filter(([path, entry]) => {
      const before = typeof vfs[path] === 'string' ? vfs[path] : vfs[path]?.content;
      return (typeof entry === 'string' ? entry : entry?.content) !== before;
    }),
  };
}
