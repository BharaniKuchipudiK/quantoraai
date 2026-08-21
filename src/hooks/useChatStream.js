import { useModelExperienceMemory } from './useModelExperienceMemory.js';
import { useRef } from 'react';
import { detectOfficeIntent } from '../lib/office-intent.js';
import { activeOfficeArtifact, activeOfficeArtifactKind, activeOfficeBriefingKind, officeBriefingContext, shouldGenerateOfficeNow } from '../lib/office-briefing.js';
import { cacheOfficeArtifact } from '../lib/office-artifact-cache.js';
import { normalizeAssistantResponse, sanitizeAssistantStream } from '../lib/assistant-response-normalizer.js';
import { captureUserAnswerAsContext } from '../lib/session-context.js';
import { forgetOutcomeState, loadOutcomeState, persistOutcomeState } from '../lib/outcome-state.js';
import { applyPclContinuityToOutcomeState } from '../lib/pcl-outcome-sync.js';
import {
  detectPclMemoryConsentIntent,
  readPclConversationEnvelope,
  rememberActivePclSession,
  setPclSessionMemoryConsent,
  updatePclSessionOutcomeVersion,
} from '../lib/pcl-session-runtime.js';

const CHAT_TURN_DEADLINE_MS = 90_000;

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

async function persistPclContinuity({
  sessionId,
  memoryConsented,
  assistantContext,
  confirmedUserFact,
  sourceTurn,
}) {
  if (!sessionId || memoryConsented !== true || (!assistantContext && !confirmedUserFact)) return null;

  const saveAgainst = async (record) => {
    const state = applyPclContinuityToOutcomeState(record?.state || {}, {
      assistantContext,
      confirmedUserFact,
      sourceTurn,
    });
    return persistOutcomeState({
      sessionId,
      expectedVersion: Number.isInteger(record?.version) ? record.version : 0,
      state,
      sourceTurn,
    });
  };

  try {
    let record = await loadOutcomeState(sessionId);
    try {
      record = await saveAgainst(record);
    } catch (error) {
      if (!error?.conflict) throw error;
      record = await saveAgainst(await loadOutcomeState(sessionId));
    }
    if (Number.isInteger(record?.version)) updatePclSessionOutcomeVersion(sessionId, record.version);
    return record;
  } catch (error) {
    console.warn('Outcome State continuity sync failed:', error?.message || error);
    return null;
  }
}

function responseErrorMessage(status, payload, modelName) {
  if (status === 401 && payload?.requiresAuth) return payload.error || 'Please sign in to continue.';
  if (status === 429) return payload?.error || 'Too many requests. Please try again shortly.';
  return payload?.error || `The AI gateway could not complete the request with ${modelName || 'the selected model'}.`;
}

