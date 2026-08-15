const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

const target = `} from 'lucide-react';`;
const replacement = `, ThumbsUp, ThumbsDown } from 'lucide-react';`;
code = code.replace(target, replacement);

fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched lucide imports");
