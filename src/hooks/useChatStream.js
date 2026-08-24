import { useModelExperienceMemory } from './useModelExperienceMemory.js';
import { useRef } from 'react';
import { OFFICE_CLIENT_GENERATE_ABORT_MS } from '../../api/_lib/office-generation-budget.js';
import { detectOfficeIntent } from '../lib/office-intent.js';
import { activeOfficeArtifact, activeOfficeArtifactKind, activeOfficeBriefingKind, officeBriefingContext, shouldGenerateOfficeNow, shouldRevealOfficeNow } from '../lib/office-briefing.js';
import { cacheOfficeArtifact } from '../lib/office-artifact-cache.js';
import { officePclMemory } from '../lib/office-session-state.js';
import { normalizeAssistantResponse, sanitizeAssistantStream } from '../lib/assistant-response-normalizer.js';
import { captureUserAnswerAsContext, mergeSessionContext } from '../lib/session-context.js';
import { deriveStudioMission } from '../lib/studio-mission.js';
import { mergeStudySyllabusFromText } from '../lib/study-syllabus-overlay.js';
import { forgetOutcomeState, loadOutcomeState, persistOutcomeState } from '../lib/outcome-state.js';
import { applyPclContinuityToOutcomeState } from '../lib/pcl-outcome-sync.js';
import {
  detectPclMemoryConsentIntent,
  readPclConversationEnvelope,
  rememberActivePclSession,
  setPclSessionMemoryConsent,
  updatePclSessionOutcomeVersion,
} from '../lib/pcl-session-runtime.js';
import { advisorBlocksPreviewBuild, resolveIsCodingRequest } from '../lib/build-intent.js';
import { assembleStudioPreview } from '../lib/studio-preview-helpers.js';
import { buildCodingDeskScaffoldReply } from '../lib/coding-desk-scaffold.js';
import { isCodingDeskAutoSelection, resolveCodingDeskModel } from '../lib/coding-desk-auto-model.js';
import { resolveTurnStudioDomain } from '../../api/_lib/studio-domain-inference.js';
import { shouldRefineRunningDesk } from '../lib/workspace-intent.js';
import { buildCodingTurnPacket, codingTurnRequestFields } from '../lib/studio-desk-context.js';
import { MAX_TURN_ATTEMPTS, resolveTurnRecovery } from '../lib/turn-recovery.js';
import {
  correlationHeaders,
  createCorrelationId,
  normalizeClientCorrelationId,
  recordClientBoundary,
} from '../lib/transaction-trace.js';
import { byokRequestHeaders, getClientSecret } from '../lib/client-secrets.js';
import {
  createGenerationToken,
  createMessageId,
  isActiveGeneration,
  withTravelDegradedNotice,
} from '../lib/chat-turn-safety.js';

