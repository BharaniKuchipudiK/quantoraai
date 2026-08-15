const fs = require('fs');
let code = fs.readFileSync('src/hooks/useChatStream.js', 'utf8');

const target1 = `const handleSendMessage = async (textToSend) => {`;
const replace1 = `const handleSendMessage = async (textToSend, targetModelOverride = null) => {`;
code = code.replace(target1, replace1);

const target2 = `const targetModel = selectedModel || { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };`;
const replace2 = `const targetModel = targetModelOverride || selectedModel || { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };`;
code = code.replace(target2, replace2);

fs.writeFileSync('src/hooks/useChatStream.js', code);
console.log("Patched useChatStream.js override");
