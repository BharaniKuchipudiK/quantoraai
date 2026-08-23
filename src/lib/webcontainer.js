import { WebContainer } from '@webcontainer/api';
import { runDeskGit } from './studio-git.js';
import {
  answerWorkspaceListing,
  deskShellVfs,
  isWorkspaceListingCommand,
  studioWorkspaceFileEntries,
  vfsToFileSystemTree,
} from './studio-workspace-tree.js';

/** @type {WebContainer}  */
let webcontainerInstance = null;
let bootPromise = null;

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function bootWebContainer() {
  if (webcontainerInstance) return webcontainerInstance;
  if (!bootPromise) {
    bootPromise = WebContainer.boot()
      .then((instance) => {
        webcontainerInstance = instance;
        return instance;
      })
      .catch((error) => {
        bootPromise = null;
        throw error;
      });
  }
  return withTimeout(bootPromise, 25_000, 'The shell did not start. Preview still has the project files.');
}

async function writeWorkspaceFiles(instance, vfs) {
  const files = studioWorkspaceFileEntries(vfs);
  for (const { path, content } of files) {
    const slash = path.lastIndexOf('/');
    if (slash > 0) {
      await instance.fs.mkdir(path.slice(0, slash), { recursive: true });
    }
    await instance.fs.writeFile(path, content);
  }
  return files;
}

export async function syncVFSToWebContainer(vfs) {
  const instance = await bootWebContainer();
  const workspace = deskShellVfs(vfs);
  await withTimeout((async () => {
    const tree = vfsToFileSystemTree(workspace);
    if (Object.keys(tree).length > 0) {
      await instance.mount(tree);
    }
    const files = await writeWorkspaceFiles(instance, workspace);
    if (files.length && !await workspaceHasGeneratedFile(instance, files)) {
      throw new Error('The shell filesystem does not have the Preview files. No fake listing was shown.');
    }
  })(), 15_000, 'The shell filesystem did not accept the Preview files.');
  return instance;
}

async function workspaceHasGeneratedFile(instance, files) {
  const expected = files.find((file) => /(?:^|\/)(?:index\.html|src\/App\.jsx|src\/main\.jsx)$/.test(file.path))
    || files[0];
  if (!expected) return false;
  try {
    const contents = await instance.fs.readFile(expected.path, 'utf-8');
    return typeof contents === 'string' && contents.length > 0;
  } catch {
    return false;
  }
}

async function spawnCollected(instance, command, args, timeoutMs = 20_000) {
  const process = await instance.spawn(command, args);
  let output = '';
  const reader = process.output.getReader();
  const timeout = setTimeout(() => {
    try { process.kill(); } catch { /* already exited */ }
  }, timeoutMs);
  try {
    const readAll = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += typeof value === 'string' ? value : new TextDecoder().decode(value);
      }
    })();
    await Promise.race([
      readAll,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('The shell command timed out.')), timeoutMs + 1500);
      }),
    ]).catch(() => {
      try { process.kill(); } catch { /* already exited */ }
    });
  } finally {
    clearTimeout(timeout);
    try { reader.releaseLock(); } catch { /* closed */ }
  }
  const exit = await Promise.race([
    process.exit,
    new Promise((resolve) => setTimeout(() => resolve(1), 2000)),
  ]);
  const text = String(output || '').trim();
  return {
    ok: exit === 0,
    output: text || (exit === 0 ? '' : `(exit ${exit})`),
  };
}

export async function runCommandInWorkspace(vfs, commandLine) {
  const line = String(commandLine || '').trim();
  if (!line) return { ok: true, output: '' };

  if (isWorkspaceListingCommand(line)) {
    return answerWorkspaceListing(vfs);
  }

  const tree = deskShellVfs(vfs);
  const instance = await syncVFSToWebContainer(tree);
  const result = await spawnCollected(instance, 'jsh', ['-c', line]);
  return {
    ok: result.ok,
    output: result.output || `(exit ${result.ok ? 0 : 1})`,
  };
}

export async function runGitInWorkspace(vfs, { action, message, workspaceKey } = {}) {
  return runDeskGit(deskShellVfs(vfs), { action, message, workspaceKey });
}
