const fs = require('fs');
let code = fs.readFileSync('src/components/AiStudio.jsx', 'utf8');

// 1. Import usePCLMemory
if (!code.includes('import { usePCLMemory }')) {
  code = code.replace(
    /import \{ useChatStream \} from '\.\.\/hooks\/useChatStream';/,
    "import { useChatStream } from '../hooks/useChatStream';\nimport { usePCLMemory } from '../hooks/usePCLMemory';"
  );
}

// 2. Add state and hooks
const stateHookTarget = `const [thinkingTime, setThinkingTime] = useState(0);`;
const stateHookReplacement = `const [thinkingTime, setThinkingTime] = useState(0);
  const { checkModelHealth } = usePCLMemory();
  const [pclIntercept, setPclIntercept] = useState(null);`;
code = code.replace(stateHookTarget, stateHookReplacement);

// 3. Rename handleSendMessage and create wrapper
const chatStreamTarget = `const { handleSendMessage, cancelStream } = useChatStream({`;
const chatStreamReplacement = `const { handleSendMessage: streamSendMessage, cancelStream } = useChatStream({`;
code = code.replace(chatStreamTarget, chatStreamReplacement);

const wrapperInjectionTarget = `  const renderedChatFeed = React.useMemo(() => {`;
const wrapperInjectionReplacement = `  const handleSendMessage = (overrideText = null) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() && !attachments.length) return;
    
    // HUMAN IN THE LOOP: PCL Memory Check
    if (selectedModel && !arenaMode) {
      const health = checkModelHealth(selectedModel.id);
      if (!health.isHealthy) {
        setPclIntercept({ text: textToSend, targetModel: selectedModel, errorType: health.errorType, timeAgo: health.lastFailureMsAgo });
        return; // Intercept!
      }
    }
    
    streamSendMessage(overrideText);
  };
  
  const handlePclDecision = (routeToGemini) => {
    if (!pclIntercept) return;
    if (routeToGemini) {
      // Force change model to Gemini
      const geminiModel = { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };
      if (setSelectedModel) setSelectedModel(geminiModel);
      streamSendMessage(pclIntercept.text); // Note: streamSendMessage will use the old selectedModel reference from closure unless we pass it, 
      // but wait, since streamSendMessage uses the state \`selectedModel\`, it might use the old one if state hasn't flushed. 
      // Actually, useChatStream accesses \`selectedModel\` from its props. 
      // We should probably just pass the model override to streamSendMessage, but useChatStream doesn't support that right now. 
      // So we will just update activeMessages with a fake user message, wait for state to flush, or just let useChatStream handle it. 
      // For simplicity, since \`setSelectedModel\` updates it, we can use a \`useEffect\` or just add \`targetModelOverride\` to \`handleSendMessage\` in useChatStream.
      // Wait, let's just modify useChatStream to accept an optional targetModel override.
    } else {
      streamSendMessage(pclIntercept.text);
    }
    setPclIntercept(null);
  };

  const renderedChatFeed = React.useMemo(() => {`;
code = code.replace(wrapperInjectionTarget, wrapperInjectionReplacement);

fs.writeFileSync('src/components/AiStudio.jsx', code);
console.log("Patched AiStudio.jsx wrapper");
