const fs = require('fs');
let code = fs.readFileSync('vite.config.ts', 'utf8');

const targetServer = `    server: {`;
const newServer = `    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin'
      },`;

code = code.replace(targetServer, newServer);
fs.writeFileSync('vite.config.ts', code);
console.log("Patched vite.config.ts");