function activeStudioDomain(chatSessions, activeSessionId) {
  const session = (chatSessions || []).find((candidate) => candidate?.id === activeSessionId);
  return session?.studioDomain || null;
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
  const { getLearnedBehaviors } = useModelExperienceMemory();

  const cancelStream = () => {
    if (!abortControllerRef.current) return;
    abortControllerRef.current.abort('user');
    setIsGenerating(false);
    updateActiveMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.sender === 'ai' && !last.text) {
        return [...prev.slice(0, -1), { ...last, text: '⚠️ **Generation Stopped**', isError: true, executionStatus: null }];
      }
      if (last && last.sender === 'ai') {
        return [...prev.slice(0, -1), { ...last, text: `${last.text}\n\n*(Stopped by user)*`, executionStatus: null }];
      }
      return prev;
    });
  };

  const handleSendMessage = async (textToSend, targetModelOverride = null) => {
    let text = textToSend || inputText;
    if (!text.trim() && !attachments.length) return;
    if (isGenerating) return;

    const visibleUserText = text.trim();
    rememberActivePclSession(activeSessionId);
    const memoryIntent = detectPclMemoryConsentIntent(visibleUserText);
    if (memoryIntent === 'grant') {
      setPclSessionMemoryConsent(activeSessionId, true);
    } else if (memoryIntent === 'revoke') {
      setPclSessionMemoryConsent(activeSessionId, false);
      void forgetOutcomeState(activeSessionId).catch(() => {});
    }
    const pclEnvelope = readPclConversationEnvelope({ sessionId: activeSessionId, sessionContext });
    const confirmedUserFact = pclEnvelope.memoryConsented && !memoryIntent
      ? captureUserAnswerAsContext(visibleUserText, messages)
      : null;

    const contextChips = attachments.filter(a => a.type === 'context');
    if (contextChips.length > 0) {
      let contextString = '';
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
      text += contextString;
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
          text: `🚨 **Policy Violation Detected**\n\n${modData.reason}`,
          isError: true
        }]);
        setIsGenerating(false);
        return;
      }
    } catch (e) {
      console.error('Moderation API failed, failing open...', e);
    }

    const targetModel = targetModelOverride
      || selectedModel
      || (availableModels || []).find((model) => model?.available !== false)
      || { id: 'gemini-flash-latest', name: 'Gemini Flash' };

    const geminiApiKey = localStorage.getItem('geminiApiKey');
    const openRouterApiKey = localStorage.getItem('openRouterApiKey');
    const cleanMessages = messages.filter(m => m.id !== 1 && !m.isKeyPrompt && !m.text?.includes('⚠️ **API Key Required'));
    const studioDomain = activeStudioDomain(chatSessions, activeSessionId);

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
            imageAttachments: attachments
              .filter((attachment) => attachment.type === 'image' && attachment.dataUrl)
              .map((attachment) => ({ name: attachment.name, dataUrl: attachment.dataUrl }))
          })
        });

        const raw = await res.text();
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(res.status === 504
            ? 'The document generator timed out. Please try again.'
            : 'The server hit an error generating the document. Please try again.');
        }
        if (!res.ok) throw new Error(data.error || 'Compilation failed');
        if (!cacheOfficeArtifact(data)) {
          throw new Error('The generated Office artifact failed client envelope verification.');
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

    let effectiveArenaMode = arenaMode;
    const isCodingRequest = /\b(build|code|implement|develop)\b/i.test(text)
      && /\b(react|app|application|website|component|javascript|typescript|html|css)\b/i.test(text);
    if (briefingKind || isCodingRequest) effectiveArenaMode = false;

    const requestBodyFor = (model) => ({
      message: text,
      modelId: model.id,
      modelName: model.name,
      history: cleanMessages,
      userKey: geminiApiKey,
      openRouterKey: openRouterApiKey,
      cognitiveLevel,
      webSearch: webSearchEnabled,
      sessionContext,
      projectId: sessionContext?.projectId || null,
      studioDomain,
      ...pclEnvelope,
    });

    if (effectiveArenaMode) {
      const modelA = targetModel;
      const modelB = secondModel || (availableModels || []).find((model) => model?.id !== modelA?.id && model?.available !== false);
      if (!modelB) {
        updateActiveMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'ai',
          text: 'Dual Arena needs a second available model. Please choose another model and try again.',
          isError: true,
        }]);
        setIsGenerating(false);
        return;
      }

      const dualMsgId = Date.now() + 1;
      updateActiveMessages(prev => [...prev, {
        id: dualMsgId,
        sender: 'ai',
        type: 'arena_battle',
        isDual: true,
        prompt: text,
        modelA: { modelName: modelA.name, text: '', provider: modelA.name, latencyMs: 0 },
        modelB: { modelName: modelB.name, text: '', provider: modelB.name, latencyMs: 0 },
      }]);

      const controllers = [];
      const streamSingleModel = async (model, isModelA) => {
        const controller = new AbortController();
        controllers.push(controller);
        abortControllerRef.current = {
          abort: (reason) => controllers.forEach((item) => item.abort(reason)),
        };
        const timeoutId = setTimeout(() => controller.abort('timeout'), CHAT_TURN_DEADLINE_MS);
        try {
          const res = await fetch('/api/chat', {
            signal: controller.signal,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBodyFor(model)),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(responseErrorMessage(res.status, data, model.name));
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let currentText = '';
          let provider = model.name;
          let latencyMs = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const dataStr = line.slice(6);
              if (dataStr === '[DONE]') continue;
              let parsed;
              try { parsed = JSON.parse(dataStr); } catch { continue; }
              if (parsed.error?.message) throw new Error(parsed.error.message);
              if (parsed.text) currentText += parsed.text;
              if (parsed.provider) {
                provider = parsed.provider;
                latencyMs = parsed.latencyMs || 0;
              }
              updateActiveMessages(prev => prev.map(m => {
                if (m.id !== dualMsgId) return m;
                const modelInfo = {
                  modelName: model.name,
                  text: sanitizeAssistantStream(currentText),
                  provider,
                  latencyMs,
                };
                return { ...m, modelA: isModelA ? modelInfo : m.modelA, modelB: isModelA ? m.modelB : modelInfo };
              }));
            }
          }
        } catch (error) {
          updateActiveMessages(prev => prev.map(m => {
            if (m.id !== dualMsgId) return m;
            const key = isModelA ? 'modelA' : 'modelB';
            return { ...m, [key]: { ...m[key], text: `Connection error: ${error.message}` } };
          }));
        } finally {
          clearTimeout(timeoutId);
        }
      };

      await Promise.all([streamSingleModel(modelA, true), streamSingleModel(modelB, false)]);
      setIsGenerating(false);
      return;
    }

    const aiMsgId = Date.now() + 1;
    updateActiveMessages(prev => [...prev, {
      id: aiMsgId,
      sender: 'ai',
      modelUsed: targetModel.name,
      text: '',
      componentType: 'formatted_text',
      latencyMs: 0,
      provider: targetModel.name,
      liveConnected: true,
      executionStatus: null,
      ...(briefingPrompt ? { officeBriefing: true, officeBriefingKind: briefingKind } : {})
    }]);

    const learned = getLearnedBehaviors();
    const activeOfficeContext = currentOfficeArtifact && !briefingPrompt
      ? buildActiveOfficeDiscussionContext(currentOfficeArtifact)
      : '';
    const extraContext = [briefingPrompt, learned, activeOfficeContext].filter(Boolean).join('\n\n');
    const messageForModel = extraContext ? `${text}\n\n${extraContext}` : text;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort('timeout'), CHAT_TURN_DEADLINE_MS);

    try {
      const res = await fetch('/api/chat', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...requestBodyFor(targetModel),
          message: messageForModel,
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const message = responseErrorMessage(res.status, errData, targetModel.name);
        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          text: res.status === 401 && errData.requiresAuth
            ? `🔒 **Please sign in to continue.**\n\n${message}`
            : `⚠️ **Request failed:** ${message}`,
          isAuthPrompt: res.status === 401 && errData.requiresAuth,
          isError: true,
          executionStatus: null,
        } : m));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let currentText = '';
      let buffer = '';
      let receivedDone = false;
      let streamedError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') {
            receivedDone = true;
            continue;
          }
          let parsed;
          try { parsed = JSON.parse(dataStr); } catch { continue; }

          if (parsed.error?.message) {
            streamedError = parsed.error;
            continue;
          }
          if (parsed.status) {
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              executionStatus: parsed.status,
            } : m));
          }
          if (parsed.text) {
            currentText += parsed.text;
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              text: sanitizeAssistantStream(currentText),
              modelUsed: targetModel.name,
            } : m));
          }
          if (parsed.provider) {
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              provider: parsed.provider,
              latencyMs: parsed.latencyMs || 0,
              executionStatus: null,
              ...(parsed.conversation ? { conversation: parsed.conversation } : {}),
            } : m));
          }
        }
      }

      if (streamedError) {
        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          text: currentText
            ? `${sanitizeAssistantStream(currentText)}\n\n⚠️ Quantora could not complete the provider handoff for this turn.`
            : '⚠️ **Temporarily unavailable:** Quantora could not reach a healthy AI route. Please retry in a moment.',
          isError: true,
          executionStatus: null,
        } : m));
        return;
      }
      if (!receivedDone) {
        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          text: currentText
            ? `${sanitizeAssistantStream(currentText)}\n\n⚠️ The response stream ended unexpectedly.`
            : '⚠️ **Connection Error:** The response stream ended unexpectedly.',
          isError: true,
          executionStatus: null,
        } : m));
        return;
      }

      const normalized = normalizeAssistantResponse(currentText);
      updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        text: normalized.displayText,
        executionStatus: null,
        ...(normalized.choiceSet ? { choiceSet: normalized.choiceSet } : {}),
        ...(normalized.continueSet ? { continueSet: normalized.continueSet } : {}),
        ...(normalized.clearWorkspace ? { clearWorkspace: true } : {}),
      } : m));
      await persistPclContinuity({
        sessionId: pclEnvelope.sessionId,
        memoryConsented: pclEnvelope.memoryConsented,
        assistantContext: normalized.contextUpdate,
        confirmedUserFact,
        sourceTurn: String(userMsg.id),
      });
    } catch (error) {
      const timedOut = controller.signal.aborted && controller.signal.reason === 'timeout';
      const stopped = controller.signal.aborted && controller.signal.reason === 'user';
      updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        text: stopped
          ? '⚠️ **Generation Stopped**'
          : timedOut
            ? `⚠️ **Request timed out:** Quantora stopped this turn after ${Math.round(CHAT_TURN_DEADLINE_MS / 1000)} seconds instead of leaving it running indefinitely.`
            : `⚠️ **Connection Error:** ${error.message || 'Unable to reach the AI gateway.'}`,
        isError: true,
        executionStatus: null,
      } : m));
    } finally {
      clearTimeout(timeoutId);
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  };

  return { handleSendMessage, cancelStream };
}
