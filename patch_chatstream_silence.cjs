const fs = require('fs');
let code = fs.readFileSync('src/hooks/useChatStream.js', 'utf8');

// The injected UI updates were:
// updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: '🧠 *Architect Agent is planning the system design...*' } : m));
// updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: '👨‍💻 *Coder Agent is executing the architecture...*' } : m));
// await new Promise(resolve => setTimeout(resolve, 800)); // UI delay
// updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: '' } : m));

// I will just rip them out using regex
code = code.replace(/updateActiveMessages\(prev => prev\.map\(m => m\.id === aiMsgId \? \{ \.\.\.m, text: '🧠 \*Architect Agent is planning the system design\.\.\.\*' \} : m\)\);/g, '');
code = code.replace(/updateActiveMessages\(prev => prev\.map\(m => m\.id === aiMsgId \? \{ \.\.\.m, text: '👨‍💻 \*Coder Agent is executing the architecture\.\.\.\*' \} : m\)\);/g, '');
code = code.replace(/await new Promise\(resolve => setTimeout\(resolve, 800\)\); \/\/ UI delay/g, '');
code = code.replace(/updateActiveMessages\(prev => prev\.map\(m => m\.id === aiMsgId \? \{ \.\.\.m, text: '' \} : m\)\);/g, '');

fs.writeFileSync('src/hooks/useChatStream.js', code);
console.log("Patched Swarm UI to be completely silent");
