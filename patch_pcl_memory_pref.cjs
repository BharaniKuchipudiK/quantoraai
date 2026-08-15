const fs = require('fs');
let code = fs.readFileSync('src/hooks/usePCLMemory.js', 'utf8');

const target = `return { logModelFailure, checkModelHealth, clearModelHealth };`;
const replacement = `const logPreference = (modelId, score = 1) => {
    if (!modelId) return;
    const mem = getMemory();
    if (!mem.preferences) mem.preferences = {};
    mem.preferences[modelId] = (mem.preferences[modelId] || 0) + score;
    saveMemory(mem);
  };
  return { logModelFailure, checkModelHealth, clearModelHealth, logPreference };`;
code = code.replace(target, replacement);

fs.writeFileSync('src/hooks/usePCLMemory.js', code);
console.log("Patched usePCLMemory.js for preferences");
