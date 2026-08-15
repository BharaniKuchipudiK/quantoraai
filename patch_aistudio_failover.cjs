const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

// The active message is the last one in the messages array
const targetCode = `const isActiveGenerating = isGenerating && msg.id === messages[messages.length - 1].id;`;
const replacementCode = `const isActiveGenerating = isGenerating && msg.id === messages[messages.length - 1].id;
      const isFailover = isActiveGenerating && msg.isFailover;`;
code = code.replace(targetCode, replacementCode);

// Update the thinking text block to account for isFailover
const thinkingBlockTarget = `{thinkingTime > 45 ? 'The model is experiencing high latency...' :
                   thinkingTime > 25 ? 'Still working on your request...' :
                   thinkingTime > 10 ? 'This is taking a bit longer than usual...' :
                   \`\${selectedModel ? formatModelName(selectedModel.name) : 'Model'} is thinking...\`}`;
                   
const thinkingBlockReplacement = `{isFailover ? 'Original model stalled. Proactively switching to a faster model...' :
                   thinkingTime > 45 ? 'The model is experiencing high latency...' :
                   thinkingTime > 25 ? 'Still working on your request...' :
                   thinkingTime > 10 ? 'This is taking a bit longer than usual...' :
                   \`\${selectedModel ? formatModelName(selectedModel.name) : 'Model'} is thinking...\`}`;

code = code.replace(thinkingBlockTarget, thinkingBlockReplacement);
fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx for Failover UI");
