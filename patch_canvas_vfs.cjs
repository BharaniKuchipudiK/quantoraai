const fs = require('fs');
let code = fs.readFileSync('src/components/LivePreviewCanvas.jsx', 'utf8');

// Update props to include vfs
const propsTarget = `export default function LivePreviewCanvas({
  code,
  isLight,`;
const propsReplacement = `export default function LivePreviewCanvas({
  code,
  vfs = {},
  isLight,`;
code = code.replace(propsTarget, propsReplacement);

// Update injectPreviewHarness to accept vfs
const injectTarget = `const fullHtml = await injectPreviewHarness(previewCode, isLight);`;
const injectReplacement = `const fullHtml = await injectPreviewHarness(previewCode, isLight, vfs);`;
code = code.replace(injectTarget, injectReplacement);

fs.writeFileSync('src/components/LivePreviewCanvas.jsx', code);
console.log("Patched LivePreviewCanvas.jsx to accept vfs");
