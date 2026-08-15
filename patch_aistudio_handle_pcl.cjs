const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

const target1 = `streamSendMessage(pclIntercept.text); // Note: streamSendMessage will use the old selectedModel reference from closure unless we pass it,`;
const replace1 = `streamSendMessage(pclIntercept.text, geminiModel);`;
code = code.replace(target1, replace1);

// clear comments
const target2 = `// but wait, since streamSendMessage uses the state \`selectedModel\`, it might use the old one if state hasn't flushed. 
      // Actually, useChatStream accesses \`selectedModel\` from its props. 
      // We should probably just pass the model override to streamSendMessage, but useChatStream doesn't support that right now. 
      // So we will just update activeMessages with a fake user message, wait for state to flush, or just let useChatStream handle it. 
      // For simplicity, since \`setSelectedModel\` updates it, we can use a \`useEffect\` or just add \`targetModelOverride\` to \`handleSendMessage\` in useChatStream.
      // Wait, let's just modify useChatStream to accept an optional targetModel override.`;
code = code.replace(target2, ``);

fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx decision handler");
