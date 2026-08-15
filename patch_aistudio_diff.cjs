const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

const target = `const parsedVfs = parseVFSFromMarkdown(lastMsg.text);`;
const replacement = `const parsedVfs = parseVFSFromMarkdown(lastMsg.text, vfs);`;
code = code.replace(target, replacement);

fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx for diff parsing arguments");
