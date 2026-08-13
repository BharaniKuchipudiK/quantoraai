import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  learnFromChipSelection,
  learnFromDismissedSuggestions,
} from '../lib/communication-intelligence.js';
import { QUANTORA_EVENTS } from '../lib/listening-layer.js';

/**
 * Inline suggestion pills — latest AI turn only, conversation-first.
 */
export function useInlineSuggestions({
  messages,
  isGenerating,
  activeSessionId,
  enrichContinues,
  getPriorUserPrompt,
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

    return null;
  }, [latestAiMessageId, isGenerating, dismissedId, getPriorUserPrompt, enrichContinues]);

  const latestInlineSuggestions = useMemo(() => {
    const msg = messages.find((m) => m.id === latestAiMessageId);
    return resolveInlineSuggestions(msg);
  }, [messages, latestAiMessageId, resolveInlineSuggestions]);

  const dismissInlineSuggestions = useCallback((msg, suggestions) => {
    if (!msg || !suggestions) return;
    setDismissedId(msg.id);
    if (suggestions.kind === 'choices') {
      setChoiceDockState(msg.id, 'dismissed');
      emitQuantora(QUANTORA_EVENTS.CHOICE_DOCK_DISMISSED);
    } else {
      updateActiveMessages((prev) => prev.map((m) => (
        m.id === msg.id ? { ...m, continueUsed: true } : m
      )));
    }
    updateActiveSession({
      conversationContext: learnFromDismissedSuggestions(
        conversationContext,
        suggestions.kind === 'choices' ? 'suggestions' : 'continue chips',
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
