const fs = require('fs');
let code = fs.readFileSync('src/lib/vfs-parser.js', 'utf8');

const importPatch = `import { applyDiffPatch } from './diff-patcher.js';\n`;
if (!code.includes('diff-patcher')) {
  code = importPatch + code;
}

const target = `export function parseVFSFromMarkdown(text) {
  const vfs = {};`;
const replacement = `export function parseVFSFromMarkdown(text, currentVfs = {}) {
  // Deep clone currentVfs to prevent mutating React state directly
  const vfs = JSON.parse(JSON.stringify(currentVfs));`;
code = code.replace(target, replacement);

const updateVfsTarget = `// Update VFS
    vfs[filepath] = {
      content: code,
      language: normalizedLanguage
    };`;
const updateVfsReplacement = `// Update VFS
    if (code.includes('<<<<') && code.includes('====')) {
       // It's a diff patch! Apply it to the existing content if it exists
       const existingContent = vfs[filepath] ? vfs[filepath].content : '';
       vfs[filepath] = {
          content: applyDiffPatch(existingContent, code),
          language: normalizedLanguage
       };
    } else {
       // It's a full rewrite
       vfs[filepath] = {
         content: code,
         language: normalizedLanguage
       };
    }`;
code = code.replace(updateVfsTarget, updateVfsReplacement);

fs.writeFileSync('src/lib/vfs-parser.js', code);
console.log("Patched vfs-parser.js for diff patching");
