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
import { isCodingDeskAutoSelection, resolveCodingDeskModel } from '../lib/coding-desk-auto-model.js';
import { resolveTurnStudioDomain } from '../../shared/studio/domain-inference.js';
import { shouldRefineRunningDesk } from '../lib/workspace-intent.js';
import { buildCodingTurnPacket, codingTurnRequestFields } from '../lib/studio-desk-context.js';
import { MAX_TURN_ATTEMPTS, resolveTurnRecovery } from '../lib/turn-recovery.js';
import {
  assessShopBuildAsk,
  messageLooksLikeShopBuild,
  shopIntakeSessionFacts,
} from '../lib/shop-catalog-scale.js';
import { planCodingTurn } from '../lib/coding-turn-planner.js';
import { resolveCodingTurnOutcome } from '../lib/coding-outcome-spine.js';
import { rememberCodingTurnLesson, readCodingTurnLessons } from '../lib/coding-turn-memory.js';
import { lessonKindFromOutcome } from '../lib/coding-turn-lesson-kinds.js';
import {
  proveCodingTurn,
  codingTurnMayClaimSuccess,
  proofFailureCopy,
} from '../lib/proof-control-plane.js';
import { sanitizePartnerBuildStatus } from '../lib/partner-build-status.js';
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
// Must stay ABOVE the server's TOTAL_CHAT_BUDGET_MS (165s) or the client aborts a
// turn the server is still working on — the user sees a dead spinner and the
// server's honest failure never arrives.
const BUILD_TURN_DEADLINE_MS = 175_000;

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
  onCodingTurnExecute = null,
  onCodingTurnProved = null,
}) {
  const abortControllerRef = useRef(null);
  const generationTokenRef = useRef(null);
  const { getLearnedBehaviors } = useModelExperienceMemory();

  const recordTurnLesson = (outcomeKind, extras = {}) => {
    rememberCodingTurnLesson(activeSessionId, {
      kind: lessonKindFromOutcome({
        outcomeKind,
        shopIntakeAsk: extras.shopIntakeAsk,
        isShopPhotoTurn: extras.isShopPhotoTurn,
      }),
      detail: String(extras.detail || outcomeKind || '').slice(0, 240),
      intentKind: extras.intentKind,
    });
  };

  const cancelStream = () => {
    generationTokenRef.current = null;
    const controller = abortControllerRef.current;
    if (controller) {
      controller.abort('user');
      abortControllerRef.current = null;
    }
    // Always clear generating — Stop may fire during moderation/Office before a stream controller exists.
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
    const priorUserTexts = (messages || [])
      .filter((message) => message?.sender === 'user' && message.text)
      .map((message) => String(message.text));
    const studioDomainEarly = activeStudioDomain(chatSessions, activeSessionId);
    const refineDeskEarly = shouldRefineRunningDesk({
      prompt: visibleUserText,
      hasDeskFiles: Boolean(canvasCode || (vfs && Object.keys(vfs).length)),
      studioDomain: studioDomainEarly,
    });
    const pinnedEarly = targetModelOverride
      || selectedModel
      || (availableModels || []).find((model) => model?.available !== false)
      || { id: 'gemini-flash-latest', name: 'Gemini Flash' };
    const autoModeEarly = !targetModelOverride && isCodingDeskAutoSelection(pinnedEarly);
    const vfsFileCountEarly = vfs && typeof vfs === 'object' ? Object.keys(vfs).length : 0;
    const openRouterApiKeyHint = getClientSecret('openrouter');
    const turnPlan = planCodingTurn({
      message: visibleUserText,
      priorUserMessages: priorUserTexts,
      codingDeskOpen: Boolean(codingDeskOpen),
      refineDesk: Boolean(refineDeskEarly),
      studioDomain: studioDomainEarly,
      history: messages,
      autoMode: autoModeEarly,
      availableModels: availableModels || [],
      vfsFileCount: vfsFileCountEarly,
      lessons: readCodingTurnLessons(activeSessionId),
      allowPaid: Boolean(openRouterApiKeyHint),
    });
    const intakeAccept = turnPlan.intakeAccept || { expanded: false, catalogTarget: null, userAsked: 0 };
    if (turnPlan.mode === 'execute' || turnPlan.mode === 'interrupt') {
      text = turnPlan.messageForModel || text;
    }
    if (turnPlan.mode === 'execute' && turnPlan.runSkillsFirst && typeof onCodingTurnExecute === 'function') {
      try {
        onCodingTurnExecute(turnPlan);
      } catch { /* desk seed is best-effort; model still runs */ }
    }
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
      // Keep the short typed accept in the transcript; the model still gets the expanded brief.
      text: intakeAccept.expanded ? visibleUserText : text.trim(),
      attachments: [...attachments]
    };

    updateActiveMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setAttachments([]);

    // Coding Turn Planner owns the turn: analyse → skills → interrupt | execute.
    if (turnPlan.mode === 'interrupt' && turnPlan.interrupt) {
      updateActiveMessages((prev) => [...prev, {
        id: createMessageId('ai'),
        sender: 'ai',
        text: turnPlan.interrupt.reply,
        componentType: 'formatted_text',
        codingTurnPlan: {
          intent: turnPlan.intent,
          skillsRequired: turnPlan.skillsRequired.map((s) => s.id),
          skillsMissing: turnPlan.skillsMissing.map((s) => s.id),
          proof: turnPlan.proof,
        },
        partnerInterrupt: {
          kind: turnPlan.interrupt.kind,
          catalogTarget: turnPlan.interrupt.assessment?.catalogTarget || null,
          userAsked: turnPlan.interrupt.assessment?.userAsked || null,
        },
        continueSet: {
          prompt: 'Agree on the next move',
          items: (turnPlan.interrupt.chips || []).map((chip) => ({
            id: chip.id,
            label: chip.label,
            value: chip.value,
            priority: chip.priority,
          })),
        },
      }]);
      return;
    }

    setIsGenerating(true);

    try {
      /*
       * Sending an attachment with no typed text is allowed (the send button
       * enables on attachments alone), but /api/moderate rejects an empty prompt
       * with 400. Every non-ok status mapped to the same "try again in a moment"
       * copy, so attaching a screenshot and pressing send failed permanently and
       * blamed a transient outage. Screen a text-only prompt; with no text there
       * is nothing for the text classifier to read.
       */
      const promptToScreen = text.trim();
      const modRes = promptToScreen
        ? await fetch('/api/moderate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptToScreen })
          })
        : null;
      if (!stillCurrent()) return;
      if (modRes && !modRes.ok) {
        // 413 is deterministic (the prompt is too long) — retrying cannot clear
        // it, so say that instead of implying the service is briefly down.
        const tooLong = modRes.status === 413;
        updateActiveMessages(prev => [...prev, {
          id: createMessageId('ai'),
          sender: 'ai',
          text: tooLong
            ? '⚠️ **This message is too long to send.** Shorten it — or remove the attached page context — and try again.'
            : '⚠️ **Safety check unavailable.** Quantora could not reach the moderation service, so this turn was not sent. Please try again in a moment.',
          isError: true
        }]);
        setIsGenerating(false);
        return;
      }
      const modData = modRes ? await modRes.json().catch(() => ({})) : {};
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
    const hasCodingWorkspace = deskFiles
      || Boolean(isWorkspaceMode)
      || Boolean(codingDeskOpen)
      || Boolean(typeof canvasCode === 'string' && canvasCode.trim());
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
    const shopIntakeAsk = turnPlan.shop || assessShopBuildAsk(intakeAccept.expanded ? text : (visibleUserText || text));
    if (autoMode && isCodingRequest) {
      if (turnPlan.modelPlan?.modelId) {
        autoResolvedLabel = turnPlan.modelPlan.modelName || turnPlan.modelPlan.modelId;
        targetModel = {
          id: 'auto',
          name: 'Auto',
          resolvedModelId: turnPlan.modelPlan.modelId,
          resolvedModelName: autoResolvedLabel,
        };
      } else {
        const openRouterApiKeyHint = getClientSecret('openrouter');
        const vfsFileCount = vfs && typeof vfs === 'object' ? Object.keys(vfs).length : 0;
        const resolved = resolveCodingDeskModel({
          task: 'coding',
          message: text,
          hasVFS: vfsFileCount > 0,
          refineMode: refineDesk,
          availableModels: availableModels || [],
          qualityHints: {
            fileCount: vfsFileCount,
            shopImageOversize: shopIntakeAsk.oversize,
          },
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
    }
    const turnDomain = resolveTurnStudioDomain({
      explicit: studioDomain,
      message: visibleUserText,
      history: messages,
      isCodingRequest,
      hasCodingWorkspace,
    }) || studioDomain;
    if (briefingKind || isCodingRequest || turnDomain === 'travel') effectiveArenaMode = false;

    const answerFact = captureUserAnswerAsContext(visibleUserText, messages);
    const mission = deriveStudioMission({
      conversationContext,
      messages: [...messages, { sender: 'user', text: visibleUserText }],
      hasPreview: Boolean(isWorkspaceMode && (canvasCode || (vfs && Object.keys(vfs).length))),
      officeKind: briefingKind || activeOfficeArtifactKind(messages),
    });
    const intakeFacts = [
      ...shopIntakeSessionFacts(shopIntakeAsk),
      ...(intakeAccept.expanded && intakeAccept.catalogTarget
        ? [
          `shopCatalogTarget:${intakeAccept.catalogTarget}`,
          `Catalog photos this turn: about ${intakeAccept.catalogTarget} working images (user accepted the smaller catalog; do not generate dozens of unique AI mockups).`,
        ]
        : []),
    ];
    const turnContext = mergeStudySyllabusFromText(
      mergeSessionContext(
        conversationContext,
        mergeSessionContext(sessionContext, {
          ...(mission?.goal ? { goal: mission.goal } : {}),
          ...(mission?.understanding ? { understanding: mission.understanding } : {}),
          ...((answerFact || intakeFacts.length)
            ? { facts: [...(answerFact ? [answerFact] : []), ...intakeFacts] }
            : {}),
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
    /*
     * The server has accepted vision input all along (attachedImages: data-URI
     * strings, max 4 - see the request normalizer); the client simply never sent
     * them, so an attached screenshot was read, encoded, displayed in the
     * composer, and then dropped. Forward them.
     *
     * An attachment-only send also has empty `text`, which /api/chat rejects with
     * "Message string is required" - so skipping the moderation call alone just
     * moved that dead end one hop. Give the turn a real instruction instead, and
     * only when an image is actually attached and being delivered.
     */
    /*
     * The wire budget, not the file-picker's budget. A base64 data URI is ~4/3 the
     * size of the file it encodes, so the uploader's 3MB-per-file ceiling produces
     * a ~4.2M-character string - already past this cap on its own. Anything the cap
     * excludes must be REPORTED, never dropped in silence: the earlier version
     * broke out of the loop on the first oversized image, which also discarded
     * every smaller image queued behind it, and the turn then went to the model
     * describing an image it had never been sent.
     */
    const MAX_ATTACHED_IMAGE_CHARS = 3_500_000; // keeps the JSON body under Vercel's 4.5MB limit
    const MAX_ATTACHED_IMAGES = 4;
    const deliverableImages = [];
    const excluded = [];
    let attachedChars = 0;
    for (const item of attachments || []) {
      const url = item?.dataUrl;
      // No dataUrl at all: a non-image file, or one the reader already rejected.
      if (typeof url !== 'string' || !url.startsWith('data:image/')) {
        excluded.push({ name: item?.name, reason: 'unsupported' });
        continue;
      }
      if (deliverableImages.length >= MAX_ATTACHED_IMAGES) {
        excluded.push({ name: item?.name, reason: 'count' });
        continue;
      }
      // Skip this one and keep going - a later, smaller image can still fit.
      if (attachedChars + url.length > MAX_ATTACHED_IMAGE_CHARS) {
        excluded.push({ name: item?.name, reason: 'size' });
        continue;
      }
      attachedChars += url.length;
      deliverableImages.push(url);
    }
    const attachedImages = deliverableImages;

    const namesOf = (list) => list.map((entry) => entry.name).filter(Boolean).join(', ');
    const tooLarge = excluded.filter((entry) => entry.reason === 'size');
    const unsupported = excluded.filter((entry) => entry.reason === 'unsupported');
    const overCount = excluded.filter((entry) => entry.reason === 'count');

    /*
     * Nothing to send: an attachment-only turn where every attachment was excluded
     * would otherwise post an empty message that /api/chat rejects with "Message
     * string is required" - a dead end with the moderation error suppressed, so
     * nothing explained it. Say which file was excluded and why.
     */
    if (!text.trim() && !attachedImages.length) {
      const explanation = tooLarge.length
        ? `${namesOf(tooLarge) || 'That image'} is too large to send once encoded — images need to be roughly 2.5MB or smaller. Try a smaller copy, or tell me what you need and I will help.`
        : unsupported.length
          ? `I can read images (PNG/JPG), but not ${namesOf(unsupported) || 'that file'} — describe what you need and I will help.`
          : 'Add a message so I know what you would like me to do.';
      updateActiveMessages((prev) => [...prev, {
        id: createMessageId('ai'),
        sender: 'ai',
        text: explanation,
        isError: true,
      }]);
      setIsGenerating(false);
      return;
    }

    /*
     * The turn IS going ahead, but not with everything that was attached. Saying so
     * up front is the difference between a partial answer and a wrong one: without
     * it the model answers about the images it received while the composer shows
     * the ones it did not.
     */
    if (excluded.length) {
      const parts = [];
      if (tooLarge.length) parts.push(`${namesOf(tooLarge) || 'one image'} (too large once encoded)`);
      if (unsupported.length) parts.push(`${namesOf(unsupported) || 'one file'} (not a readable image)`);
      if (overCount.length) parts.push(`${namesOf(overCount) || 'the rest'} (only ${MAX_ATTACHED_IMAGES} images per turn)`);
      updateActiveMessages((prev) => [...prev, {
        id: createMessageId('ai'),
        sender: 'ai',
        text: `Heads up — I could not send ${parts.join(' and ')}. I am answering on what did go through.`,
        isError: true,
      }]);
    }

    const messageForRequest = text.trim() || 'I have attached an image. Describe what you see and help me with it.';

    const requestBodyFor = (model) => ({
      message: messageForRequest,
      attachedImages,
      modelId: model.id,
      modelName: model.name,
      history: cleanMessages,
      cognitiveLevel,
      webSearch: false,
      sessionContext: turnContext,
      projectId: sessionContext?.projectId || turnContext?.projectId || null,
      studioDomain: turnDomain,
      buildMode: isCodingRequest,
      // Keep server inference sticky even when this turn is chat-only on a live desk.
      taskCategory: isCodingRequest || hasCodingWorkspace ? 'coding' : 'general',
      hasVFS: vfsFileCountForHints > 0,
      ...(isCodingRequest ? {
        qualityHints: {
          fileCount: vfsFileCountForHints,
          repair: refineDesk,
          shopImageOversize: shopIntakeAsk.oversize,
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
      executionStatus: turnPlan.statusLabel
        ? { label: turnPlan.statusLabel }
        : null,
      ...(turnPlan.isCodingTurn ? {
        codingTurnPlan: {
          intent: turnPlan.intent,
          skillsRequired: turnPlan.skillsRequired.map((s) => s.id),
          proof: turnPlan.proof,
          runSkillsFirst: Boolean(turnPlan.runSkillsFirst),
        },
      } : {}),
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
        /*
         * What the model actually streamed before anything went wrong.
         *
         * `currentText` lives inside the read loop, so the outer catch could not
         * see it and overwrote the message with the error copy - throwing away a
         * page that was most of the way built. That is the same deletion the proof
         * gate used to do, and it is worse here: those tokens were generated and
         * billed. Three sites further down already append the outcome to the
         * partial instead of replacing it; the catch was the one that could not,
         * for want of a variable in the right scope.
         */
        let streamedSoFar = '';
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
                const nextStatus = sanitizePartnerBuildStatus(parsed.status, {
                  catalogTarget: intakeAccept.catalogTarget || shopIntakeAsk.catalogTarget || 10,
                  intakeAccepted: Boolean(intakeAccept.expanded || shopIntakeAsk.oversize),
                  userAsked: intakeAccept.userAsked || shopIntakeAsk.userAsked || shopIntakeAsk.imageAskCount || 0,
                });
                updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                  ...m,
                  executionStatus: nextStatus,
                } : m));
              }
              if (parsed.text) {
                currentText += parsed.text;
                streamedSoFar = currentText;
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
            // A failed build is NOT rewritten into an authored dashboard. This
            // branch used to substitute a hand-written HTML shell for the model's
            // missing output, flip isError to false, and hand back a page whose
            // "Run sample organize pass" button reported "12 files grouped, 3
            // duplicates flagged" — counts invented in the template. The user was
            // shown a working product built by nobody, told nothing had failed,
            // and outcome metrics recorded a success. Fall through to the honest
            // failure paths below instead. The flag is still read by those paths
            // to word the real error.
            const artifactFailed = streamedError.code === 'BUILD_ARTIFACT_CONTRACT';
            if (isCodingRequest) {
              // Model route died mid-stream — still prove skills-seeded desk.
              if (turnPlan?.isCodingTurn) {
                const deskProof = proveCodingTurn({
                  plan: turnPlan,
                  vfs: vfs || {},
                  job: deskJob,
                  brief: turnPlan.messageForModel || visibleUserText,
                  allowRepair: true,
                  sessionId: activeSessionId,
                });
                const thisTurnOwnedDesk = Boolean(
                  turnPlan.runSkillsFirst
                  || deskProof.repaired
                  || (Array.isArray(deskProof.ran) && deskProof.ran.length > 0),
                );
                if (thisTurnOwnedDesk && codingTurnMayClaimSuccess(deskProof)) {
                  if (typeof onCodingTurnProved === 'function') {
                    try { onCodingTurnProved(deskProof, turnPlan); } catch { /* ignore */ }
                  }
                  const why = artifactFailed
                    ? (streamedError.message || 'Build artifact failed')
                    : (streamedError?.message || 'no healthy AI route');
                  updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                    ...m,
                    text: (
                      `${why}, but Preview is already proved on the desk `
                      + `(${deskProof.evidence.photos || 0} catalog photos`
                      + `${deskProof.evidence.hasCart ? ', Add to Cart' : ''}). `
                      + 'Open Coding desk — the page is there.'
                    ),
                    isError: false,
                    executionStatus: null,
                    codingProof: {
                      ok: true,
                      gaps: [],
                      evidence: deskProof.evidence,
                      status: 'pass',
                      repaired: deskProof.repaired,
                    },
                  } : m));
                  return;
                }
              }
              const providerOutcome = resolveCodingTurnOutcome({
                kind: 'provider-dead',
                errorMessage: artifactFailed
                  ? streamedError.message
                  : (currentText
                    ? 'provider handoff failed after a partial reply'
                    : 'no healthy AI route'),
                shopIntakeAsk,
              });
              recordTurnLesson('provider-dead', {
                shopIntakeAsk,
                detail: streamedError?.message || 'provider-dead',
                intentKind: turnPlan.intent?.kind,
              });
              updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                ...m,
                text: currentText && !artifactFailed
                  ? `${sanitizeAssistantStream(currentText)}\n\n${providerOutcome.text}`
                  : providerOutcome.text,
                isError: providerOutcome.isError,
                executionStatus: null,
                ...(providerOutcome.continueSet ? { continueSet: providerOutcome.continueSet } : {}),
              } : m));
              return;
            }
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              text: artifactFailed
                ? `⚠️ **Could not finish:** ${streamedError.message}`
                : currentText
                  ? `${sanitizeAssistantStream(currentText)}\n\n⚠️ Quantora could not complete the provider handoff for this turn.`
                  : '⚠️ **Temporarily unavailable:** Quantora could not reach a healthy AI route. Please retry in a moment.',
              isError: true,
              executionStatus: null,
            } : m));
            return;
          }
          if (!receivedDone) {
            if (isCodingRequest) {
              const streamOutcome = resolveCodingTurnOutcome({
                kind: 'stream-ended',
                errorMessage: 'the response stream ended unexpectedly',
                shopIntakeAsk,
              });
              recordTurnLesson('stream-ended', {
                shopIntakeAsk,
                detail: 'stream-ended',
                intentKind: turnPlan.intent?.kind,
              });
              updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                ...m,
                text: currentText
                  ? `${sanitizeAssistantStream(currentText)}\n\n${streamOutcome.text}`
                  : streamOutcome.text,
                isError: streamOutcome.isError,
                executionStatus: null,
                ...(streamOutcome.continueSet ? { continueSet: streamOutcome.continueSet } : {}),
              } : m));
              return;
            }
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

          // Coding Desk build turns must land files OR already-proved skills on the desk.
          // Advisor domains (Study flashcards, Travel, etc.) intentionally stay chat.
          if (
            isCodingRequest
            && !advisorBlocksPreviewBuild(turnDomain)
            && !assembleStudioPreview(currentText).code
          ) {
            const shopOwned = Boolean(
              turnPlan?.isCodingTurn
              && (turnPlan.intent?.kind?.startsWith('shop') || turnPlan.shop || turnPlan.intakeAccept?.expanded),
            );
            // Skills-first may already have proved a shop on the desk while the model
            // returned prose — prove that VFS before declaring no-preview.
            if (turnPlan?.isCodingTurn) {
              const seededProof = proveCodingTurn({
                plan: turnPlan,
                vfs: vfs || {},
                job: deskJob,
                brief: turnPlan.messageForModel || visibleUserText,
                allowRepair: true,
                sessionId: activeSessionId,
              });
              if (codingTurnMayClaimSuccess(seededProof)) {
                if (typeof onCodingTurnProved === 'function') {
                  try { onCodingTurnProved(seededProof, turnPlan); } catch { /* ignore */ }
                }
                const okCopy = shopOwned
                  ? (
                    `Preview is proved on the desk `
                    + `(${seededProof.evidence.photos} catalog photos`
                    + `${seededProof.evidence.hasCart ? ', Add to Cart' : ''}).`
                  )
                  : 'Preview is proved on the desk — open Coding desk to run it.';
                updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                  ...m,
                  text: currentText
                    ? `${sanitizeAssistantStream(currentText)}\n\n${okCopy}`
                    : okCopy,
                  isError: false,
                  executionStatus: null,
                  codingProof: {
                    ok: true,
                    gaps: [],
                    evidence: seededProof.evidence,
                    status: 'pass',
                    repaired: seededProof.repaired,
                  },
                  correlationId: responseCorrelationId,
                } : m));
                return;
              }
            }
            const recovery = resolveTurnRecovery({
              attempt,
              code: 'BUILD_ARTIFACT_CONTRACT',
              hasPartialText: Boolean(currentText),
            });
            if (recovery.retry) {
              announceRecovery(recovery.notice);
              continue;
            }
            // No authored scaffold here either: a build that produced no files is
            // reported as the failure it is, via resolveCodingTurnOutcome below.
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              ...(() => {
                const outcome = resolveCodingTurnOutcome({ kind: 'no-preview', shopIntakeAsk });
                recordTurnLesson('no-preview', {
                  shopIntakeAsk,
                  detail: 'no-preview',
                  intentKind: turnPlan.intent?.kind,
                });
                return {
                  // Same rule as the other paths: a turn that produced no FILES
                  // may still have produced words, and showing them is not the
                  // fabrication the comment above guards against - it is the
                  // opposite. Only the platform's own invented content is banned.
                  text: currentText
                    ? `${sanitizeAssistantStream(currentText)}\n\n${outcome.text}`
                    : outcome.text,
                  isError: outcome.isError,
                  executionStatus: null,
                  ...(outcome.continueSet ? { continueSet: outcome.continueSet } : {}),
                };
              })(),
            } : m));
            return;
          }

          // Proof Control Plane owns success — skills + repair + evidence, not chat claims.
          let codingProof = null;
          // A failed proof annotates the turn; it never replaces it. See below.
          let proofNote = '';
          let proofChips = [];
          if (turnPlan?.isCodingTurn && !advisorBlocksPreviewBuild(turnDomain)) {
            const assembled = assembleStudioPreview(currentText, vfs || {});
            const seedVfs = {
              ...(vfs || {}),
              ...(assembled.vfs || {}),
            };
            codingProof = proveCodingTurn({
              plan: turnPlan,
              vfs: seedVfs,
              job: deskJob,
              brief: turnPlan.messageForModel || visibleUserText,
              allowRepair: true,
              sessionId: activeSessionId,
            });
            if (typeof onCodingTurnProved === 'function') {
              try {
                onCodingTurnProved(codingProof, turnPlan);
              } catch { /* desk apply is best-effort */ }
            }
            /*
             * A failed proof is a NOTE, never a replacement.
             *
             * This branch used to overwrite the assistant message with the failure
             * copy and return, which skipped the entire path that renders the build.
             * A complete, working page the gate simply did not recognise - anything
             * without a <!DOCTYPE, or React the runtime detector missed - was deleted
             * before the user ever saw it, and the text that replaced it talked about
             * catalog photos and Add to Cart whatever had been asked for.
             *
             * The model's output is the user's work. The gate may annotate it. It may
             * not destroy it. Verification that hides the thing it cannot verify is
             * not verification, it is censorship with extra steps.
             */
            if (!codingTurnMayClaimSuccess(codingProof)) {
              proofNote = proofFailureCopy(codingProof, turnPlan);
              proofChips = (shopIntakeAsk?.chips || turnPlan.interrupt?.chips || []).map((chip) => ({
                id: chip.id,
                label: chip.label,
                value: chip.value,
                priority: chip.priority,
              }));
            }
          }

          const normalized = normalizeAssistantResponse(currentText);
          const intakeHonesty = shopIntakeAsk.oversize ? shopIntakeAsk.userCopy : '';
          const displayWithIntake = intakeHonesty
            && !String(normalized.displayText || '').includes('can’t generate')
            && !String(normalized.displayText || '').includes("can't generate")
            ? `${intakeHonesty}\n\n${normalized.displayText || ''}`.trim()
            : normalized.displayText;
          const intakeContinueItems = shopIntakeAsk.oversize
            ? shopIntakeAsk.chips.map((chip) => ({
              id: chip.id,
              label: chip.label,
              value: chip.value,
            }))
            : [];
          const mergedContinueSet = intakeContinueItems.length
            ? {
              items: [
                ...intakeContinueItems,
                ...((normalized.continueSet?.items || []).filter(
                  (item) => !intakeContinueItems.some((chip) => chip.id === item.id),
                )),
              ],
            }
            : (normalized.continueSet || null);
          void recordClientBoundary(responseCorrelationId, 'browser.response-parser', 'parsed', {
            transaction: goldenTransaction,
            detailCode: displayWithIntake ? 'assistant-response-valid' : 'assistant-response-empty',
          });
          if (!stillCurrent()) return;
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            text: proofNote
              ? `${withTravelDegradedNotice(displayWithIntake, travelDegraded) || ''}\n\n---\n\n${proofNote}`.trim()
              : withTravelDegradedNotice(displayWithIntake, travelDegraded),
            executionStatus: null,
            ...(codingProof ? {
              // The real verdict. This was hardcoded to pass, which was true only
              // because a failure returned before reaching here. Now that a failed
              // proof lands with its build, it must report what it actually found.
              codingProof: {
                ok: Boolean(codingProof.ok),
                gaps: codingProof.gaps || [],
                evidence: codingProof.evidence,
                status: codingProof.status,
                repaired: codingProof.repaired,
              },
            } : {}),
            ...(normalized.choiceSet ? { choiceSet: normalized.choiceSet } : {}),
            ...((mergedContinueSet || proofChips.length) ? {
              continueSet: {
                items: [
                  ...(mergedContinueSet?.items || []),
                  ...proofChips.filter(
                    (chip) => !(mergedContinueSet?.items || []).some((item) => item.id === chip.id),
                  ),
                ],
              },
            } : {}),
            ...(normalized.clearWorkspace ? { clearWorkspace: true } : {}),
            correlationId: responseCorrelationId,
            ...(travelPlaces ? { travelPlaces } : {}),
            ...(travelDegraded ? { travelDegraded: true } : {}),
            ...(shopIntakeAsk.oversize ? {
              shopIntake: {
                catalogTarget: shopIntakeAsk.catalogTarget,
                userAsked: shopIntakeAsk.userAsked,
              },
            } : {}),
          } : m));
          if (typeof updateActiveSession === 'function' && (normalized.contextUpdate || intakeFacts.length)) {
            updateActiveSession({
              conversationContext: mergeSessionContext(
                turnContext,
                mergeSessionContext(
                  normalized.contextUpdate || {},
                  intakeFacts.length ? { facts: intakeFacts } : {},
                ),
              ),
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
          if (isCodingRequest) {
            const isShopPhotoTurn = Boolean(
              shopIntakeAsk.oversize
              || (messageLooksLikeShopBuild(visibleUserText) && /\b(?:image|photo|catalog)\b/i.test(visibleUserText)),
            );
            // Model died — keep desk only when THIS turn seeded/repaired it.
            // Do not call a prior Preview a success for a timed-out refine.
            if (turnPlan?.isCodingTurn && !stopped) {
              const deskProof = proveCodingTurn({
                plan: turnPlan,
                vfs: vfs || {},
                job: deskJob,
                brief: turnPlan.messageForModel || visibleUserText,
                allowRepair: true,
                sessionId: activeSessionId,
              });
              const thisTurnOwnedDesk = Boolean(
                turnPlan.runSkillsFirst
                || deskProof.repaired
                || (Array.isArray(deskProof.ran) && deskProof.ran.length > 0),
              );
              if (thisTurnOwnedDesk && codingTurnMayClaimSuccess(deskProof)) {
                if (typeof onCodingTurnProved === 'function') {
                  try { onCodingTurnProved(deskProof, turnPlan); } catch { /* ignore */ }
                }
                const why = timedOut
                  ? `The model hit the ${Math.round(turnDeadlineMs / 1000)}s limit`
                  : (error.message || 'The model route failed');
                updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
                  ...m,
                  text: (
                    `${why}, but Preview is already proved on the desk `
                    + `(${deskProof.evidence.photos || 0} catalog photos`
                    + `${deskProof.evidence.hasCart ? ', Add to Cart' : ''}). `
                    + 'Open Coding desk — the page is there.'
                  ),
                  isError: false,
                  executionStatus: null,
                  codingProof: {
                    ok: true,
                    gaps: [],
                    evidence: deskProof.evidence,
                    status: 'pass',
                    repaired: deskProof.repaired,
                  },
                } : m));
                return;
              }
            }
            const outcome = resolveCodingTurnOutcome({
              kind: stopped ? 'stopped' : timedOut ? 'timeout' : 'provider-dead',
              turnDeadlineSec: Math.round(turnDeadlineMs / 1000),
              errorMessage: error.message || 'Unable to reach the AI gateway.',
              shopIntakeAsk,
              isShopPhotoTurn,
            });
            if (!stopped) {
              recordTurnLesson(timedOut ? 'timeout' : 'provider-dead', {
                shopIntakeAsk,
                isShopPhotoTurn,
                detail: error.message || (timedOut ? 'timeout' : 'provider-dead'),
                intentKind: turnPlan.intent?.kind,
              });
              if (timedOut && shopIntakeAsk?.oversize && !intakeAccept.expanded) {
                recordTurnLesson('oversize_burn', {
                  shopIntakeAsk,
                  isShopPhotoTurn: true,
                  detail: 'oversize timed out without agree',
                  intentKind: turnPlan.intent?.kind,
                });
              }
            }
            updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              // Keep the build and explain what stopped it, the way the three
              // sites above already do. A page that got 90% of the way is worth
              // more than a sentence saying it did not arrive.
              text: streamedSoFar
                ? `${sanitizeAssistantStream(streamedSoFar)}\n\n${outcome.text}`
                : outcome.text,
              isError: outcome.isError,
              executionStatus: null,
              ...(outcome.continueSet ? { continueSet: outcome.continueSet } : {}),
            } : m));
            return;
          }
          const failureNote = stopped
            ? '⚠️ **Generation Stopped**'
            : timedOut
              ? `⚠️ **Request timed out:** Quantora stopped this turn after ${Math.round(turnDeadlineMs / 1000)} seconds instead of leaving it running indefinitely.`
              : `⚠️ **Connection Error:** ${error.message || 'Unable to reach the AI gateway.'}`;
          updateActiveMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m,
            // Stopping a turn - by timeout, by Stop, or by a dead connection -
            // must not erase what already arrived.
            text: streamedSoFar
              ? `${sanitizeAssistantStream(streamedSoFar)}\n\n${failureNote}`
              : failureNote,
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
