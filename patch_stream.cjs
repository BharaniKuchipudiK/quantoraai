const fs = require('fs');
let code = fs.readFileSync('src/hooks/useChatStream.js', 'utf8');

if (!code.includes('import { useRef }')) {
  code = `import { useRef } from 'react';\n` + code;
}

code = code.replace(
  /export function useChatStream\(\{\n([^\}]+)\n\}\) \{/,
  "export function useChatStream({\n$1\n}) {\n  const abortControllerRef = useRef(null);"
);

// Add cancelStream function
const cancelStreamFunc = `
  const cancelStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      updateActiveMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.sender === 'ai' && !last.text) {
          return [...prev.slice(0, -1), { ...last, text: '⚠️ **Generation Stopped**: The request was cancelled by the user.', isError: true }];
        } else if (last && last.sender === 'ai') {
           return [...prev.slice(0, -1), { ...last, text: last.text + '\\n\\n*(Stopped by user)*' }];
        }
        return prev;
      });
    }
  };
`;
code = code.replace('const handleSendMessage = async (textToSend) => {', cancelStreamFunc + '\n  const handleSendMessage = async (textToSend) => {');

// Inject AbortController into Single Model Fetch
code = code.replace(
  /const res = await fetch\('\/api\/chat', \{/,
  `abortControllerRef.current = new AbortController();\n      const timeoutId = setTimeout(() => { if(abortControllerRef.current) abortControllerRef.current.abort('timeout'); }, 60000);\n      const res = await fetch('/api/chat', {\n        signal: abortControllerRef.current.signal,`
);

// Clear timeout on reader start
code = code.replace(
  /const reader = res\.body\.getReader\(\);/,
  `clearTimeout(timeoutId);\n        const reader = res.body.getReader();`
);

// Handle AbortError in catch block for Single Model
code = code.replace(
  /\} catch \(err\) \{/,
  `} catch (err) {\n      if (typeof timeoutId !== 'undefined') clearTimeout(timeoutId);\n      if (err.name === 'AbortError' || err === 'timeout') {\n        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {\n          ...m,\n          text: err === 'timeout' ? '⚠️ **Request Timed Out**: The model took too long to respond (>60s). Please try again or switch models.' : '⚠️ **Generation Stopped**'\n        } : m));\n        return;\n      }`
);

// Update Return
code = code.replace(
  'return { handleSendMessage };',
  'return { handleSendMessage, cancelStream };'
);

fs.writeFileSync('src/hooks/useChatStream.js', code);
console.log("Patched useChatStream.js");
