import { useState, useCallback, useMemo } from 'react';
import { mergeSessionListeningSignals } from '../lib/listening-layer.js';

const STORAGE_KEY = 'quantora_chat_sessions';
const PROJECTS_STORAGE_KEY = 'quantora_projects_v1';
export const DEFAULT_PROJECT_ID = 'project-personal';

export function createDefaultGreeting(user, selectedModel) {
  return {
    id: 1,
    sender: 'ai',
    modelUsed: selectedModel?.name || 'Gemini 3 Flash',
    text: 'Hello ' + (user?.name ? user.name.split(' ')[0] : 'Creator') + '! What would you like to create or ask today?',
    type: 'greeting',
  };
}

function createDefaultProject() {
  return {
    id: DEFAULT_PROJECT_ID,
    name: 'Personal Workspace',
    description: 'A flexible space for everyday questions and ideas.',
    goal: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    color: '#f97316',
  };
}

function loadProjects() {
  try {
    const saved = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error(e);
  }
  return [createDefaultProject()];
}

function persistProjects(projects) {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error(e);
  }
}

function loadSessions(defaultGreeting) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((session) => ({ ...session, projectId: session.projectId || DEFAULT_PROJECT_ID }));
      }
    }
  } catch (e) {
    console.error(e);
  }
  return [{
    id: 'session-1',
    title: 'New Chat',
    createdAt: Date.now(),
    projectId: DEFAULT_PROJECT_ID,
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

function makeSession(projectId, defaultGreetingMsg) {
  return {
    id: 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    title: 'New Chat',
    createdAt: Date.now(),
    projectId,
    messages: [defaultGreetingMsg],
    studioMode: 'ask',
    studioDomain: null,
    boundRepo: null,
    conversationContext: {},
    memoryConsented: false,
    outcomeVersion: 0,
    dismissedCapabilityIds: [],
  };
}

/** Chat session state plus durable project/workspace state. */
export function useStudioSession({ user, selectedModel }) {
  const defaultGreetingMsg = useMemo(
    () => createDefaultGreeting(user, selectedModel),
    [user?.name, selectedModel?.name],
  );

  const [projects, setProjects] = useState(() => loadProjects());
  const [activeProjectId, setActiveProjectIdState] = useState(
    () => loadProjects()[0]?.id || DEFAULT_PROJECT_ID,
  );
  const [allChatSessions, setAllChatSessions] = useState(() => loadSessions(defaultGreetingMsg));
  const [activeSessionId, setActiveSessionId] = useState(() => allChatSessions[0]?.id || 'session-1');

  const activeProject = projects.find((project) => project.id === activeProjectId) || projects[0] || createDefaultProject();
  const projectSessions = useMemo(
    () => allChatSessions.filter((session) => (session.projectId || DEFAULT_PROJECT_ID) === activeProject.id),
    [allChatSessions, activeProject.id],
  );
  const chatSessions = projectSessions;
  const activeSession = projectSessions.find((session) => session.id === activeSessionId)
    || projectSessions[0]
    || { id: 'session-empty', projectId: activeProject.id, title: 'New Chat', messages: [defaultGreetingMsg] };

  const messages = activeSession.messages || [defaultGreetingMsg];
  const studioMode = activeSession.studioMode || 'ask';
  const studioDomain = activeSession.studioDomain || null;
  const boundRepo = activeSession.boundRepo || null;
  const conversationContext = activeSession.conversationContext || {};
  const listeningSignals = activeSession.listeningSignals || [];
  const projectArtifacts = useMemo(() => projectSessions.flatMap((session) => (
    (session.messages || []).filter((message) => message.officeAttachment || message.codeSnippet || message.previewUrl).map((message) => ({
      id: message.id,
      sessionId: session.id,
      title: message.officeAttachment?.filename || message.title || 'Generated artifact',
      type: message.officeAttachment ? 'office' : 'workspace',
      createdAt: message.createdAt || session.createdAt,
    }))
  )), [projectSessions]);
  const projectContext = useMemo(() => ({
    projectId: activeProject.id,
    projectName: activeProject.name,
    goal: activeProject.goal || '',
    understanding: activeProject.description || '',
    facts: projectArtifacts.slice(0, 20).map((artifact) => artifact.title),
  }), [activeProject, projectArtifacts]);

  const updateActiveSession = useCallback((updates) => {
    setAllChatSessions((prevSessions) => {
      const updated = prevSessions.map((session) => session.id === activeSessionId ? { ...session, ...updates } : session);
      persistSessions(updated);
      return updated;
    });
  }, [activeSessionId]);

  const updateActiveMessages = useCallback((updater) => {
    setAllChatSessions((prevSessions) => {
      const updated = prevSessions.map((session) => {
        if (session.id !== activeSessionId) return session;
        const newMsgs = typeof updater === 'function' ? updater(session.messages || []) : updater;
        let newTitle = session.title;
        const firstUserMsg = newMsgs.find((m) => m.sender === 'user');
        if (firstUserMsg && (session.title === 'New Chat' || session.title === 'Welcome to Quantora')) {
          newTitle = firstUserMsg.text.slice(0, 32) + (firstUserMsg.text.length > 32 ? '...' : '');
        }
        return { ...session, title: newTitle, messages: newMsgs, updatedAt: Date.now() };
      });
      persistSessions(updated);
      return updated;
    });
  }, [activeSessionId]);

  const setChoiceDockState = useCallback((messageId, choiceDockState) => {
    updateActiveMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, choiceDockState } : m));
  }, [updateActiveMessages]);
  const setStudioMode = useCallback((mode) => updateActiveSession({ studioMode: mode }), [updateActiveSession]);
  const setStudioDomain = useCallback((domain) => updateActiveSession({ studioDomain: domain }), [updateActiveSession]);

  const recordListeningSignal = useCallback((type, payload) => {
    setAllChatSessions((prev) => {
      const updated = prev.map((session) => session.id === activeSessionId ? mergeSessionListeningSignals(session, type, payload) : session);
      persistSessions(updated);
      return updated;
    });
  }, [activeSessionId]);

  const handleCreateNewChat = useCallback(() => {
    const newSession = makeSession(activeProject.id, defaultGreetingMsg);
    setAllChatSessions((prev) => {
      const updated = [newSession, ...prev];
      persistSessions(updated);
      return updated;
    });
    setActiveSessionId(newSession.id);
  }, [activeProject.id, defaultGreetingMsg]);

  const setActiveProjectId = useCallback((projectId) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    setActiveProjectIdState(projectId);
    const firstSession = allChatSessions.find((session) => (session.projectId || DEFAULT_PROJECT_ID) === projectId);
    if (firstSession) {
      setActiveSessionId(firstSession.id);
      return;
    }
    const newSession = makeSession(projectId, defaultGreetingMsg);
    setAllChatSessions((prev) => {
      const updated = [newSession, ...prev];
      persistSessions(updated);
      return updated;
    });
    setActiveSessionId(newSession.id);
  }, [allChatSessions, defaultGreetingMsg, projects]);

  const handleCreateProject = useCallback((input = {}) => {
    const name = String(input.name || '').trim() || 'Untitled Project';
    const project = {
      id: 'project-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      name: name.slice(0, 60),
      description: String(input.description || '').trim().slice(0, 240),
      goal: String(input.goal || '').trim().slice(0, 240),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      color: input.color || '#3b82f6',
    };
    setProjects((prev) => {
      const updated = [project, ...prev];
      persistProjects(updated);
      return updated;
    });
    const newSession = makeSession(project.id, defaultGreetingMsg);
    setAllChatSessions((prev) => {
      const updated = [newSession, ...prev];
      persistSessions(updated);
      return updated;
    });
    setActiveProjectIdState(project.id);
    setActiveSessionId(newSession.id);
    return project;
  }, [defaultGreetingMsg]);

  const updateActiveProject = useCallback((updates) => {
    setProjects((prev) => {
      const updated = prev.map((project) => project.id === activeProject.id ? { ...project, ...updates, updatedAt: Date.now() } : project);
      persistProjects(updated);
      return updated;
    });
  }, [activeProject.id]);

  const handleDeleteChat = useCallback((e, sessionId) => {
    e.stopPropagation();
    setAllChatSessions((prev) => {
      const filtered = prev.filter((session) => session.id !== sessionId);
      const remainingInProject = filtered.filter((session) => (session.projectId || DEFAULT_PROJECT_ID) === activeProject.id);
      const fallback = remainingInProject.length > 0 ? filtered : [makeSession(activeProject.id, defaultGreetingMsg), ...filtered];
      if (activeSessionId === sessionId) {
        const next = fallback.find((session) => (session.projectId || DEFAULT_PROJECT_ID) === activeProject.id);
        setActiveSessionId(next?.id || fallback[0]?.id);
      }
      persistSessions(fallback);
      return fallback;
    });
  }, [activeProject.id, activeSessionId, defaultGreetingMsg]);

  return {
    chatSessions,
    setChatSessions: setAllChatSessions,
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
    projects,
    activeProjectId: activeProject.id,
    activeProject,
    setActiveProjectId,
    handleCreateProject,
    updateActiveProject,
    projectContext,
    projectArtifacts,
  };
}
