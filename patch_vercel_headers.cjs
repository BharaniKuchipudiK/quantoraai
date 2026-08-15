const fs = require('fs');
let config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

// Find the main headers rule
let mainRule = config.headers.find(h => h.source === '/((?!preview/).*)');
if (mainRule) {
  mainRule.headers.push({
    "key": "Cross-Origin-Embedder-Policy",
    "value": "require-corp"
  });
  mainRule.headers.push({
    "key": "Cross-Origin-Opener-Policy",
    "value": "same-origin"
  });
}

fs.writeFileSync('vercel.json', JSON.stringify(config, null, 2));
console.log("Patched vercel.json headers");
