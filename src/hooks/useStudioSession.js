import { useState, useCallback, useMemo, useEffect } from 'react';
import { mergeSessionListeningSignals } from '../lib/listening-layer.js';
import {
  STUDIO_DOMAIN_REQUEST_EVENT,
  normalizeStudioDomain,
  publishStudioDomainState,
} from '../lib/studio-shell-events.js';
import { studioDomainPolicy } from '../lib/studio-domain-policy.js';
import {
  loadRemoteProjectContext,
  loadRemoteProjects,
  saveRemoteProject,
  syncRemoteProjectResources,
  syncRemoteProjectSessions,
} from '../lib/project-store.js';

const STORAGE_KEY = 'quantora_chat_sessions';
const PROJECTS_STORAGE_KEY = 'quantora_projects_v1';
export const DEFAULT_PROJECT_ID = 'project-personal';

const PROJECT_LIMITS = Object.freeze({ name: 120, description: 2000, goal: 2000 });
const DEFAULT_PROJECT_COLOR = '#f97316';
const NEW_PROJECT_COLOR = '#3b82f6';
const MAX_PROJECT_CONTEXT_FACTS = 16;

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
  const now = Date.now();
  return {
    id: DEFAULT_PROJECT_ID,
    version: 0,
    name: 'Personal Workspace',
    description: 'A flexible space for everyday questions and ideas.',
    goal: '',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    color: DEFAULT_PROJECT_COLOR,
  };
}

function normalizeLocalProject(project) {
  if (!project || typeof project !== 'object' || !project.id) return null;
  return {
    ...project,
    version: Number.isInteger(project.version) && project.version >= 0 ? project.version : 0,
    name: String(project.name || 'Untitled Project').trim().slice(0, PROJECT_LIMITS.name) || 'Untitled Project',
    description: String(project.description || '').trim().slice(0, PROJECT_LIMITS.description),
    goal: String(project.goal || '').trim().slice(0, PROJECT_LIMITS.goal),
    status: ['active', 'paused', 'completed', 'archived'].includes(project.status) ? project.status : 'active',
    color: project.color || null,
  };
}

function dedupeStrings(values, limit = MAX_PROJECT_CONTEXT_FACTS) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    if (typeof value !== 'string') continue;
    const clean = value.trim().slice(0, 500);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= limit) break;
  }
  return result;
}

function loadProjects() {
  try {
    const saved = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = parsed.flatMap((project) => normalizeLocalProject(project) || []);
        if (normalized.length > 0) return normalized;
      }
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
        return parsed.map((session) => ({
          ...session,
          projectId: session.projectId || DEFAULT_PROJECT_ID,
          studioDomain: normalizeStudioDomain(session.studioDomain),
        }));
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
    studioMode: 'ask',
    studioDomain: null,
  }];
}

function persistSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error(e);
  }
}

function makeSession(projectId, defaultGreetingMsg, studioDomain = null) {
  const normalizedDomain = normalizeStudioDomain(studioDomain);
  const policy = studioDomainPolicy(normalizedDomain);
  const firstMessage = normalizedDomain
    ? {
        ...defaultGreetingMsg,
        text: policy.hero,
        type: 'advisor-greeting',
      }
    : defaultGreetingMsg;

  return {
    id: 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    title: 'New Chat',
    createdAt: Date.now(),
    projectId,
    messages: [firstMessage],
    studioMode: 'ask',
    studioDomain: normalizedDomain,
    boundRepo: null,
    conversationContext: {},
    memoryConsented: false,
    outcomeVersion: 0,
    dismissedCapabilityIds: [],
  };
}

