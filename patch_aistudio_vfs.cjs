const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

// 1. Import parseVFSFromMarkdown
if (!code.includes('parseVFSFromMarkdown')) {
  code = code.replace(
    /import \{ extractRunnableCode \} from '\.\.\/lib\/preview-utils\.js';/g,
    `import { extractRunnableCode } from '../lib/preview-utils.js';\nimport { parseVFSFromMarkdown } from '../lib/vfs-parser.js';`
  );
  // fallback if extractRunnableCode isn't explicitly imported
  if (!code.includes('../lib/vfs-parser.js')) {
     code = `import { parseVFSFromMarkdown } from '../lib/vfs-parser.js';\n` + code;
  }
}

// 2. Add vfs state
const stateTarget = `const [workspaceCode, setWorkspaceCode] = useState('');`;
const stateReplacement = `const [workspaceCode, setWorkspaceCode] = useState('');
  const [vfs, setVfs] = useState({});`;
code = code.replace(stateTarget, stateReplacement);

// 3. Update useEffect that processes the final AI message
const useEffectTarget = `const code = extractRunnableCode(lastMsg.text);
        if (code) {
           setWorkspaceCode(code);
           setWorkspaceActiveTab('preview');
           setIsWorkspaceMode(true);
        }`;
const useEffectReplacement = `const parsedVfs = parseVFSFromMarkdown(lastMsg.text);
        if (Object.keys(parsedVfs).length > 0) {
           setVfs(parsedVfs);
           // Also set workspaceCode for backward compatibility in case some child components strictly expect string
           setWorkspaceCode(parsedVfs['App.jsx']?.content || parsedVfs[Object.keys(parsedVfs)[0]]?.content || '');
           setWorkspaceActiveTab('preview');
           setIsWorkspaceMode(true);
        } else {
           // Fallback for old single-string generations
           const code = extractRunnableCode(lastMsg.text);
           if (code) {
              setWorkspaceCode(code);
              setVfs({ 'App.jsx': { content: code, language: 'jsx' } });
              setWorkspaceActiveTab('preview');
              setIsWorkspaceMode(true);
           }
        }`;
code = code.replace(useEffectTarget, useEffectReplacement);

// 4. Update LivePreviewCanvas props to pass vfs
const canvasTarget = `<LivePreviewCanvas
              code={workspaceCode}
              isLight={isLight}`;
const canvasReplacement = `<LivePreviewCanvas
              code={workspaceCode}
              vfs={vfs}
              isLight={isLight}`;
code = code.replace(canvasTarget, canvasReplacement);

fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx with VFS state");
