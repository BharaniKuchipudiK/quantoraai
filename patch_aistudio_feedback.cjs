const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

const targetDestructure = `const { checkModelHealth, logPreference } = usePCLMemory();`;
const newDestructure = `const { checkModelHealth, logPreference, logFeedback } = usePCLMemory();`;
code = code.replace(targetDestructure, newDestructure);

// Find the AI message toolbar (the one outside Arena Mode, i.e., standard messages)
// It usually has a Copy button for standard AI messages.
// Let's locate it by looking for the AI action toolbar.
const standardAiToolbarRegex = /\{msg\.sender === 'ai' && \!msg\.isSystem && \!msg\.isDual && \([\s\S]*?<div style=\{\{ display: 'flex', gap: '8px' \}\}>([\s\S]*?)<\/div>/;

// If we can't reliably regex it, we can just inject into standard AI message rendering. Let's do a search for the exact HTML structure first.
fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched logFeedback destructure");