function createProjectId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `project-${crypto.randomUUID()}`;
  }
  return 'project-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function timeValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function sortProjects(projects) {
  return [...projects].sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt));
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
  const [remoteProjectContext, setRemoteProjectContext] = useState(null);
  const accountKey = user?.sub || user?.email || null;

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
  const studioDomain = normalizeStudioDomain(activeSession.studioDomain);
  const boundRepo = activeSession.boundRepo || null;
  const conversationContext = activeSession.conversationContext || {};
  const listeningSignals = activeSession.listeningSignals || [];
  const projectArtifacts = useMemo(() => projectSessions.flatMap((session) => (
    (session.messages || []).filter((message) => message.officeAttachment || message.codeSnippet || message.previewUrl).map((message) => {
      const office = message.officeAttachment;
      const ref = office?.fingerprint
        || office?.downloadUrl
        || message.previewUrl
        || `message:${session.id}:${String(message.id)}`;
      return {
        id: message.id,
        sessionId: session.id,
        ref,
        title: office?.fileName || message.title || 'Generated artifact',
        type: office ? 'office' : 'workspace',
        kind: office?.kind ? `office-${office.kind}` : (office ? 'office' : 'workspace'),
        createdAt: message.createdAt || session.createdAt,
        metadata: {
          sessionId: session.id,
          messageId: String(message.id),
          ...(office?.kind ? { officeKind: office.kind } : {}),
          ...(office?.fingerprint ? { fingerprint: office.fingerprint } : {}),
          ...(office?.verifiedAt ? { verifiedAt: office.verifiedAt } : {}),
        },
      };
    })
  )), [projectSessions]);

  const projectSessionSyncKey = useMemo(
    () => projectSessions.map((session) => `${session.id}:${session.outcomeVersion || 0}`).sort().join('|'),
    [projectSessions],
  );
  const projectArtifactSyncKey = useMemo(
    () => projectArtifacts.map((artifact) => `${artifact.kind}:${artifact.ref}:${artifact.title}`).sort().join('|'),
    [projectArtifacts],
  );

  const projectOutcome = useMemo(() => {
    const remote = remoteProjectContext && remoteProjectContext.projectId === activeProject.id
      ? remoteProjectContext
      : null;
    const localArtifacts = projectArtifacts.map((artifact) => ({
      type: artifact.kind,
      ref: artifact.ref,
      title: artifact.title,
      verifiedAt: artifact.metadata?.verifiedAt || null,
    }));
    const artifactSeen = new Set();
    const artifacts = [...(remote?.artifacts || []), ...localArtifacts].filter((artifact) => {
      const key = `${artifact.type || ''}\u0000${artifact.ref || ''}`.toLowerCase();
      if (!artifact.type || !artifact.ref || artifactSeen.has(key)) return false;
      artifactSeen.add(key);
      return true;
    }).slice(0, 40);
    const facts = dedupeStrings([
      ...(remote?.facts || []),
      ...projectArtifacts.map((artifact) => `Artifact: ${artifact.title}`),
    ]);

    return {
      projectId: activeProject.id,
      projectName: activeProject.name,
      goal: activeProject.goal || remote?.goal || '',
      understanding: activeProject.description || remote?.understanding || '',
      facts,
      decisions: remote?.decisions || [],
      constraints: remote?.constraints || [],
      assumptions: remote?.assumptions || [],
      openQuestions: remote?.openQuestions || [],
      nextActions: remote?.nextActions || [],
      artifacts,
      sessionCount: remote?.sessionCount ?? projectSessions.length,
      updatedAt: remote?.updatedAt || activeProject.updatedAt || null,
    };
  }, [activeProject, projectArtifacts, projectSessions.length, remoteProjectContext]);

  const projectContext = useMemo(() => ({
    projectId: projectOutcome.projectId,
    projectName: projectOutcome.projectName,
    goal: projectOutcome.goal,
    understanding: projectOutcome.understanding,
    facts: projectOutcome.facts,
  }), [projectOutcome]);

  useEffect(() => {
    if (!accountKey) return undefined;
    let cancelled = false;

    const reconcile = async () => {
      try {
        const response = await loadRemoteProjects();
        if (cancelled) return;
        const remoteProjects = Array.isArray(response.projects)
          ? response.projects.flatMap((project) => normalizeLocalProject(project) || [])
          : [];
        const localProjects = loadProjects();
        const remoteById = new Map(remoteProjects.map((project) => [project.id, project]));
        const reconciled = [];

        for (const localProject of localProjects) {
          const remote = remoteById.get(localProject.id);
          if (!remote) {
            try {
              const saved = await saveRemoteProject({ project: localProject, expectedVersion: 0 });
              reconciled.push(normalizeLocalProject(saved.project) || localProject);
            } catch {
              reconciled.push(localProject);
            }
            continue;
          }

          remoteById.delete(localProject.id);
          if (timeValue(localProject.updatedAt) > timeValue(remote.updatedAt) + 1000) {
            try {
              const saved = await saveRemoteProject({ project: localProject, expectedVersion: remote.version || 0 });
              reconciled.push(normalizeLocalProject(saved.project) || remote);
            } catch {
              reconciled.push(remote);
            }
          } else {
            reconciled.push(remote);
          }
        }

        reconciled.push(...remoteById.values());
        if (!cancelled && reconciled.length > 0) {
          const next = sortProjects(reconciled);
          setProjects(next);
          persistProjects(next);
          if (!next.some((project) => project.id === activeProjectId)) {
            setActiveProjectIdState(next[0].id);
          }
        }
      } catch {
        // Local Projects remain authoritative while remote sync is unavailable.
      }
    };

    void reconcile();
    return () => { cancelled = true; };
  }, [accountKey]);

  const persistProjectRemote = useCallback((project, expectedVersion) => {
    if (!accountKey) return;
    const localUpdatedAt = project.updatedAt;
    void saveRemoteProject({ project, expectedVersion }).then((response) => {
      const saved = normalizeLocalProject(response.project);
      if (!saved) return;
      setProjects((prev) => {
        const updated = prev.map((current) => (
          current.id === saved.id && current.updatedAt === localUpdatedAt ? saved : current
        ));
        persistProjects(updated);
        return updated;
      });
    }).catch(() => {
      // Never roll back a successful local edit because remote persistence is down.
    });
  }, [accountKey]);

  useEffect(() => {
    if (!accountKey || !activeProject?.id || (activeProject.version || 0) < 1) {
      setRemoteProjectContext(null);
      return undefined;
    }
    let cancelled = false;

    const syncProjectGraph = async () => {
      try {
        const sessionIds = projectSessions.map((session) => session.id);
        const resources = projectArtifacts.map((artifact) => ({
          kind: artifact.kind,
          ref: artifact.ref,
          title: artifact.title,
          metadata: artifact.metadata,
        }));

        const tasks = [syncRemoteProjectSessions(activeProject.id, sessionIds)];
        if (resources.length > 0) tasks.push(syncRemoteProjectResources(activeProject.id, resources));
        await Promise.all(tasks);

        const response = await loadRemoteProjectContext(activeProject.id);
        if (!cancelled && response?.context?.projectId === activeProject.id) {
          setRemoteProjectContext(response.context);
        }
      } catch {
        // Preserve the local context and last known remote graph on any outage.
      }
    };

    void syncProjectGraph();
    return () => { cancelled = true; };
  }, [
    accountKey,
    activeProject.id,
    activeProject.version,
    projectSessionSyncKey,
    projectArtifactSyncKey,
  ]);

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
  const setStudioDomain = useCallback((domain) => updateActiveSession({ studioDomain: normalizeStudioDomain(domain) }), [updateActiveSession]);

  const recordListeningSignal = useCallback((type, payload) => {
    setAllChatSessions((prev) => {
      const updated = prev.map((session) => session.id === activeSessionId ? mergeSessionListeningSignals(session, type, payload) : session);
      persistSessions(updated);
      return updated;
    });
  }, [activeSessionId]);

  const handleCreateNewChat = useCallback(() => {
    const newSession = makeSession(activeProject.id, defaultGreetingMsg, null);
    setAllChatSessions((prev) => {
      const updated = [newSession, ...prev];
      persistSessions(updated);
      return updated;
    });
    setActiveSessionId(newSession.id);
  }, [activeProject.id, defaultGreetingMsg]);

  const handleCreateAdvisorChat = useCallback((domain) => {
    const normalizedDomain = normalizeStudioDomain(domain);
    if (!normalizedDomain) return null;
    const newSession = makeSession(activeProject.id, defaultGreetingMsg, normalizedDomain);
    setAllChatSessions((prev) => {
      const updated = [newSession, ...prev];
      persistSessions(updated);
      return updated;
    });
    setActiveSessionId(newSession.id);
    return newSession.id;
  }, [activeProject.id, defaultGreetingMsg]);

  const forkChatFromMessage = useCallback((messageId) => {
    let forkedSessionId = null;
    setAllChatSessions((prev) => {
      const source = prev.find((session) => session.id === activeSessionId);
      if (!source) return prev;
      const index = (source.messages || []).findIndex((message) => String(message.id) === String(messageId));
      if (index < 0) return prev;

      const now = Date.now();
      const fork = {
        ...source,
        id: `session-${now}-${Math.random().toString(36).slice(2, 7)}`,
        title: `${String(source.title || 'Forked Chat').replace(/\s*\(fork\)$/i, '')} (fork)`.slice(0, 80),
        createdAt: now,
        updatedAt: now,
        messages: (source.messages || []).slice(0, index + 1).map((message) => ({ ...message })),
        parentSessionId: source.id,
        forkedFromMessageId: messageId,
        forkedAt: now,
      };
      forkedSessionId = fork.id;
      const updated = [fork, ...prev];
      persistSessions(updated);
      return updated;
    });
    if (forkedSessionId) setActiveSessionId(forkedSessionId);
    return forkedSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    publishStudioDomainState(studioDomain);
  }, [activeSessionId, studioDomain]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onDomainRequest = (event) => {
      const domain = normalizeStudioDomain(event?.detail?.domain);
      if (event?.detail?.createNew === true) {
        if (domain) handleCreateAdvisorChat(domain);
        else handleCreateNewChat();
        return;
      }
      setStudioDomain(domain);
    };
    window.addEventListener(STUDIO_DOMAIN_REQUEST_EVENT, onDomainRequest);
    return () => window.removeEventListener(STUDIO_DOMAIN_REQUEST_EVENT, onDomainRequest);
  }, [handleCreateAdvisorChat, handleCreateNewChat, setStudioDomain]);

  const setActiveProjectId = useCallback((projectId) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    setRemoteProjectContext(null);
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
    const now = Date.now();
    const name = String(input.name || '').trim() || 'Untitled Project';
    const project = {
      id: createProjectId(),
      version: 0,
      name: name.slice(0, PROJECT_LIMITS.name),
      description: String(input.description || '').trim().slice(0, PROJECT_LIMITS.description),
      goal: String(input.goal || '').trim().slice(0, PROJECT_LIMITS.goal),
      status: 'active',
      createdAt: now,
      updatedAt: now,
      color: input.color || NEW_PROJECT_COLOR,
    };
    setProjects((prev) => {
      const updated = [project, ...prev];
      persistProjects(updated);
      return updated;
    });
    persistProjectRemote(project, 0);

    const newSession = makeSession(project.id, defaultGreetingMsg);
    setAllChatSessions((prev) => {
      const updated = [newSession, ...prev];
      persistSessions(updated);
      return updated;
    });
    setRemoteProjectContext(null);
    setActiveProjectIdState(project.id);
    setActiveSessionId(newSession.id);
    return project;
  }, [defaultGreetingMsg, persistProjectRemote]);

  const updateActiveProject = useCallback((updates) => {
    const nextProject = normalizeLocalProject({ ...activeProject, ...updates, updatedAt: Date.now() });
    if (!nextProject) return;
    setProjects((prev) => {
      const updated = prev.map((project) => project.id === activeProject.id ? nextProject : project);
      persistProjects(updated);
      return updated;
    });
    persistProjectRemote(nextProject, activeProject.version || 0);
  }, [activeProject, persistProjectRemote]);

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
    handleCreateAdvisorChat,
    forkChatFromMessage,
    handleDeleteChat,
    projects,
    activeProjectId: activeProject.id,
    activeProject,
    setActiveProjectId,
    handleCreateProject,
    updateActiveProject,
    projectContext,
    projectOutcome,
    projectArtifacts,
  };
}
