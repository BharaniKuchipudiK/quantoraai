import { WebContainer } from '@webcontainer/api';

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

export async function runCommandInWorkspace(vfs, commandLine) {
  const line = String(commandLine || '').trim();
  if (!line) return { ok: true, output: '' };

  const instance = await syncVFSToWebContainer(vfs);
  const process = await instance.spawn('jsh', ['-c', line]);
  let output = '';
  const reader = process.output.getReader();
  const timeout = setTimeout(() => {
    try { process.kill(); } catch { /* already exited */ }
  }, 20_000);
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
    output: text || `(exit ${exit})`,
  };
}

