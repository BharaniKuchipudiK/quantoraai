const fs = require('fs');
let code = fs.readFileSync('src/lib/preview-utils.js', 'utf8');

const target = `export async function injectPreviewHarness(reactCode, isLight) {`;
const replace = `export async function injectPreviewHarness(reactCode, isLight, vfs = {}) {
  // Extract CSS from VFS
  let injectedCSS = '';
  Object.keys(vfs).forEach(filepath => {
    if (filepath.endsWith('.css') && vfs[filepath].content) {
      injectedCSS += vfs[filepath].content + '\\n';
    }
  });
`;
code = code.replace(target, replace);

const headTarget = `</title>`;
const headReplace = `</title>\n    <style id="vfs-injected-styles">\n      \${injectedCSS}\n    </style>`;
code = code.replace(headTarget, headReplace);

fs.writeFileSync('src/lib/preview-utils.js', code);
console.log("Patched preview-utils.js to inject VFS CSS");
