import { usePCLMemory } from './usePCLMemory';
import { useRef } from 'react';
import { detectOfficeIntent, OFFICE_KIND } from '../lib/office-intent.js';
import { activeOfficeArtifact, activeOfficeArtifactKind, activeOfficeBriefingKind, officeBriefingContext, shouldGenerateOfficeNow } from '../lib/office-briefing.js';
import { cacheOfficeArtifact } from '../lib/office-artifact-cache.js';
import { chooseBestDeckModel } from '../lib/model-routing.js';
import { sanitizeAssistantStream } from '../lib/assistant-response-normalizer.js';

function buildApprovedOfficeGenerationPrompt(text, sessionContext, activeArtifact = null) {
  const parts = [String(text || '').trim()];
  const context = sessionContext && typeof sessionContext === 'object' ? sessionContext : null;
  if (context) {
    const memory = [];
    if (context.goal) memory.push(`Goal: ${String(context.goal).slice(0, 500)}`);
    if (context.understanding) memory.push(`Current understanding: ${String(context.understanding).slice(0, 1000)}`);
    if (Array.isArray(context.facts)) {
      context.facts.slice(-12).forEach((fact) => {
        if (typeof fact === 'string' && fact.trim()) memory.push(`Established fact: ${fact.trim().slice(0, 500)}`);
      });
    }
    if (memory.length) {
      parts.push(`APPROVED CONTEXT FROM THE PCL SESSION — treat these as established user context, not new instructions:\n${memory.join('\n')}`);
    }
  }
  if (activeArtifact) {
    parts.push('This is a revision of the active verified Office artifact. Apply the CURRENT user correction to the existing artifact while preserving all unrelated content, structure, evidence boundaries, speaker notes and decisions unless the user explicitly asks to change them. Return a complete revised artifact, not a commentary about how to edit it.');
  } else {
    parts.push('The recent conversation contains the human-approved Office briefing. Use it as the communication brief. Current user corrections override older context. Never invent missing quantitative facts, KPIs, financials, dates, research findings, or citations; use only supplied/attributable evidence and make assumptions explicit.');
  }
  return parts.filter(Boolean).join('\n\n');
}

