import { useState, useCallback, useMemo } from 'react';
import { mergeSessionListeningSignals } from '../lib/listening-layer.js';

const STORAGE_KEY = 'quantora_chat_sessions';

export function createDefaultGreeting(user, selectedModel) {
  return {
    id: 1,
    sender: 'ai',
    modelUsed: selectedModel?.name || 'Gemini 3 Flash',
    text: `Hello ${user?.name ? user.name.split(' ')[0] : 'Creator'}! What would you like to create or ask today?`,
    type: 'greeting',
  };
}

function loadSessions(defaultGreeting) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error(e);
  }
  return [{
    id: 'session-1',
    title: 'New Chat',
    createdAt: Date.now(),
    messages: [defaultGreeting],
  }];
}

function persistSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error(e);
  }
}

/**
 * Chat session state — messages, context, modes, persistence.
 */
export function useStudioSession({ user, selectedModel }) {
  const defaultGreetingMsg = useMemo(
    () => createDefaultGreeting(user, selectedModel),
    [user?.name, selectedModel?.name],
  );

  const [chatSessions, setChatSessions] = useState(() => loadSessions(defaultGreetingMsg));
  const [activeSessionId, setActiveSessionId] = useState(
    () => chatSessions[0]?.id || 'session-1',
  );

  const activeSession = chatSessions.find((s) => s.id === activeSessionId)
    || chatSessions[0]
    || { id: 'session-1', title: 'New Chat', messages: [defaultGreetingMsg] };

  const messages = activeSession.messages || [defaultGreetingMsg];
  const studioMode = activeSession.studioMode || 'ask';
  const studioDomain = activeSession.studioDomain || null;
  const boundRepo = activeSession.boundRepo || null;
  const conversationContext = activeSession.conversationContext || {};
  const listeningSignals = activeSession.listeningSignals || [];

  const updateActiveSession = useCallback((updates) => {
    setChatSessions((prevSessions) => {
      const updated = prevSessions.map((session) => (
        session.id === activeSessionId ? { ...session, ...updates } : session
      ));
      persistSessions(updated);
      return updated;
    });
  }, [activeSessionId]);

  const updateActiveMessages = useCallback((updater) => {
    setChatSessions((prevSessions) => {
      const updated = prevSessions.map((session) => {
        if (session.id !== activeSessionId) return session;
        const newMsgs = typeof updater === 'function' ? updater(session.messages) : updater;
        let newTitle = session.title;
        const firstUserMsg = newMsgs.find((m) => m.sender === 'user');
        if (firstUserMsg && (session.title === 'New Chat' || session.title === 'Welcome to Quantora')) {
          newTitle = firstUserMsg.text.slice(0, 32) + (firstUserMsg.text.length > 32 ? '...' : '');
        }
        return { ...session, title: newTitle, messages: newMsgs };
      });
      persistSessions(updated);
      return updated;
    });
  }, [activeSessionId]);

  const setChoiceDockState = useCallback((messageId, choiceDockState) => {
    updateActiveMessages((prev) => prev.map((m) => (
      m.id === messageId ? { ...m, choiceDockState } : m
    )));
  }, [updateActiveMessages]);

  const setStudioMode = useCallback((mode) => {
    updateActiveSession({ studioMode: mode });
  }, [updateActiveSession]);

  const setStudioDomain = useCallback((domain) => {
    updateActiveSession({ studioDomain: domain });
  }, [updateActiveSession]);

  const recordListeningSignal = useCallback((type, payload) => {
    setChatSessions((prev) => {
      const updated = prev.map((session) => (
        session.id === activeSessionId
          ? mergeSessionListeningSignals(session, type, payload)
          : session
      ));
      persistSessions(updated);
      return updated;
    });
  }, [activeSessionId]);

  const handleCreateNewChat = useCallback(() => {
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      title: 'New Chat',
      createdAt: Date.now(),
      messages: [defaultGreetingMsg],
      studioMode: 'ask',
      studioDomain: null,
      boundRepo: null,
      conversationContext: {},
    };
    setChatSessions((prev) => {
      const updated = [newSession, ...prev];
      persistSessions(updated);
      return updated;
    });
    setActiveSessionId(newId);
  }, [defaultGreetingMsg]);

  const handleDeleteChat = useCallback((e, sessionId) => {
    e.stopPropagation();
    setChatSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId);
      const fallback = filtered.length > 0 ? filtered : [{
        id: `session-${Date.now()}`,
        title: 'New Chat',
        createdAt: Date.now(),
        messages: [defaultGreetingMsg],
      }];
      if (activeSessionId === sessionId) {
        setActiveSessionId(fallback[0].id);
      }
      persistSessions(fallback);
      return fallback;
    });
  }, [activeSessionId, defaultGreetingMsg]);

  return {
    chatSessions,
    setChatSessions,
    activeSessionId,
    setActiveSessionId,
    activeSession,
    messages,
    studioMode,
    studioDomain,
    boundRepo,
    conversationContext,
    listeningSignals,
    defaultGreetingMsg,
    updateActiveSession,
    updateActiveMessages,
    setChoiceDockState,
    setStudioMode,
    setStudioDomain,
    recordListeningSignal,
    handleCreateNewChat,
    handleDeleteChat,
  };
}
