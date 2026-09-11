import { loadPyodide, version as pyodideVersion } from 'pyodide';

const trustedFetch = globalThis.fetch.bind(globalThis);
const trustedPostMessage = globalThis.postMessage.bind(globalThis);
const packageBaseUrl = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`;
let loadedPackages = new Set();

const runtimePromise = loadPyodide({
  indexURL: new URL('/pyodide/', self.location.origin).href,
  packageBaseUrl,
});

function lockedPackageFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url, packageBaseUrl);
  if (!url.href.startsWith(packageBaseUrl)) throw new Error('Python package download was blocked outside the pinned Pyodide registry.');
  return trustedFetch(input, { ...init, credentials: 'omit' });
}

function lockGeneratedCodeAwayFromBrowserCapabilities() {
  for (const name of ['fetch', 'postMessage', 'close', 'importScripts', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel', 'WebTransport']) {
    try { Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false }); } catch { /* absent or already locked */ }
  }
}

function collectWorkspace(pyodide) {
  const files = [];
  let bytes = 0;
  const walk = (directory, relative = '') => {
    for (const name of pyodide.FS.readdir(directory)) {
      if (['.', '..', '__pycache__', '.pytest_cache'].includes(name)) continue;
      const full = `${directory}/${name}`;
      const path = relative ? `${relative}/${name}` : name;
      const stat = pyodide.FS.lstat(full);
      if (pyodide.FS.isLink(stat.mode)) throw new Error('Python output contains a symbolic link; no output files were saved.');
      if (pyodide.FS.isDir(stat.mode)) { walk(full, path); continue; }
      if (!pyodide.FS.isFile(stat.mode)) throw new Error('Python output is not a regular file.');
      bytes += stat.size;
      if (files.length >= 200 || bytes > 2 * 1024 * 1024) throw new Error('Python output exceeds the 200-file / 2 MB workspace limit; no output files were saved.');
      const content = new TextDecoder('utf-8', { fatal: true }).decode(pyodide.FS.readFile(full));
      files.push({ path, content });
    }
  };
  walk('/workspace');
  return files;
}

async function preparePackages(pyodide, packages) {
  const missing = packages.filter((name) => !loadedPackages.has(name));
  if (!missing.length) return;
  globalThis.fetch = lockedPackageFetch;
  try {
    await pyodide.loadPackage(missing);
    loadedPackages = new Set([...loadedPackages, ...missing]);
  } finally {
    // Generated Python runs without browser networking or page credentials.
    globalThis.fetch = undefined;
  }
}

function resetWorkspace(pyodide, files) {
  pyodide.runPython(`
import os, shutil
_root = '/workspace'
os.chdir('/')
if os.path.exists(_root):
    shutil.rmtree(_root)
os.makedirs(_root)
os.chdir(_root)
`);
  for (const file of files) {
    const fullPath = `/workspace/${file.path}`;
    const parent = fullPath.slice(0, fullPath.lastIndexOf('/'));
    pyodide.FS.mkdirTree(parent);
    pyodide.FS.writeFile(fullPath, file.content, { encoding: 'utf8' });
  }
}

self.onmessage = async ({ data }) => {
  const { id, command, files } = data || {};
  let output = '';
  try {
    const pyodide = await runtimePromise;
    await preparePackages(pyodide, command.packages || []);
    lockGeneratedCodeAwayFromBrowserCapabilities();
    resetWorkspace(pyodide, files || []);
    const appendOutput = (line) => {
      if (output.length < 256 * 1024) output += `${line}\n`.slice(0, 256 * 1024 - output.length);
    };
    pyodide.setStdout({ batched: appendOutput });
    pyodide.setStderr({ batched: appendOutput });
    pyodide.globals.set('_quantora_args', command.args || []);
    pyodide.globals.set('_quantora_target', command.kind === 'script' ? command.path : command.module);
    pyodide.globals.set('_quantora_kind', command.kind);
    const exitCode = await pyodide.runPythonAsync(`
import os, runpy, sys
os.chdir('/workspace')
sys.argv = [_quantora_target] + list(_quantora_args.to_py())
_quantora_exit = 0
try:
    if _quantora_kind == 'script':
        runpy.run_path(_quantora_target, run_name='__main__')
    else:
        runpy.run_module(_quantora_target, run_name='__main__', alter_sys=True)
except SystemExit as exc:
    _quantora_exit = exc.code if isinstance(exc.code, int) else (0 if exc.code is None else 1)
_quantora_exit
`);
    const outputFiles = Number(exitCode) === 0 ? collectWorkspace(pyodide) : [];
    trustedPostMessage({ id, ok: Number(exitCode) === 0, exitCode: Number(exitCode) || 0, output: output.trim(), files: outputFiles });
  } catch (error) {
    trustedPostMessage({ id, ok: false, exitCode: 1, output: output.trim(), error: error?.message || String(error) });
  }
};
