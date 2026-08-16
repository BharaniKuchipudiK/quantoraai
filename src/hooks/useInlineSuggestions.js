import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  learnFromChipSelection,
  learnFromDismissedSuggestions,
} from '../lib/communication-intelligence.js';
import { QUANTORA_EVENTS } from '../lib/listening-layer.js';
import { trackSuggestion } from '../lib/acceptance-metrics.js';

// Acceptance-Rate surfaces (Roadmap 9.1): the "kind" of a proactive act maps to
// a stable surface label so accepted/dismissed can be measured per type.
const SUGGESTION_SURFACE = {
  choices: 'inline-choices',
  continues: 'inline-continues',
  nudge: 'inline-nudge',
};

/**
 * Inline suggestion pills — latest AI turn only, conversation-first.
 */
export function useInlineSuggestions({
  messages,
  isGenerating,
  activeSessionId,
  enrichContinues,
  getPriorUserPrompt,
  getProactiveNudge,
  setChoiceDockState,
  updateActiveMessages,
  updateActiveSession,
  conversationContext,
  studioDomain,
  emitQuantora,
  onSendMessage,
  escapeBlocked = false,
}) {
  const [dismissedId, setDismissedId] = useState(null);

  useEffect(() => {
    setDismissedId(null);
  }, [activeSessionId]);

  const latestAiMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.sender === 'ai' && !messages[i]?.isDual) return messages[i].id;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    setDismissedId(null);
  }, [latestAiMessageId]);

  const resolveInlineSuggestions = useCallback((msg) => {
    if (!msg || msg.sender !== 'ai' || msg.isDual) return null;
    if (msg.id !== latestAiMessageId || isGenerating) return null;
    if (dismissedId === msg.id) return null;

    if (msg.choiceSet?.choices?.length && !msg.choiceUsed && msg.choiceDockState !== 'dismissed') {
      return { kind: 'choices', choiceSet: msg.choiceSet, msg };
    }

    if (!msg.continueUsed) {
      const userPrompt = getPriorUserPrompt(msg.id);
      const continueSet = enrichContinues(msg.continueSet, { userPrompt, aiResponse: msg.text });
      if (continueSet?.items?.length) {
        return { kind: 'continues', continueSet, msg };
      }
    }

    if (!msg.proactiveNudgeUsed) {
      const nudge = getProactiveNudge?.(msg);
      if (nudge?.text) return { kind: 'nudge', nudge, msg };
    }

    return null;
  }, [latestAiMessageId, isGenerating, dismissedId, getPriorUserPrompt, getProactiveNudge, enrichContinues]);

  const latestInlineSuggestions = useMemo(() => {
    const msg = messages.find((m) => m.id === latestAiMessageId);
    return resolveInlineSuggestions(msg);
  }, [messages, latestAiMessageId, resolveInlineSuggestions]);

  // Acceptance-Rate: record each proactive act exactly once when it first
  // becomes visible (the memo recomputes often, so dedupe by message+kind).
  const shownRef = useRef(new Set());
  useEffect(() => {
    const s = latestInlineSuggestions;
    if (!s?.msg) return;
    const key = `${s.msg.id}:${s.kind}`;
    if (shownRef.current.has(key)) return;
    shownRef.current.add(key);
    trackSuggestion(SUGGESTION_SURFACE[s.kind] || 'inline', 'shown');
  }, [latestInlineSuggestions]);

  const dismissInlineSuggestions = useCallback((msg, suggestions) => {
    if (!msg || !suggestions) return;
    setDismissedId(msg.id);
    trackSuggestion(SUGGESTION_SURFACE[suggestions.kind] || 'inline', 'dismissed');
    if (suggestions.kind === 'choices') {
      setChoiceDockState(msg.id, 'dismissed');
      emitQuantora(QUANTORA_EVENTS.CHOICE_DOCK_DISMISSED);
    } else if (suggestions.kind === 'continues') {
      updateActiveMessages((prev) => prev.map((m) => (
        m.id === msg.id ? { ...m, continueUsed: true } : m
      )));
    } else {
      updateActiveMessages((prev) => prev.map((m) => (
        m.id === msg.id ? { ...m, proactiveNudgeUsed: true } : m
      )));
    }
    updateActiveSession({
      conversationContext: learnFromDismissedSuggestions(
        conversationContext,
        suggestions.kind === 'choices'
          ? 'suggestions'
          : suggestions.kind === 'continues'
            ? 'continue chips'
            : 'proactive hints',
      ),
    });
  }, [conversationContext, setChoiceDockState, updateActiveSession, updateActiveMessages, emitQuantora]);

  const handleInlineChoiceSelect = useCallback((msg, choice) => {
    updateActiveMessages((prev) => prev.map((m) => (
      m.id === msg.id ? { ...m, choiceUsed: true } : m
    )));
    updateActiveSession({
      conversationContext: learnFromChipSelection(conversationContext, {
        label: choice.label,
        value: choice.value,
        domain: studioDomain,
      }),
    });
    emitQuantora(QUANTORA_EVENTS.CHOICE_SELECTED, { label: choice.label });
    trackSuggestion(SUGGESTION_SURFACE.choices, 'accepted');
    onSendMessage(choice.value, { choiceSelected: true });
  }, [conversationContext, studioDomain, updateActiveSession, updateActiveMessages, emitQuantora, onSendMessage]);

  const handleInlineContinueSelect = useCallback((msg, item) => {
    updateActiveMessages((prev) => prev.map((m) => (
      m.id === msg.id ? { ...m, continueUsed: true } : m
    )));
    updateActiveSession({
      conversationContext: learnFromChipSelection(conversationContext, {
        label: item.label,
        value: item.value,
        domain: studioDomain,
      }),
    });
    emitQuantora(QUANTORA_EVENTS.CONTINUE_SELECTED, { label: item.label });
    trackSuggestion(SUGGESTION_SURFACE.continues, 'accepted');
    onSendMessage(item.value);
  }, [conversationContext, studioDomain, updateActiveSession, updateActiveMessages, emitQuantora, onSendMessage]);

  useEffect(() => {
    if (!latestInlineSuggestions || escapeBlocked) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dismissInlineSuggestions(latestInlineSuggestions.msg, latestInlineSuggestions);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [latestInlineSuggestions, escapeBlocked, dismissInlineSuggestions]);

  return {
    latestAiMessageId,
    resolveInlineSuggestions,
    latestInlineSuggestions,
    dismissInlineSuggestions,
    handleInlineChoiceSelect,
    handleInlineContinueSelect,
    clearDismissed: () => setDismissedId(null),
  };
}
