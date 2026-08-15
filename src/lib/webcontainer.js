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
