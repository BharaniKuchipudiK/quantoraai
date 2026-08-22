import { WebContainer } from '@webcontainer/api';
import { studioGitArgv } from './studio-git.js';

/** Last coding-desk session whose .git we keep. Changing chats drops that repo. */
let gitWorkspaceKey = '';

/** @type {WebContainer}  */
let webcontainerInstance = null;

export async function bootWebContainer() {
  if (webcontainerInstance) {
    return webcontainerInstance;
  }
  
  // Call only once
  webcontainerInstance = await WebContainer.boot();
  return webcontainerInstance;
}

export async function syncVFSToWebContainer(vfs) {
  const instance = await bootWebContainer();
  
  // Convert our VFS to WebContainer format
  const tree = {};
  for (const [path, file] of Object.entries(vfs)) {
    // For now, assume flat structure or simple paths
    // WebContainers expect: { 'file.js': { file: { contents: '...' } } }
    
    // Split path into parts to build directory tree
    const parts = path.split('/');
    let currentLevel = tree;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        currentLevel[part] = {
          file: {
            contents: file.content
          }
        };
      } else {
        if (!currentLevel[part]) {
          currentLevel[part] = { directory: {} };
        }
        currentLevel = currentLevel[part].directory;
      }
    }
  }
  
  await instance.mount(tree);
  return instance;
}

async function spawnCollected(instance, command, args, timeoutMs = 20_000) {
  const process = await instance.spawn(command, args);
  let output = '';
  const reader = process.output.getReader();
  const timeout = setTimeout(() => {
    try { process.kill(); } catch { /* already exited */ }
  }, timeoutMs);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += typeof value === 'string' ? value : new TextDecoder().decode(value);
    }
  } finally {
    clearTimeout(timeout);
    try { reader.releaseLock(); } catch { /* closed */ }
  }
  const exit = await process.exit;
  const text = String(output || '').trim();
  return {
    ok: exit === 0,
    output: text || (exit === 0 ? '' : `(exit ${exit})`),
  };
}

export async function runCommandInWorkspace(vfs, commandLine) {
  const line = String(commandLine || '').trim();
  if (!line) return { ok: true, output: '' };

  const instance = await syncVFSToWebContainer(vfs);
  const result = await spawnCollected(instance, 'jsh', ['-c', line]);
  return {
    ok: result.ok,
    output: result.output || `(exit ${result.ok ? 0 : 1})`,
  };
}

export async function runGitInWorkspace(vfs, { action, message, workspaceKey } = {}) {
  const argvList = studioGitArgv(action, message);
  const instance = await syncVFSToWebContainer(vfs);
  const nextKey = String(workspaceKey || 'default');
  if (gitWorkspaceKey && gitWorkspaceKey !== nextKey) {
    await spawnCollected(instance, 'rm', ['-rf', '.git']);
  }
  gitWorkspaceKey = nextKey;

  const chunks = [];
  let ok = true;
  for (const argv of argvList) {
    const [command, ...args] = argv;
    let result;
    try {
      result = await spawnCollected(instance, command, args);
    } catch (error) {
      return {
        ok: false,
        output: error?.message || 'Git is not available in this shell. No fake status was shown.',
      };
    }
    if (result.output) chunks.push(result.output);
    if (!result.ok) {
      ok = false;
      if (!result.output) chunks.push(`(exit failed)`);
      break;
    }
  }
  return {
    ok,
    output: chunks.join('\n\n').trim(),
  };
}