const MIN_ATTEMPT_BUDGET_MS = 20_000;
const CHAT_TURN_DEADLINE_MS = 90_000;
const BUILD_TURN_DEADLINE_MS = 135_000;

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
  codingDeskOpen = false,
  deskJob = null,
  liveDeskProbe = null,
  messages,
  setLastPrompt,
  sessionContext,
  conversationContext,
  updateActiveSession,
}) {
  const abortControllerRef = useRef(null);
  const generationTokenRef = useRef(null);
  const { getLearnedBehaviors } = useModelExperienceMemory();

  const cancelStream = () => {
    generationTokenRef.current = null;
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

    const generationToken = createGenerationToken();
    generationTokenRef.current = generationToken;
    const stillCurrent = () => isActiveGeneration(generationTokenRef.current, generationToken);

    const visibleUserText = text.trim();
    const turnCorrelationId = createCorrelationId('studio');
    const goldenTransaction = (() => {
      try { return sessionStorage.getItem('quantora_golden_transaction') || null; } catch { return null; }
    })();
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
      id: createMessageId('user'),
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
      if (!stillCurrent()) return;
      if (!modRes.ok) {
        updateActiveMessages(prev => [...prev, {
          id: createMessageId('ai'),
          sender: 'ai',
          text: '⚠️ **Safety check unavailable.** Quantora could not reach the moderation service, so this turn was not sent. Please try again in a moment.',
          isError: true
        }]);
        setIsGenerating(false);
        return;
      }
      const modData = await modRes.json().catch(() => ({}));
      if (!stillCurrent()) return;
      if (modData.flagged) {
        updateActiveMessages(prev => [...prev, {
          id: createMessageId('ai'),
          sender: 'ai',
          text: `🚨 **Policy Violation Detected**\n\n${modData.reason || 'This request was blocked by Quantora safety policy.'}`,
          isError: true
        }]);
        setIsGenerating(false);
        return;
      }
    } catch (e) {
      console.error('Moderation API failed, failing closed...', e);
      if (!stillCurrent()) return;
      updateActiveMessages(prev => [...prev, {
        id: createMessageId('ai'),
        sender: 'ai',
        text: '⚠️ **Safety check unavailable.** Quantora could not reach the moderation service, so this turn was not sent. Please try again in a moment.',
        isError: true
      }]);
      setIsGenerating(false);
      return;
    }

    const pinnedOrOverride = targetModelOverride
      || selectedModel
      || (availableModels || []).find((model) => model?.available !== false)
      || { id: 'gemini-flash-latest', name: 'Gemini Flash' };
    const autoMode = !targetModelOverride && isCodingDeskAutoSelection(pinnedOrOverride);
    let targetModel = pinnedOrOverride;

    const cleanMessages = messages.filter(m => m.id !== 1 && !m.isKeyPrompt && !m.text?.includes('⚠️ **API Key Required'));
    const studioDomain = activeStudioDomain(chatSessions, activeSessionId);

    const currentOfficeArtifact = activeOfficeArtifact(messages);
    const explicitOfficeKind = detectOfficeIntent({ messages: [{ sender: 'user', text }] });
    const inheritedOfficeKind = activeOfficeBriefingKind(messages) || activeOfficeArtifactKind(messages);
    const briefingKind = explicitOfficeKind || inheritedOfficeKind;
    const briefingPrompt = briefingKind
      ? officeBriefingContext({ text, officeKind: explicitOfficeKind, messages, sessionContext })
      : null;
    if (briefingPrompt && typeof updateActiveSession === 'function') {
      updateActiveSession({
        conversationContext: mergeSessionContext(conversationContext, officePclMemory(briefingKind)),
      });
    }
    const shouldGenerate = await shouldGenerateOfficeNow({ text, officeKind: explicitOfficeKind, messages });
    if (!shouldGenerate && shouldRevealOfficeNow({ text, messages }) && currentOfficeArtifact) {
      if (typeof updateActiveSession === 'function') {
        updateActiveSession({
          conversationContext: mergeSessionContext(
            conversationContext,
            officePclMemory(currentOfficeArtifact.kind || currentOfficeArtifact.format, currentOfficeArtifact.spec),
          ),
        });
      }
      updateActiveMessages(prev => [...prev, {
        id: createMessageId('ai'),
        sender: 'ai',
        text: `The ${currentOfficeArtifact.kind || 'Office'} file is in Preview. Use **Download** on the card below, or the file button in the preview header.`,
        officeAttachment: {
          kind: currentOfficeArtifact.kind || currentOfficeArtifact.format,
          fileName: currentOfficeArtifact.fileName,
          mimeType: currentOfficeArtifact.mimeType,
          spec: currentOfficeArtifact.spec,
          htmlPreview: currentOfficeArtifact.htmlPreview,
          verification: currentOfficeArtifact.verification,
          generation: currentOfficeArtifact.generation,
        },
        officeBriefing: false,
      }]);
      setIsGenerating(false);
      return;
    }
    const officeKind = shouldGenerate ? briefingKind : null;

    if (officeKind) {
      const operation = currentOfficeArtifact ? 'refine' : 'create';
      const aiMsgId = createMessageId('ai');
      if (!stillCurrent()) return;
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
        const officeAbort = new AbortController();
        const officeTimer = setTimeout(() => officeAbort.abort(), OFFICE_CLIENT_GENERATE_ABORT_MS);
        let res;
        try {
          res = await fetch('/api/generate-office', {
          method: 'POST',
          signal: officeAbort.signal,
          headers: byokRequestHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            prompt: buildApprovedOfficeGenerationPrompt(text, sessionContext, currentOfficeArtifact),
            format: officeKind,
            operation,
            baseSpec: currentOfficeArtifact?.spec || null,
            baseFingerprint: currentOfficeArtifact?.verification?.previewFingerprint || null,
            history: cleanMessages,
            sessionContext,
            imageAttachments: attachments
              .filter((attachment) => attachment.type === 'image' && attachment.dataUrl)
              .map((attachment) => ({ name: attachment.name, dataUrl: attachment.dataUrl }))
          })
        });
        } catch (fetchError) {
          if (fetchError?.name === 'AbortError') {
            throw new Error('The document generator ran out of host time before a file could be compiled. This is Quantora hitting the platform clock, not a missing API key. Shorten the brief and try once.');
          }
          throw fetchError;
        } finally {
          clearTimeout(officeTimer);
        }

        const raw = await res.text();
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(res.status === 504 || res.status === 503
            ? 'The document generator ran out of host time before a file could be compiled. This is Quantora hitting the platform clock, not a missing API key. Shorten the brief and try once.'
            : 'The server hit an error generating the document. Please try again.');
        }
        if (!res.ok) throw new Error(data.error || 'Compilation failed');
        if (!cacheOfficeArtifact(data)) {
          throw new Error('The generated Office artifact failed client envelope verification.');
        }
        if (!stillCurrent()) return;
        if (typeof updateActiveSession === 'function') {
          updateActiveSession({
            conversationContext: mergeSessionContext(conversationContext, officePclMemory(officeKind, data.spec)),
          });
        }

        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          text: `The ${officeKind} file is in Preview. Use **Download** on the card below.`,
          isGenerating: false,
          officeAttachment: data,
          officeBriefing: false
        } : m));
      } catch (err) {
        if (!stillCurrent()) return;
        updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m,
          text: `❌ **Failed to generate document:** ${err.message}`,
          isGenerating: false,
          isError: true
        } : m));
      } finally {
        if (stillCurrent()) setIsGenerating(false);
      }
      return;
    }

    let effectiveArenaMode = arenaMode;
    const deskFiles = Boolean(isWorkspaceMode && vfs && Object.keys(vfs).length > 0);
    const refineDesk = shouldRefineRunningDesk({
      prompt: visibleUserText,
      hasDeskFiles: deskFiles,
      studioDomain,
    });
    const deskPacket = buildCodingTurnPacket({
      vfs,
      canvasCode,
      job: deskJob,
      studioDomain,
      live: liveDeskProbe,
    });
    const isCodingRequest = resolveIsCodingRequest(text, {
      codingDeskOpen: Boolean(codingDeskOpen),
      refineDesk,
    });
    const turnDeadlineMs = isCodingRequest ? BUILD_TURN_DEADLINE_MS : CHAT_TURN_DEADLINE_MS;
    // Auto resolves once at request start (client hint for UI). Server re-resolves authoritatively.
    let autoResolvedLabel = null;
    if (autoMode && isCodingRequest) {
      const openRouterApiKeyHint = getClientSecret('openrouter');
      const vfsFileCount = vfs && typeof vfs === 'object' ? Object.keys(vfs).length : 0;
      const resolved = resolveCodingDeskModel({
        task: 'coding',
        message: text,
        hasVFS: vfsFileCount > 0,
        refineMode: refineDesk,
        availableModels: availableModels || [],
        qualityHints: { fileCount: vfsFileCount },
        allowPaid: Boolean(openRouterApiKeyHint),
      });
      autoResolvedLabel = resolved.model?.name || resolved.modelId;
      targetModel = {
        id: 'auto',
        name: 'Auto',
        resolvedModelId: resolved.modelId,
        resolvedModelName: autoResolvedLabel,
      };
    }
    const turnDomain = resolveTurnStudioDomain({
      explicit: studioDomain,
      message: visibleUserText,
      history: messages,
      isCodingRequest,
      hasCodingWorkspace: deskFiles
        || Boolean(isWorkspaceMode)
        || Boolean(codingDeskOpen)
        || Boolean(typeof canvasCode === 'string' && canvasCode.trim()),
    }) || studioDomain;
    if (briefingKind || isCodingRequest || turnDomain === 'travel') effectiveArenaMode = false;

    const answerFact = captureUserAnswerAsContext(visibleUserText, messages);
    const mission = deriveStudioMission({
      conversationContext,
      messages: [...messages, { sender: 'user', text: visibleUserText }],
      hasPreview: Boolean(isWorkspaceMode && (canvasCode || (vfs && Object.keys(vfs).length))),
      officeKind: briefingKind || activeOfficeArtifactKind(messages),
    });
    const turnContext = mergeStudySyllabusFromText(
      mergeSessionContext(
        conversationContext,
        mergeSessionContext(sessionContext, {
          ...(mission?.goal ? { goal: mission.goal } : {}),
          ...(mission?.understanding ? { understanding: mission.understanding } : {}),
          ...(answerFact ? { facts: [answerFact] } : {}),
        }),
      ),
      visibleUserText,
      turnDomain,
    );
    if (typeof updateActiveSession === 'function') {
      updateActiveSession({
        conversationContext: turnContext,
        ...(turnDomain && turnDomain !== studioDomain ? { studioDomain: turnDomain } : {}),
      });
    }

    const vfsFileCountForHints = vfs && typeof vfs === 'object' ? Object.keys(vfs).length : 0;
    const requestBodyFor = (model) => ({
      message: text,
      modelId: model.id,
      modelName: model.name,
      history: cleanMessages,
      cognitiveLevel,
      webSearch: false,
      sessionContext: turnContext,
      projectId: sessionContext?.projectId || turnContext?.projectId || null,
      studioDomain: turnDomain,
      buildMode: isCodingRequest,
      taskCategory: isCodingRequest ? 'coding' : 'general',
      hasVFS: vfsFileCountForHints > 0,
      ...(isCodingRequest ? {
        qualityHints: {
          fileCount: vfsFileCountForHints,
          repair: refineDesk,
        },
      } : {}),
      ...codingTurnRequestFields({
        isCodingRequest,
        refineDesk,
        packet: deskPacket,
      }),
      ...pclEnvelope,
      correlationId: turnCorrelationId,
      ...(goldenTransaction ? { goldenTransaction } : {}),
    });

    const chatRequestHeaders = () => byokRequestHeaders(
      correlationHeaders(turnCorrelationId, { 'Content-Type': 'application/json' }),
    );

    if (effectiveArenaMode) {
      const modelA = targetModel;
      const modelB = secondModel || (availableModels || []).find((model) => model?.id !== modelA?.id && model?.available !== false);
      if (!modelB) {
        updateActiveMessages(prev => [...prev, {
          id: createMessageId('ai'),
          sender: 'ai',
          text: 'Dual Arena needs a second available model. Please choose another model and try again.',
          isError: true,
        }]);
        setIsGenerating(false);
        return;
      }

      const dualMsgId = createMessageId('arena');
      if (!stillCurrent()) return;
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
            headers: chatRequestHeaders(),
            body: JSON.stringify(requestBodyFor(model)),
          });
          if (!stillCurrent()) return;
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
            if (!stillCurrent()) return;
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
              if (!stillCurrent()) return;
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
          if (!stillCurrent()) return;
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
      if (stillCurrent()) setIsGenerating(false);
      return;
    }

    const aiMsgId = createMessageId('ai');
    if (!stillCurrent()) return;
    updateActiveMessages(prev => [...prev, {
      id: aiMsgId,
      sender: 'ai',
      modelUsed: autoMode ? (autoResolvedLabel || 'Auto') : targetModel.name,
      autoRouted: autoMode,
      text: '',
      componentType: 'formatted_text',
      latencyMs: 0,
      provider: targetModel.name,
      liveConnected: false,
      executionStatus: null,
      correlationId: turnCorrelationId,
      ...(goldenTransaction ? { goldenTransaction } : {}),
      ...(briefingPrompt ? { officeBriefing: true, officeBriefingKind: briefingKind } : {})
    }]);

    const learned = getLearnedBehaviors();
    const activeOfficeContext = currentOfficeArtifact && !briefingPrompt
      ? buildActiveOfficeDiscussionContext(currentOfficeArtifact)
      : '';
    const extraContext = [briefingPrompt, learned, activeOfficeContext].filter(Boolean).join('\n\n');
    const messageForModel = extraContext ? `${text}\n\n${extraContext}` : text;

    const turnStartedAt = Date.now();
    const announceRecovery = (notice) => {
      if (!stillCurrent()) return;
      updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        text: '',
        isError: false,
        executionStatus: { label: notice },
      } : m));
    };

    try {
      for (let attempt = 1; attempt <= MAX_TURN_ATTEMPTS; attempt += 1) {
        if (!stillCurrent()) return;
        const controller = new AbortController();
        abortControllerRef.current = controller;
        // The deadline covers the whole turn, so a second attempt inherits what
        // is left of it rather than doubling how long the person waits.
        const attemptBudgetMs = Math.max(
          MIN_ATTEMPT_BUDGET_MS,
          turnDeadlineMs - (Date.now() - turnStartedAt),
        );
        const timeoutId = setTimeout(() => controller.abort('timeout'), attemptBudgetMs);

        try {
          const res = await fetch('/api/chat', {
            signal: controller.signal,
            method: 'POST',
            headers: chatRequestHeaders(),
            body: JSON.stringify({
              ...requestBodyFor(targetModel),
              message: messageForModel,
              turnAttempt: attempt,
            })
          });
          if (!stillCurrent()) return;
          const responseCorrelationId = normalizeClientCorrelationId(res.headers.get('X-Quantora-Correlation-Id')) || turnCorrelationId;

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const recovery = resolveTurnRecovery({
              attempt,
              status: res.status,
              code: errData.code,
              retryable: errData.retryable === true,
            });
            if (recovery.retry) {
              announceRecovery(recovery.notice);
              continue;
            }
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
          let travelPlaces = null;
          let travelDegraded = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!stillCurrent()) return;
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
              if (parsed.travelDegraded === true) travelDegraded = true;
              if (parsed.status) {
                if (!stillCurrent()) return;
                updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                  ...m,
                  executionStatus: parsed.status,
                } : m));
              }
              if (parsed.text) {
                currentText += parsed.text;
                if (!stillCurrent()) return;
                updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                  ...m,
                  text: sanitizeAssistantStream(currentText),
                  modelUsed: m.resolvedModelId || m.modelUsed || (autoMode ? (autoResolvedLabel || 'Auto') : targetModel.name),
                } : m));
              }
              if (parsed.provider) {
                if (Array.isArray(parsed.travelPlaces) && parsed.travelPlaces.length) {
                  travelPlaces = parsed.travelPlaces;
                }
                if (!stillCurrent()) return;
                updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                  ...m,
                  provider: parsed.provider,
                  latencyMs: parsed.latencyMs || 0,
                  executionStatus: null,
                  ...(parsed.modelId ? { modelUsed: parsed.modelId, resolvedModelId: parsed.modelId } : {}),
                  ...(parsed.conversation ? { conversation: parsed.conversation } : {}),
                  correlationId: normalizeClientCorrelationId(parsed.correlationId) || responseCorrelationId,
                  ...(parsed.inferenceRoute ? { inferenceRoute: parsed.inferenceRoute } : {}),
                  ...(travelPlaces ? { travelPlaces } : {}),
                  ...(travelDegraded || parsed.travelDegraded ? { travelDegraded: true } : {}),
                } : m));
              }
            }
          }

          if (!stillCurrent()) return;
          if (streamedError || !receivedDone) {
            const recovery = resolveTurnRecovery({
              attempt,
              code: streamedError?.code,
              retryable: streamedError ? streamedError.retryable === true : true,
              hasPartialText: Boolean(currentText),
            });
            if (recovery.retry) {
              announceRecovery(recovery.notice);
              continue;
            }
          }

          if (streamedError) {
            const artifactFailed = streamedError.code === 'BUILD_ARTIFACT_CONTRACT';
            if (artifactFailed && isCodingRequest && codingDeskOpen && !advisorBlocksPreviewBuild(turnDomain)) {
              const scaffolded = buildCodingDeskScaffoldReply(visibleUserText);
              updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                ...m,
                text: scaffolded,
                isError: false,
                executionStatus: null,
                deskScaffolded: true,
              } : m));
              return;
            }
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              text: artifactFailed
                ? `⚠️ **Preview could not run:** ${streamedError.message}`
                : currentText
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

          // Coding Desk build turns must land files. A chat-only plan is not success.
          // Advisor domains (Study flashcards, Travel, etc.) intentionally stay chat.
          if (
            isCodingRequest
            && !advisorBlocksPreviewBuild(turnDomain)
            && !assembleStudioPreview(currentText).code
          ) {
            const recovery = resolveTurnRecovery({
              attempt,
              code: 'BUILD_ARTIFACT_CONTRACT',
              hasPartialText: Boolean(currentText),
            });
            if (recovery.retry) {
              announceRecovery(recovery.notice);
              continue;
            }
            const scaffolded = codingDeskOpen
              ? buildCodingDeskScaffoldReply(visibleUserText)
              : null;
            if (scaffolded) {
              updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                ...m,
                text: scaffolded,
                isError: false,
                executionStatus: null,
                deskScaffolded: true,
              } : m));
              return;
            }
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              text: '⚠️ **Preview could not run:** Quantora generated a chat plan with no runnable files. Retry and I will rebuild a complete page.',
              isError: true,
              executionStatus: null,
            } : m));
            return;
          }

          const normalized = normalizeAssistantResponse(currentText);
          void recordClientBoundary(responseCorrelationId, 'browser.response-parser', 'parsed', {
            transaction: goldenTransaction,
            detailCode: normalized.displayText ? 'assistant-response-valid' : 'assistant-response-empty',
          });
          if (!stillCurrent()) return;
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: withTravelDegradedNotice(normalized.displayText, travelDegraded),
            executionStatus: null,
            ...(normalized.choiceSet ? { choiceSet: normalized.choiceSet } : {}),
            ...(normalized.continueSet ? { continueSet: normalized.continueSet } : {}),
            ...(normalized.clearWorkspace ? { clearWorkspace: true } : {}),
            correlationId: responseCorrelationId,
            ...(travelPlaces ? { travelPlaces } : {}),
            ...(travelDegraded ? { travelDegraded: true } : {}),
          } : m));
          if (normalized.contextUpdate && typeof updateActiveSession === 'function') {
            updateActiveSession({
              conversationContext: mergeSessionContext(turnContext, normalized.contextUpdate),
            });
          }
          await persistPclContinuity({
            sessionId: pclEnvelope.sessionId,
            memoryConsented: pclEnvelope.memoryConsented,
            assistantContext: normalized.contextUpdate,
            confirmedUserFact,
            sourceTurn: String(userMsg.id),
          });
          return;
        } catch (error) {
          if (!stillCurrent()) return;
          const timedOut = controller.signal.aborted && controller.signal.reason === 'timeout';
          const stopped = controller.signal.aborted && controller.signal.reason === 'user';
          const recovery = resolveTurnRecovery({
            attempt,
            networkError: true,
            timedOut,
            stoppedByUser: stopped,
          });
          if (recovery.retry) {
            announceRecovery(recovery.notice);
            continue;
          }
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: stopped
              ? '⚠️ **Generation Stopped**'
              : timedOut
                ? `⚠️ **Request timed out:** Quantora stopped this turn after ${Math.round(turnDeadlineMs / 1000)} seconds instead of leaving it running indefinitely.`
                : `⚠️ **Connection Error:** ${error.message || 'Unable to reach the AI gateway.'}`,
            isError: true,
            executionStatus: null,
          } : m));
          return;
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } finally {
      if (stillCurrent()) {
        abortControllerRef.current = null;
        setIsGenerating(false);
      }
    }
  };

  return { handleSendMessage, cancelStream };
}
