const fs = require('fs');
let code = fs.readFileSync('src/hooks/useChatStream.js', 'utf8');

// The single model execution mode block:
const regex = /\/\/ 2\. Standard Single Model Execution Mode\n    const aiMsgId = Date\.now\(\) \+ 1;\n    const initialAiMsg = \{[\s\S]+?finally \{\n      setIsGenerating\(false\);\n    \}\n/;

const newLogic = `// 2. Standard Single Model Execution Mode
    const aiMsgId = Date.now() + 1;
    const initialAiMsg = {
      id: aiMsgId,
      sender: 'ai',
      modelUsed: targetModel.name,
      text: '',
      componentType: 'formatted_text',
      latencyMs: 0,
      provider: targetModel.name,
      liveConnected: true
    };
    updateActiveMessages(prev => [...prev, initialAiMsg]);

    const executeSingleModel = async (modelToUse, attempt = 1) => {
      try {
        abortControllerRef.current = new AbortController();
        const timeoutId = setTimeout(() => { if(abortControllerRef.current) abortControllerRef.current.abort('timeout'); }, 60000);
        const res = await fetch('/api/chat', {
          signal: abortControllerRef.current.signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: text,
            modelId: modelToUse.id,
            modelName: modelToUse.name,
            history: cleanMessages,
            openRouterKey: openRouterApiKey,
            cognitiveLevel: cognitiveLevel
          })
        });

        if (res.ok) {
          clearTimeout(timeoutId);
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let currentText = "";
          let buffer = "";
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\\n');
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') break;
                try {
                  const parsed = JSON.parse(dataStr);
                  if (parsed.text) {
                    currentText += parsed.text;
                    updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                      ...m,
                      text: currentText,
                      modelUsed: modelToUse.name // Ensure the active message reflects the fallback model
                    } : m));
                  }
                  if (parsed.provider) {
                    updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                      ...m,
                      provider: parsed.provider,
                      latencyMs: parsed.latencyMs || 0
                    } : m));
                  }
                } catch (e) {}
              }
            }
          }
          setIsGenerating(false);
        } else {
          clearTimeout(timeoutId);
          const errData = await res.json().catch(() => ({}));
          
          if (res.status === 401 && errData.requiresAuth) {
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              text: \`🔒 **Please sign in to continue.**\\n\\n\${errData.error || "Sign in to use Quantora's built-in AI."}\`,
              isAuthPrompt: true
            } : m));
            setIsGenerating(false);
          } else if (res.status === 429) {
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              text: \`⏳ **Slow down a moment.** \${errData.error || 'Too many requests.'}\`
            } : m));
            setIsGenerating(false);
          } else {
            // PROACTIVE FAILOVER ON SERVER ERROR (503 / 500)
            if (attempt === 1) {
               console.log("PCL: Intercepted server error. Auto-failing over...");
               const fallbackModel = { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };
               updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                 ...m,
                 isFailover: true,
                 text: '' // reset text just in case
               } : m));
               return executeSingleModel(fallbackModel, 2);
            }
            
            const errText = errData.error || \`The backend server encountered an error with \${modelToUse.name}.\`;
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              text: \`⚠️ **Server Error**: \${errText}\\n\\nQuantora is unable to process this request at the moment.\`
            } : m));
            setIsGenerating(false);
          }
        }
      } catch (error) {
        if (error.name === 'AbortError' || error === 'timeout') {
            // PROACTIVE FAILOVER ON TIMEOUT
            if (attempt === 1 && error === 'timeout') {
               console.log("PCL: Intercepted timeout. Auto-failing over...");
               const fallbackModel = { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };
               updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                 ...m,
                 isFailover: true,
                 text: ''
               } : m));
               return executeSingleModel(fallbackModel, 2);
            }
            
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              text: error === 'timeout' ? '⚠️ **Request Timed Out**: The model took too long to respond (>60s). Please try again or switch models.' : '⚠️ **Generation Stopped**'
            } : m));
            setIsGenerating(false);
            return;
        }
        
        console.error('Chat error:', error);
        
        if (attempt === 1) {
           console.log("PCL: Intercepted connection error. Auto-failing over...");
           const fallbackModel = { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };
           updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
             ...m,
             isFailover: true,
             text: ''
           } : m));
           return executeSingleModel(fallbackModel, 2);
        }
        
        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          text: \`⚠️ **Connection Error**: Unable to reach Quantora's AI gateway for \${modelToUse.name}. Please check your connection.\`
        } : m));
        setIsGenerating(false);
      }
    };
    
    executeSingleModel(targetModel, 1);
`;

code = code.replace(regex, newLogic);
fs.writeFileSync('src/hooks/useChatStream.js', code);
console.log("Patched useChatStream.js for auto-failover");
