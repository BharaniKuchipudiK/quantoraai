export function useChatStream({
  inputText,
  setInputText,
  attachments,
  setAttachments,
  isGenerating,
  setIsGenerating,
  updateActiveMessages,
  chatSessions,
  activeSessionId,
  selectedModel,
  arenaMode,
  secondModel,
  cognitiveLevel,
  canvasCode,
  messages,
  setLastPrompt
}) {
  const handleSendMessage = async (textToSend) => {
    let text = textToSend || inputText;
    if (!text.trim() && !attachments.length) return;
    if (isGenerating) return;

    // Inject Context Chips
    const contextChips = attachments.filter(a => a.type === 'context');
    if (contextChips.length > 0) {
      let contextString = "";
      for (const chip of contextChips) {
        if (chip.contextType === 'canvas') {
          contextString += `\n\n[CONTEXT: CURRENT CANVAS CODE]\n\`\`\`\n${canvasCode}\n\`\`\``;
        } else if (chip.contextType === 'history') {
           const prevSession = chatSessions.find(s => s.id !== activeSessionId);
           if (prevSession) {
             const stringifiedHistory = prevSession.messages.map(m => `${m.sender.toUpperCase()}: ${m.text}`).join('\n');
             contextString += `\n\n[CONTEXT: PREVIOUS SESSION (${prevSession.title})]\n${stringifiedHistory.substring(0, 5000)}...`;
           }
        }
      }
      text = text + contextString;
    }

    setLastPrompt(text.trim());

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: text.trim(),
      attachments: [...attachments]
    };

    updateActiveMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setAttachments([]);
    setIsGenerating(true);

    try {
      const modRes = await fetch('/api/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text.trim() })
      });
      const modData = await modRes.json();
      
      if (modData.flagged) {
        updateActiveMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'ai',
          text: `🚨 **Policy Violation Detected**\n\n${modData.reason}\n\n*Flagged Pattern: \`${modData.matchedPattern}\`*`,
          isError: true
        }]);
        setIsGenerating(false);
        return;
      }
    } catch (e) {
      console.error("Moderation API failed, failing open...", e);
    }


    const targetModel = selectedModel || { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };

    const geminiApiKey = localStorage.getItem('geminiApiKey');
    const openRouterApiKey = localStorage.getItem('openRouterApiKey');

    const cleanMessages = messages.filter(m => m.id !== 1 && !m.isKeyPrompt && !m.text?.includes('⚠️ **API Key Required'));

    // 1. Dual Model Arena Execution Mode
    if (arenaMode) {
      const modelA = targetModel;
      const modelB = secondModel || { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nvidia Nemotron 3 Ultra' };

      const dualMsgId = Date.now() + 1;
      const dualMsg = {
        id: dualMsgId, sender: 'ai', type: 'arena_battle', isDual: true, prompt: text,
        modelA: { modelName: modelA.name, text: '', provider: modelA.name, latencyMs: 0 },
        modelB: { modelName: modelB.name, text: '', provider: modelB.name, latencyMs: 0 }
      };
      updateActiveMessages(prev => [...prev, dualMsg]);

      const streamSingleModel = async (mod, isModelA) => {
        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, modelId: mod.id, modelName: mod.name, history: cleanMessages, userKey: geminiApiKey, openRouterKey: openRouterApiKey })
          });
          
          if (!res.ok) throw new Error('API Error');
          
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let currentText = "";
          let finalProvider = mod.name;
          let finalLatency = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') break;
                try {
                  const parsed = JSON.parse(dataStr);
                  if (parsed.text) {
                    currentText += parsed.text;
                    updateActiveMessages(prev => prev.map(m => {
                      if (m.id === dualMsgId) {
                        const updatedModelInfo = { modelName: mod.name, text: currentText, provider: finalProvider, latencyMs: finalLatency };
                        return { ...m, modelA: isModelA ? updatedModelInfo : m.modelA, modelB: !isModelA ? updatedModelInfo : m.modelB };
                      }
                      return m;
                    }));
                  }
                  if (parsed.provider) {
                    finalProvider = parsed.provider;
                    finalLatency = parsed.latencyMs || 0;
                    updateActiveMessages(prev => prev.map(m => {
                      if (m.id === dualMsgId) {
                        const updatedModelInfo = { modelName: mod.name, text: currentText, provider: finalProvider, latencyMs: finalLatency };
                        return { ...m, modelA: isModelA ? updatedModelInfo : m.modelA, modelB: !isModelA ? updatedModelInfo : m.modelB };
                      }
                      return m;
                    }));
                  }
                } catch (e) {}
              }
            }
          }
          
        } catch (e) {
          updateActiveMessages(prev => prev.map(m => m.id === dualMsgId ? { ...m, [isModelA ? 'modelA' : 'modelB']: { ...m[isModelA ? 'modelA' : 'modelB'], text: `Connection error: ${e.message}` } } : m));
        }
      };

      try {
        await Promise.all([streamSingleModel(modelA, true), streamSingleModel(modelB, false)]);
      } catch (err) {
        console.error('Arena Execution Error:', err);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // 2. Standard Single Model Execution Mode
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

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: text,
          modelId: targetModel.id,
          modelName: targetModel.name,
          history: cleanMessages,
          openRouterKey: openRouterApiKey,
          cognitiveLevel: cognitiveLevel
        })
      });

      if (res.ok) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let currentText = "";

        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
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
                    text: currentText
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

      } else {
        const errData = await res.json().catch(() => ({}));

        /*
         * "You need to sign in" and "you need an API key" are different
         * problems with different fixes. Collapsing both into the key prompt
         * told signed-out users to paste a key they did not need, which read
         * as the key handling being broken.
         */
        if (res.status === 401 && errData.requiresAuth) {
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `🔒 **Please sign in to continue.**\n\n${errData.error || "Sign in to use Quantora's built-in AI."}`,
            isAuthPrompt: true
          } : m));
        } else if (res.status === 429) {
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `⏳ **Slow down a moment.** ${errData.error || 'Too many requests.'}`
          } : m));
        } else {
          const errText = errData.error || `The backend server encountered an error with ${targetModel.name}.`;

          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `⚠️ **Server Error**: ${errText}\n\nQuantora is unable to process this request at the moment. Please try again later or select a different model.`
          } : m));
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        text: `⚠️ **Connection Error**: Unable to reach Quantora's AI gateway for ${targetModel.name}. Please check your connection and try again.`
      } : m));
    } finally {
      setIsGenerating(false);
    }
  };
  return { handleSendMessage };
}
