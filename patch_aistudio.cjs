const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

// 1. Extract cancelStream
code = code.replace(
  /const \{ handleSendMessage \} = useChatStream\(\{/,
  'const { handleSendMessage, cancelStream } = useChatStream({'
);

// 2. Add thinkingTime state
code = code.replace(
  /const \[lastProcessedMessageId, setLastProcessedMessageId\] = useState\(null\);/,
  "const [lastProcessedMessageId, setLastProcessedMessageId] = useState(null);\n  const [thinkingTime, setThinkingTime] = useState(0);"
);

// 3. Add useEffect to track thinking time
const timerEffect = `
  useEffect(() => {
    let interval;
    if (isGenerating) {
      setThinkingTime(0);
      interval = setInterval(() => {
        setThinkingTime(prev => prev + 1);
      }, 1000);
    } else {
      setThinkingTime(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);
`;
code = code.replace(
  /useEffect\(\(\) => \{\n    if \(\!isGenerating/,
  timerEffect + "\n  useEffect(() => {\n    if (!isGenerating"
);

// 4. Update the "is thinking..." rendering block
const oldThinkingBlock = `<div style={{ flex: 1, color: '#f97316', fontSize: '0.9rem', paddingTop: '8px', fontWeight: 500 }}>
                  {selectedModel ? formatModelName(selectedModel.name) : 'Qwen 2.5 Coder'} is thinking...
                </div>`;
                
const newThinkingBlock = `<div style={{ flex: 1, color: '#f97316', fontSize: '0.9rem', paddingTop: '8px', fontWeight: 500 }}>
                  {thinkingTime > 45 ? 'The model is experiencing high latency...' :
                   thinkingTime > 25 ? 'Still working on your request...' :
                   thinkingTime > 10 ? 'This is taking a bit longer than usual...' :
                   \`\${selectedModel ? formatModelName(selectedModel.name) : 'Model'} is thinking...\`}
                </div>
                <button 
                  onClick={() => cancelStream()} 
                  style={{ background: 'transparent', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '6px', color: '#f97316', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}
                >
                  <X size={12} /> Stop
                </button>`;
                
code = code.replace(oldThinkingBlock, newThinkingBlock);

fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx");