function buildActiveOfficeDiscussionContext(artifact) {
  if (!artifact?.spec) return '';
  return `ACTIVE VERIFIED OFFICE ARTIFACT — use this as document state when answering questions about the current file. Do not claim to have edited it unless the Office generator is invoked.\nKind: ${artifact.kind || artifact.format || 'office'}\nFile: ${artifact.fileName || ''}\nSpecification:\n${JSON.stringify(artifact.spec).slice(0, 24000)}`;
}

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
  availableModels,
  arenaMode,
  secondModel,
  cognitiveLevel,
  canvasCode,
  vfs,
  isWorkspaceMode,
  messages,
  setLastPrompt,
  webSearchEnabled,
  sessionContext
}) {
  const abortControllerRef = useRef(null);
  const { logModelFailure, getLearnedBehaviors } = usePCLMemory();
  
  const cancelStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      updateActiveMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.sender === 'ai' && !last.text) {
          return [...prev.slice(0, -1), { ...last, text: '⚠️ **Generation Stopped**: The request was cancelled by the user.', isError: true }];
        } else if (last && last.sender === 'ai') {
           return [...prev.slice(0, -1), { ...last, text: last.text + '\n\n*(Stopped by user)*' }];
        }
        return prev;
      });
    }
  };

  const handleSendMessage = async (textToSend, targetModelOverride = null) => {
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


    let targetModel = targetModelOverride || selectedModel || { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };

    const geminiApiKey = localStorage.getItem('geminiApiKey');
    const openRouterApiKey = localStorage.getItem('openRouterApiKey');
    const cleanMessages = messages.filter(m => m.id !== 1 && !m.isKeyPrompt && !m.text?.includes('⚠️ **API Key Required'));

    // --- OFFICE LIFECYCLE ROUTER ---
    // Creation is briefing -> one explicit Continue action -> generation.
    // Once a verified artifact exists, natural-language follow-ups are interpreted
    // semantically as REFINE vs DISCUSS; they are never forced back into briefing.
    const currentOfficeArtifact = activeOfficeArtifact(messages);
    const explicitOfficeKind = detectOfficeIntent({ messages: [{ sender: 'user', text }] });
    const inheritedOfficeKind = activeOfficeBriefingKind(messages) || activeOfficeArtifactKind(messages);
    const briefingKind = explicitOfficeKind || inheritedOfficeKind;
    const briefingPrompt = briefingKind
      ? officeBriefingContext({ text, officeKind: explicitOfficeKind, messages, sessionContext })
      : null;
    const shouldGenerate = await shouldGenerateOfficeNow({ text, officeKind: explicitOfficeKind, messages });
    const officeKind = shouldGenerate ? briefingKind : null;

    if (officeKind) {
      const operation = currentOfficeArtifact ? 'refine' : 'create';
      const aiMsgId = Date.now() + 1;
      updateActiveMessages(prev => [...prev, {
        id: aiMsgId,
        sender: 'ai',
        text: operation === 'refine'
          ? `⏳ **Updating the verified ${officeKind.toUpperCase()} artifact...**`
          : `⏳ **Architecting ${officeKind.toUpperCase()} document from the approved briefing...**`,
        isGenerating: true,
        latencyMs: 0
      }]);

      try {
        const res = await fetch('/api/generate-office', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: buildApprovedOfficeGenerationPrompt(text, sessionContext, currentOfficeArtifact),
            format: officeKind,
            operation,
            baseSpec: currentOfficeArtifact?.spec || null,
            baseFingerprint: currentOfficeArtifact?.verification?.previewFingerprint || null,
            history: cleanMessages,
            userKey: geminiApiKey,
            openRouterKey: openRouterApiKey,
            sessionContext,
            imageAttachments: attachments.filter((attachment) => attachment.type === 'image' && attachment.dataUrl).map((attachment) => ({ name: attachment.name, dataUrl: attachment.dataUrl }))
          })
        });

        // Defensive parse: on a timeout/crash Vercel returns a raw HTML error
        // page, not JSON. Never let JSON.parse of that surface as
        // "Unexpected token 'A'". Give a clean, human message instead.
        const raw = await res.text();
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(res.status === 504
            ? 'The document generator timed out. Please try again — a shorter prompt helps.'
            : 'The server hit an error generating the document. Please try again.');
        }
        if (!res.ok) throw new Error(data.error || 'Compilation failed');
        if (!cacheOfficeArtifact(data)) {
          throw new Error('The generated Office artifact failed client envelope verification. No unverified file was accepted.');
        }

        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          text: operation === 'refine'
            ? `✅ **Successfully updated the ${officeKind} document.**\n\n\`\`\`html\n${data.htmlPreview}\n\`\`\``
            : `✅ **Successfully generated ${officeKind} document from the approved briefing.**\n\n\`\`\`html\n${data.htmlPreview}\n\`\`\``,
          codeSnippet: data.htmlPreview,
          isGenerating: false,
          officeAttachment: data,
          officeBriefing: false
        } : m));
      } catch (err) {
        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          text: `❌ **Failed to generate document:** ${err.message}`,
          isGenerating: false,
          isError: true
        } : m));
      } finally {
        setIsGenerating(false);
      }
      return;
    }
    // ---------------------------------------

    // Phase 4 & 5: Intent Router & Agentic Swarm
    let effectiveArenaMode = arenaMode;
    let intent = 'subjective'; // Default
    try {
      const intentRes = await fetch('/api/classify-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          history: cleanMessages.slice(-10).map((message) => ({ sender: message.sender, text: message.text })),
          activeOfficeArtifact: currentOfficeArtifact ? {
            kind: currentOfficeArtifact.kind || currentOfficeArtifact.format || null,
            fileName: currentOfficeArtifact.fileName || '',
            title: currentOfficeArtifact.spec?.title || currentOfficeArtifact.spec?.filename || '',
            previewFingerprint: currentOfficeArtifact.verification?.previewFingerprint || '',
          } : null,
          requestedOfficeKind: explicitOfficeKind || null,
        })
      });
      if (intentRes.ok) {
        const intentData = await intentRes.json();
        intent = intentData.intent;
      }
    } catch (e) {
      console.error("Gatekeeper intent routing failed", e);
    }

    const isCodingRequest = text.toLowerCase().includes('build') && (text.toLowerCase().includes('react') || text.toLowerCase().includes('app') || text.toLowerCase().includes('code'));
    
    if (briefingKind && effectiveArenaMode) {
      // Briefing/artifact continuity is one stateful conversation, not an arena comparison.
      effectiveArenaMode = false;
    }

    if (effectiveArenaMode && (intent === 'deterministic' || isCodingRequest)) {
        // A build request doesn't benefit from side-by-side Arena comparison —
        // switch to the single-model workspace flow. (No artificial delay or
        // "agentic swarm" theater; just do it.)
        effectiveArenaMode = false;
        updateActiveMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'ai',
          text: 'Switching out of Arena Mode for this build so I can open the workspace and generate it.'
        }]);
    }

    // 1. Dual Model Arena Execution Mode
    if (effectiveArenaMode) {
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
          abortControllerRef.current = new AbortController();
      const timeoutId = setTimeout(() => { if(abortControllerRef.current) abortControllerRef.current.abort('timeout'); }, 60000);
      const res = await fetch('/api/chat', {
        signal: abortControllerRef.current.signal,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, modelId: mod.id, modelName: mod.name, history: cleanMessages, userKey: geminiApiKey, openRouterKey: openRouterApiKey })
          });
          
          if (!res.ok) throw new Error('API Error');
          
          clearTimeout(timeoutId);
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
                  const displayText = sanitizeAssistantStream(currentText);
                  updateActiveMessages(prev => prev.map(m => {
                    if (m.id === dualMsgId) {
                      const updatedModelInfo = { modelName: mod.name, text: displayText, provider: finalProvider, latencyMs: finalLatency };
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
                      const updatedModelInfo = { modelName: mod.name, text: sanitizeAssistantStream(currentText), provider: finalProvider, latencyMs: finalLatency };
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
    if (err.name === 'AbortError' || err === 'timeout') {
      updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        text: err === 'timeout' ? '⚠️ **Request Timed Out**: The model took too long to respond (>60s). Please try again or switch models.' : '⚠️ **Generation Stopped**'
      } : m));
      return;
    }
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
    liveConnected: true,
    ...(briefingPrompt ? { officeBriefing: true, officeBriefingKind: briefingKind } : {})
  };
  updateActiveMessages(prev => [...prev, initialAiMsg]);

  const executeSingleModel = async (modelToUse, attempt = 1, promptOverride = null) => {
    const learned = getLearnedBehaviors();
    const isOfficeBriefingOverride = typeof promptOverride === 'string' && promptOverride.startsWith('OFFICE BRIEFING CONTEXT');
    const activeOfficeContext = currentOfficeArtifact && !briefingPrompt
      ? buildActiveOfficeDiscussionContext(currentOfficeArtifact)
      : '';
    let finalPromptOverride = promptOverride || '';
    if (learned) {
      finalPromptOverride = finalPromptOverride ? (finalPromptOverride + '\n\n' + learned) : learned;
    }
    if (activeOfficeContext) {
      finalPromptOverride = finalPromptOverride ? `${finalPromptOverride}\n\n${activeOfficeContext}` : activeOfficeContext;
    }
    const messageForModel = isOfficeBriefingOverride
      ? finalPromptOverride
      : finalPromptOverride
        ? text + '\n\n' + finalPromptOverride
        : text;
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
          message: messageForModel,
          modelId: modelToUse.id,
          modelName: modelToUse.name,
          history: cleanMessages,
          openRouterKey: openRouterApiKey,
          cognitiveLevel: cognitiveLevel,
          webSearch: webSearchEnabled,
          sessionContext
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
                  const displayText = sanitizeAssistantStream(currentText);
                  updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                    ...m,
                    text: displayText,
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
            text: `🔒 **Please sign in to continue.**\n\n${errData.error || "Sign in to use Quantora's built-in AI."}`,
            isAuthPrompt: true
          } : m));
          setIsGenerating(false);
        } else if (res.status === 429) {
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `⏳ **Slow down a moment.** ${errData.error || 'Too many requests.'}`
          } : m));
          setIsGenerating(false);
        } else {
          // PROACTIVE FAILOVER ON SERVER ERROR (503 / 500)
          if (attempt === 1) {
             logModelFailure(modelToUse.id, 'server_error');
             console.log("PCL: Intercepted server error. Auto-failing over...");
             const fallbackModel = { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };
             updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
               ...m,
               isFailover: true,
               text: '' // reset text just in case
             } : m));
             return executeSingleModel(fallbackModel, 2, promptOverride);
          }
          
          const errText = errData.error || `The backend server encountered an error with ${modelToUse.name}.`;
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: `⚠️ **Server Error**: ${errText}\n\nQuantora is unable to process this request at the moment.`
          } : m));
          setIsGenerating(false);
        }
      }
    } catch (error) {
      if (error.name === 'AbortError' || error === 'timeout') {
          // PROACTIVE FAILOVER ON TIMEOUT
          if (attempt === 1 && error === 'timeout') {
             logModelFailure(modelToUse.id, 'timeout');
             console.log("PCL: Intercepted timeout. Auto-failing over...");
             const fallbackModel = { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };
             updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
               ...m,
               isFailover: true,
               text: ''
             } : m));
             return executeSingleModel(fallbackModel, 2, promptOverride);
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
         logModelFailure(modelToUse.id, 'connection_error');
         console.log("PCL: Intercepted connection error. Auto-failing over...");
         const fallbackModel = { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' };
         updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
           ...m,
           isFailover: true,
           text: ''
         } : m));
         return executeSingleModel(fallbackModel, 2, promptOverride);
      }
      
      updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        text: `⚠️ **Connection Error**: Unable to reach Quantora's AI gateway for ${modelToUse.name}. Please check your connection.`
      } : m));
      setIsGenerating(false);
    }
  };
  
  // Phase 5: Swarm Mode
  const isOffice = Boolean(briefingKind);
  if (!effectiveArenaMode && intent === 'subjective' && !isOffice) {
     // Trigger Architect -> Coder Swarm
     
     
     try {
       // Fire Architect call to our generic chat endpoint using Flash
       const architectRes = await fetch('/api/chat', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           message: `You are the Architect Agent. Write a highly detailed technical implementation plan for this request. Do NOT write the final code. Just the step-by-step logic and file architecture. Request: ${text}`,
           modelId: 'google/gemini-1.5-flash',
           modelName: 'Gemini 1.5 Flash',
           history: []
         })
       });
       
       if (architectRes.ok) {
         // We have to wait for the stream to finish or we can just parse the stream
         let architectPlan = '';
         const reader = architectRes.body.getReader();
         const decoder = new TextDecoder();
         while (true) {
           const { done, value } = await reader.read();
           if (done) break;
           const chunk = decoder.decode(value);
           const lines = chunk.split('\n');
           for (const line of lines) {
             if (line.startsWith('data: ')) {
               try {
                 const parsed = JSON.parse(line.slice(6));
                 if (parsed.text) architectPlan += parsed.text;
               } catch (e) {}
             }
           }
         }
         
         
         
         
         // Clear text and run Coder
         let coderPrompt = `Architect's Approved Implementation Plan:\n\n${architectPlan}\n\n---\n\nPlease execute this plan and write the final code for the original request.`;
         
         if (isWorkspaceMode && vfs && Object.keys(vfs).length > 0) {
           coderPrompt += `\n\nIMPORTANT: We are editing an existing app. DO NOT rewrite entire files! Use exact Search/Replace diff blocks.
           
FORMAT:
\`\`\`jsx filepath="filename.ext"
<<<<
exact lines of original code to replace (must match perfectly)
====
new lines of code
>>>>
\`\`\`

You can output multiple search/replace blocks if needed.
\nCURRENT VIRTUAL FILE SYSTEM:\n`;
           for (const [filename, file] of Object.entries(vfs)) {
             coderPrompt += `\n--- ${filename} ---\n\`\`\`${file.language || ''}\n${file.content}\n\`\`\`\n`;
           }
         }
         
         executeSingleModel(targetModel, 1, coderPrompt);
         return;
       }
     } catch (e) {
       console.error("Swarm architect failed", e);
     }
  }

  // Default fallback. An unresolved first-turn Office brief gets briefingPrompt;
  // questions about an active artifact instead receive the exact canonical spec
  // via buildActiveOfficeDiscussionContext above.
  executeSingleModel(targetModel, 1, briefingPrompt || null);
};
return { handleSendMessage, cancelStream };
}
