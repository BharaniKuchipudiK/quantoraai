import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { mergeSessionListeningSignals } from '../lib/listening-layer.js';
import {
  STUDIO_DOMAIN_REQUEST_EVENT,
  normalizeStudioDomain,
  publishStudioDomainState,
} from '../lib/studio-shell-events.js';
import {
  loadRemoteProjectContext,
  loadRemoteProjects,
  saveRemoteProject,
  syncRemoteProjectResources,
  syncRemoteProjectSessions,
} from '../lib/project-store.js';
import { compactOfficeMessages } from '../lib/office-session-state.js';
import { compactSupersededBuilds } from '../lib/session-code-budget.js';
import { newThreadLabel, resolveAdvisorSidebarClick } from '../lib/advisor-thread.js';
import { describeSessionHandover,
  handoverHeadline,
} from '../lib/session-continuity.js';
import { CANNED_PROJECT_DESCRIPTION, deriveProjectResume, pickResumeSessionId, isCannedProjectDescription } from '../lib/studio-mission.js';

import {
  renameChat as renameChatSession,
  setChatArchived as setChatArchivedInList,
  toggleChatPinned as toggleChatPinnedInList,
} from '../lib/chat-organization.js';

const STORAGE_KEY = 'quantora_chat_sessions';
const PROJECTS_STORAGE_KEY = 'quantora_projects_v1';
/*
 * Stable fallbacks. `|| {}` mints a fresh object every render, and these
 * values sit in downstream memo dependency arrays (AiStudio's chat feed) —
 * a new identity per render silently voids those memos.
 */
const EMPTY_CONVERSATION_CONTEXT = Object.freeze({});
const EMPTY_LISTENING_SIGNALS = Object.freeze([]);
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
    description: CANNED_PROJECT_DESCRIPTION,
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

const CORRUPT_BACKUP_KEY = `${STORAGE_KEY}_corrupt`;

/**
 * Storage faults were console-only, so losing your chats looked identical to
 * nothing happening. This holds the last fault so the UI can say so plainly.
 * `kind`: 'corrupt' | 'quota' | 'write' | 'evicted' (evicted = recovered by
 * dropping regenerable desk snapshots, history intact).
 */
let storageFault = null;
const storageFaultListeners = new Set();

export function readStudioStorageFault() {
  return storageFault;
}

/** Subscribe so the fault reaches React state; a module variable alone is invisible. */
export function subscribeStudioStorageFault(listener) {
  if (typeof listener !== 'function') return () => {};
  storageFaultListeners.add(listener);
  return () => storageFaultListeners.delete(listener);
}

function publishStorageFault() {
  for (const listener of storageFaultListeners) {
    try { listener(storageFault); } catch { /* a bad listener must not break persistence */ }
  }
}

function noteStorageFault(kind, error, extra = {}) {
  storageFault = { kind, at: Date.now(), message: String(error?.message || error || ''), ...extra };
  if (kind !== 'evicted') console.error('Studio session storage fault:', kind, error);
  publishStorageFault();
  return storageFault;
}

function clearStorageFault() {
  if (!storageFault) return;
  /*
   * A 'corrupt' notice reports something that already happened and points at the
   * backup key. The very next message writes successfully, so clearing on
   * success would erase it a second later — before the user could read it. Only
   * live degradations ('quota', 'write', 'evicted') are cleared by a good write.
   */
  if (storageFault.kind === 'corrupt') return;
  storageFault = null;
  publishStorageFault();
}

/** DOMException name/code varies by browser; match the ones that mean "full". */
function isQuotaError(error) {
  const name = String(error?.name || '');
  return name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || Number(error?.code) === 22
    || Number(error?.code) === 1014;
}

/** Copy an unparseable blob aside before anything overwrites it. */
function preserveCorruptSessionBlob() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
  } catch { /* storage unavailable — nothing further to protect */ }
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
          inferredDomain: normalizeStudioDomain(session.inferredDomain),
        }));
      }
    }
  } catch (e) {
    /*
     * A corrupt blob used to be swallowed here and replaced with a single empty
     * "New Chat" — and the next persistSessions then overwrote the only copy of
     * the salvageable bytes. Keep the raw string under a backup key first so the
     * history is recoverable, and record the fault so it is not silent.
     */
    preserveCorruptSessionBlob();
    noteStorageFault('corrupt', e);
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

/**
 * Chat history is irreplaceable; a desk snapshot is a regenerable build artifact
 * that can reach MAX_STUDIO_DESK_CHARS (800k chars, ~1.6MB UTF-16) per session.
 * Three or four coding sessions therefore exhausted the ~5MB origin budget, and
 * because the quota error was swallowed, EVERY later save silently no-opped —
 * the user refreshed and found their chats reverted or gone.
 *
 * So on a quota failure, shed desk snapshots oldest-first and retry rather than
 * giving up: the builds can be rebuilt, the conversation cannot. Only when even
 * a desk-free write fails is the fault recorded for the UI to surface.
 */
function persistSessions(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  /*
   * Fold superseded builds before writing, not after the quota throws.
   *
   * Measured on a 5-turn storefront session (a 970-line index.html): 774 KB
   * stored, of which 645 KB was the same page repeated in chat history and
   * only 129 KB was the desk snapshot. Six such sessions exhausted the origin,
   * and the eviction below then dropped a build the user still wanted.
   *
   * The newest build keeps its code verbatim — Preview replays it and it
   * matches the desk. Older copies leave a marker naming the file and its
   * size, because a transcript that silently loses a code block is the same
   * defect as a proof gate that silently claimed a pass. Same fixture after
   * folding: 43 sessions fit instead of 6.
   */
  const compact = list.map((session) => ({
    ...session,
    messages: compactSupersededBuilds(compactOfficeMessages(session.messages || [])).messages,
  }));

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
    clearStorageFault();
    return true;
  } catch (e) {
    if (!isQuotaError(e)) {
      noteStorageFault('write', e);
      return false;
    }

    // Oldest first: the desk you are working in now is the last to be shed.
    const order = compact
      .map((session, index) => ({ index, createdAt: Number(session?.createdAt) || 0 }))
      .sort((left, right) => left.createdAt - right.createdAt || left.index - right.index);

    const trimmed = compact.map((session) => ({ ...session }));
    let shed = 0;
    for (const { index } of order) {
      // `desk: null` is an empty desk, not a snapshot: deleting it frees nothing,
      // inflates the reported count, and wastes a retry.
      if (!trimmed[index]?.desk) continue;
      delete trimmed[index].desk;
      shed += 1;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        noteStorageFault('evicted', null, { deskSnapshotsDropped: shed });
        return true;
      } catch (retryError) {
        if (!isQuotaError(retryError)) {
          noteStorageFault('write', retryError);
          return false;
        }
      }
    }

    noteStorageFault('quota', e, { deskSnapshotsDropped: shed });
    return false;
  }
}

export function applyMoveChatToProject({
  sessions = [],
  sessionId,
  nextProjectId,
  sourceProjectId,
  activeSessionId,
  defaultGreeting,
} = {}) {
  if (!sessionId || !nextProjectId) {
    return { sessions, activeSessionId, changed: false };
  }
  const target = sessions.find((session) => session.id === sessionId);
  if (!target) return { sessions, activeSessionId, changed: false };
  const leftProjectId = target.projectId || sourceProjectId || DEFAULT_PROJECT_ID;
  if (leftProjectId === nextProjectId) {
    return { sessions, activeSessionId, changed: false };
  }

  let nextSessions = sessions.map((session) => (
    session.id === sessionId
      ? { ...session, projectId: nextProjectId, updatedAt: Date.now() }
      : session
  ));
  let nextActiveSessionId = activeSessionId;
  const remainingInSource = nextSessions.filter(
    (session) => (session.projectId || DEFAULT_PROJECT_ID) === leftProjectId,
  );

  if (remainingInSource.length === 0) {
    const empty = makeSession(leftProjectId, defaultGreeting);
    nextSessions = [empty, ...nextSessions];
    if (activeSessionId === sessionId) nextActiveSessionId = empty.id;
  } else if (activeSessionId === sessionId) {
    nextActiveSessionId = remainingInSource[0].id;
  }

  return { sessions: nextSessions, activeSessionId: nextActiveSessionId, changed: true };
}

/**
 * A chat's workspace: the Coding desk is the null domain, so it needs a name
 * of its own for grouping and for the "+" beside it in the sidebar.
 */
/**
 * THE CODING DESK IS NOT A DEFAULT (2026-09-07).
 *
 * Reported: "When you click on a New chat, it goes straight to Coding Desk...
 * When I click on New Chat it should not associate with a workspace. It is
 * just talking to some AI Model. Nothing else."
 *
 * The Coding desk is represented as the null domain, and this function read
 * `|| 'coding'`, so EVERY chat that belonged to no workspace was filed under
 * the Coding desk. A plain chat is not coding work; it has no workspace at
 * all, and the sidebar must be able to say so.
 *
 * The distinction already existed and was being thrown away here: a chat
 * opened from the Coding desk's "+" is `deskPinned` (see makeSession), a
 * top-level New Chat is not. Returning null for the unpinned case is what
 * makes "no workspace" a state the nav can render, rather than a synonym for
 * coding.
 *
 * Unfiled stays unfiled. A general chat that later builds something is NOT
 * moved here — membership changes only by an explicit action, which is the
 * rule `turnDomainSessionPatch` already holds for the advisor desks.
 */
export function workspaceOfSession(session) {
  const domain = normalizeStudioDomain(session?.studioDomain);
  if (domain) return domain;
  return session?.deskPinned === true ? 'coding' : null;
}

/** The chats of one workspace in one project, newest first. */
export function chatsForWorkspace(sessions, workspace, projectId) {
  const wanted = workspace === 'coding' ? 'coding' : normalizeStudioDomain(workspace);
  if (!wanted) return [];
  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session && !session.archived
      && (session.projectId || DEFAULT_PROJECT_ID) === (projectId || DEFAULT_PROJECT_ID)
      && workspaceOfSession(session) === wanted)
    .sort((left, right) => (Number(right.updatedAt || right.createdAt) || 0) - (Number(left.updatedAt || left.createdAt) || 0));
}

/**
 * WORKSPACES OWN THEIR CHATS (2026-09-06).
 *
 * `deskPinned` says the workspace decided this chat's desk, not the words in
 * it. A chat opened from a workspace (the "+" beside it, an advisor card) is
 * pinned and never moves. Before this, a coding chat with no build yet could
 * be moved to Travel by one trip word, because the Coding desk is the null
 * domain and "explicit wins" never protected it.
 *
 * The top-level New Chat is NOT pinned, and that no longer means it can be
 * moved: since 2026-09-06 inference writes `inferredDomain` (routing memory)
 * rather than `studioDomain` (membership), so an unpinned chat still finds
 * the desk that answers it best and still never leaves the list it was
 * started in. Unpinned now means "no workspace has claimed this chat yet",
 * which is the state a general chat is supposed to be in.
 */
/**
 * The desk the studio CHROME shows for a session: membership only.
 *
 * Extracted so the rule is something a test can adjudicate rather than
 * something review has to notice. A source grep would only prove how the line
 * is written; this proves what it returns.
 */
export function chromeDomainForSession(session) {
  return normalizeStudioDomain(session?.studioDomain);
}

export function makeSession(projectId, defaultGreetingMsg, studioDomain = null, { pinned = false } = {}) {
  const domain = normalizeStudioDomain(studioDomain);
  return {
    id: 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    title: newThreadLabel(domain),
    createdAt: Date.now(),
    projectId,
    messages: [defaultGreetingMsg],
    studioMode: 'ask',
    studioDomain: domain,
    /*
     * Membership, not routing. `studioDomain` is what the sidebar groups by,
     * so only a person may set it; `inferredDomain` is where the turn router
     * remembers the desk this thread has been answering as. See
     * `turnDomainSessionPatch` in shared/studio/domain-inference.ts.
     */
    inferredDomain: null,
    deskPinned: pinned === true,
    boundRepo: null,
    conversationContext: {},
    memoryConsented: false,
    outcomeVersion: 0,
    dismissedCapabilityIds: [],
  };
}

/**
 * Create a reversible child session from bounded continuity state.
 *
 * THE DESK TRAVELS. The transcript is what got too big — the build never did.
 *
 * Without this the chip was a one-click way to lose your work: a handover
 * session had no `desk`, so restoreStudioDeskSnapshot returned null and the
 * Coding Desk opened empty. The chip is domain-agnostic and fires hardest in
 * Coding, where every turn carries a full HTML document and the byte budget
 * goes first — so it appeared most often exactly where abandoning the build
 * cost the most, labelled only "New chat · <goal>".
 *
 * That is the trap the history-budget notice was written to warn about:
 * "the only escape — start a new chat and lose the work — is the one thing
 * nobody is told." Carrying the snapshot means there is nothing to warn about.
 * The old session keeps its own copy either way; nothing is moved, only copied.
 */
/** The first message of a continued chat: where it came from and what came with it. */
export function handoverNoteMessage({ contract, sourceSession = null, desk = null } = {}) {
  const fromTitle = String(sourceSession?.title || '').trim();
  const head = handoverHeadline(contract);
  const fileCount = desk?.vfs && typeof desk.vfs === 'object' ? Object.keys(desk.vfs).length : 0;

  /*
   * TWO LINES, NOT A RECEIPT.
   *
   * This used to print every carried line — nineteen bullets on 2026-09-08,
   * several of them the same fact restated, opening a new chat with a wall of
   * paperwork instead of the work. Nothing is lost by shortening it: the model
   * never reads this text, it reads contract.summary, which stays whole. This
   * is the human's version.
   */
  const parts = [];
  if (head.goal) parts.push(`Picking up: ${head.goal}`);
  if (head.understanding) parts.push(head.understanding);
  /* The couple of details worth seeing. Computed and then NOT rendered in the
   * first cut of this change, which dropped them from the screen while the
   * count below still called them shown. */
  if (head.shown.length) parts.push(head.shown.map((line) => `- ${line}`).join('\n'));
  if (fileCount) parts.push(`Your desk came with it — ${fileCount} file${fileCount === 1 ? '' : 's'}, and Preview runs the same build.`);
  else parts.push('No files were on that desk.');
  /* Said, not shown: the person can see nothing was dropped without reading
   * it all back. */
  if (head.hidden > 0) parts.push(`${head.hidden} more detail${head.hidden === 1 ? '' : 's'} carried over quietly — just ask if you want them listed.`);

  return {
    id: `handover-note-${contract?.createdAt || Date.now()}`,
    sender: 'ai',
    handoverNote: true,
    /* The fact a gate should assert, separate from the words that state it. */
    handoverDeskFiles: fileCount,
    text: `Continued from ${fromTitle ? `"${fromTitle}"` : 'the previous chat'}, which stays exactly as it was.\n\n${parts.join('\n\n')}`,
  };
}

export function makeHandoverSession({ contract, projectId, defaultGreetingMsg, sourceSession = null } = {}) {
  if (contract?.kind !== 'session_handover' || !contract?.sourceSessionId || !projectId) return null;
  const domain = normalizeStudioDomain(contract.studioDomain);
  const session = makeSession(projectId, defaultGreetingMsg, domain, {
    // A chat continued from a pinned one stays on that desk.
    pinned: sourceSession?.id === String(contract.sourceSessionId) && sourceSession?.deskPinned === true,
  });
  const goal = String(contract?.summary?.goal || '').trim();
  const desk = sourceSession && sourceSession.id === String(contract.sourceSessionId)
    ? sourceSession.desk
    : null;
  return {
    ...session,
    ...(goal ? { title: goal.slice(0, 80) } : {}),
    ...(desk ? { desk } : {}),
    // The new chat opens by saying what it carries. The old preview panel
    // showed this BEFORE the click, where it was one more thing to dismiss;
    // in the chat itself it is the context the person asked to keep.
    messages: [defaultGreetingMsg, handoverNoteMessage({ contract, sourceSession, desk })],
    conversationContext: contract.context || {},
    parentSessionId: String(contract.sourceSessionId),
    handover: {
      version: contract.version,
      id: contract.id,
      sourceSessionId: String(contract.sourceSessionId),
      createdAt: contract.createdAt,
      summary: contract.summary || {},
      deskCarried: Boolean(desk),
    },
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
  const allChatSessionsRef = useRef(allChatSessions);
  allChatSessionsRef.current = allChatSessions;
  const [storageFault, setStorageFault] = useState(() => readStudioStorageFault());
  useEffect(() => subscribeStudioStorageFault(setStorageFault), []);
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
  /*
   * THE CHROME FOLLOWS MEMBERSHIP, NOT INFERENCE (2026-09-07).
   *
   * This read `studioDomain || inferredDomain`, and its previous comment said
   * so deliberately: "a general chat asking about taxes still opens the
   * Finance Advisor for the turn". In use that is what people report as the
   * platform moving under them — "a New chat with no workspace suddenly moves
   * to Finance Advisor". The chat had not moved; only its chrome had, and from
   * the outside those are the same thing.
   *
   * 2026-09-06 split MEMBERSHIP (`studioDomain`, only a person sets it) from
   * ROUTING MEMORY (`inferredDomain`, what answers the turn) and stopped the
   * sidebar moving. This is the step it stopped short of: the chrome is part
   * of where a person thinks they are, so it belongs to membership too.
   *
   * ROUTING IS UNTOUCHED, and that separation is the whole point.
   * `resolveTurnStudioDomain` still returns the inferred desk and the request
   * still carries it, so a tax question in a general chat is still answered by
   * the finance desk with its tools. What stops is the studio re-skinning
   * itself around an inference nobody asked for. The sticky browser gate holds
   * both halves together so they cannot drift apart in silence.
   */
  const effectiveStudioDomain = chromeDomainForSession(activeSession);
  const boundRepo = activeSession.boundRepo || null;
  const conversationContext = activeSession.conversationContext || EMPTY_CONVERSATION_CONTEXT;
  const listeningSignals = activeSession.listeningSignals || EMPTY_LISTENING_SIGNALS;
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
      understanding: isCannedProjectDescription(activeProject.description)
        ? (isCannedProjectDescription(remote?.understanding) ? '' : (remote?.understanding || ''))
        : (activeProject.description || remote?.understanding || ''),
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

  const projectResume = useMemo(
    () => deriveProjectResume(projectSessions),
    [projectSessions],
  );

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
              // The save did not land (or its outcome is unknown). This list
              // is persisted back locally, so choosing remote would discard
              // the newer edits the caller was trying to save.
              reconciled.push(localProject);
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
        if (firstUserMsg && (session.title === 'New Chat' || session.title === 'New trip' || session.title === 'New topic' || session.title === 'Welcome to Quantora')) {
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

  const handleCreateAdvisorChat = useCallback((domain) => {
    const normalizedDomain = normalizeStudioDomain(domain);
    if (!normalizedDomain) return null;
    const newSession = makeSession(activeProject.id, defaultGreetingMsg, normalizedDomain, { pinned: true });
    setAllChatSessions((prev) => {
      const updated = [newSession, ...prev];
      persistSessions(updated);
      return updated;
    });
    setActiveSessionId(newSession.id);
    return newSession.id;
  }, [activeProject.id, allChatSessions, defaultGreetingMsg]);

  /** A new chat inside one workspace: pinned there for life. 'coding' is the null domain. */
  const handleCreateWorkspaceChat = useCallback((workspace) => {
    const domain = workspace === 'coding' ? null : normalizeStudioDomain(workspace);
    if (workspace !== 'coding' && !domain) return null;
    const newSession = makeSession(activeProject.id, defaultGreetingMsg, domain, { pinned: true });
    setAllChatSessions((prev) => {
      const updated = [newSession, ...prev];
      persistSessions(updated);
      return updated;
    });
    setActiveSessionId(newSession.id);
    return newSession.id;
  }, [activeProject.id, defaultGreetingMsg]);

  const handleCreateNewChat = useCallback(() => {
    const newSession = makeSession(activeProject.id, defaultGreetingMsg, null);
    setAllChatSessions((prev) => {
      const updated = [newSession, ...prev];
      persistSessions(updated);
      return updated;
    });
    setActiveSessionId(newSession.id);
  }, [activeProject.id, defaultGreetingMsg]);

  /*
   * THE CHIP THAT DID NOTHING (2026-09-06).
   *
   * This callback listed activeProject.id and the greeting as its only
   * dependencies while reading allChatSessions, so it kept the session list
   * from the render it was created in. Every chat started after that render —
   * the one the person was actually in — was invisible to it: the source
   * lookup failed, the desk was never carried, and the new chat opened bare.
   * The list is read through a ref that every render refreshes.
   */
  const handleCreateHandoverChat = useCallback((contract) => {
    const sessions = allChatSessionsRef.current || [];
    const sourceSession = sessions.find((item) => item.id === contract?.sourceSessionId) || null;
    const newSession = makeHandoverSession({
      contract,
      // A handover may not move data across projects. The active project owns it.
      projectId: activeProject.id,
      defaultGreetingMsg,
      // The build comes with it. Looked up rather than passed in, so the caller
      // cannot hand over a desk belonging to a different session.
      sourceSession,
    });
    if (!newSession) return null;
    setAllChatSessions((prev) => {
      // The offer is taken; the chip in the source chat has done its job.
      const updated = [newSession, ...prev.map((item) => (
        item.id === sourceSession?.id
          ? {
            ...item,
            messages: (item.messages || []).map((message) => (
              message?.sessionContinuity?.id === contract?.id
                ? { ...message, sessionContinuityDismissed: true, sessionContinuityTaken: newSession.id }
                : message
            )),
          }
          : item
      ))];
      persistSessions(updated);
      return updated;
    });
    setActiveSessionId(newSession.id);
    return newSession.id;
  }, [activeProject.id, defaultGreetingMsg]);

  const openAdvisorWorkspace = useCallback((domain) => {
    const requestedDomain = normalizeStudioDomain(domain);
    if (!requestedDomain) return null;
    const decision = resolveAdvisorSidebarClick({
      currentDomain: studioDomain,
      requestedDomain,
      sessions: projectSessions,
      activeSessionId,
      projectId: activeProject.id,
    });
    if (decision.type === 'stay') return activeSessionId;
    if (decision.type === 'switch') {
      setActiveSessionId(decision.sessionId);
      return decision.sessionId;
    }
    return handleCreateAdvisorChat(requestedDomain);
  }, [activeProject.id, activeSessionId, handleCreateAdvisorChat, projectSessions, studioDomain]);

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
    publishStudioDomainState(effectiveStudioDomain);
  }, [activeSessionId, effectiveStudioDomain]);

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
    const inProject = allChatSessions.filter((session) => (session.projectId || DEFAULT_PROJECT_ID) === projectId);
    const resumeId = pickResumeSessionId(inProject);
    if (resumeId) {
      setActiveSessionId(resumeId);
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

  /*
   * Open one specific chat, switching projects if it lives in another one.
   * setActiveProjectId cannot do this: it resume-picks a session for the
   * project (and creates one if none), which is right for opening a project
   * folder and wrong for clicking a particular chat in the sidebar tree.
   */
  const openChatSession = useCallback((sessionId) => {
    const session = allChatSessions.find((item) => item.id === sessionId);
    if (!session) return;
    const projectId = session.projectId || DEFAULT_PROJECT_ID;
    if (projectId !== activeProject.id && projects.some((project) => project.id === projectId)) {
      setRemoteProjectContext(null);
      setActiveProjectIdState(projectId);
    }
    setActiveSessionId(sessionId);
  }, [allChatSessions, activeProject.id, projects]);

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

  useEffect(() => {
    const goal = String(projectResume?.goal || conversationContext?.goal || '').trim();
    if (!goal || String(activeProject.goal || '').trim()) return;
    const description = String(activeProject.description || '').trim()
      ? activeProject.description
      : String(projectResume?.understanding || '').trim();
    updateActiveProject({
      goal: goal.slice(0, PROJECT_LIMITS.goal),
      ...(description ? { description: description.slice(0, PROJECT_LIMITS.description) } : {}),
    });
  }, [
    activeProject.description,
    activeProject.goal,
    conversationContext?.goal,
    projectResume,
    updateActiveProject,
  ]);

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

  const handleMoveChatToProject = useCallback((event, sessionId, nextProjectId) => {
    event?.stopPropagation?.();
    if (!nextProjectId || !projects.some((project) => project.id === nextProjectId)) return;
    setAllChatSessions((prev) => {
      const result = applyMoveChatToProject({
        sessions: prev,
        sessionId,
        nextProjectId,
        sourceProjectId: activeProject.id,
        activeSessionId,
        defaultGreeting: defaultGreetingMsg,
      });
      if (!result.changed) return prev;
      if (result.activeSessionId && result.activeSessionId !== activeSessionId) {
        setActiveSessionId(result.activeSessionId);
      }
      persistSessions(result.sessions);
      return result.sessions;
    });
  }, [activeProject.id, activeSessionId, defaultGreetingMsg, projects]);

  /*
   * Rename, pin, archive. Each commits through the same shape: the pure module
   * decides, this decides whether anything is worth persisting.
   *
   * `changed: false` returns the previous array by identity on purpose — a
   * no-op rename must not write storage or re-render every chat row.
   */
  const handleRenameChat = useCallback((sessionId, title) => {
    setAllChatSessions((prev) => {
      const result = renameChatSession({ sessions: prev, sessionId, title });
      if (!result.changed) return prev;
      persistSessions(result.sessions);
      return result.sessions;
    });
  }, []);

  const handleToggleChatPinned = useCallback((sessionId) => {
    setAllChatSessions((prev) => {
      const result = toggleChatPinnedInList({ sessions: prev, sessionId });
      if (!result.changed) return prev;
      persistSessions(result.sessions);
      return result.sessions;
    });
  }, []);

  /*
   * Archive is a soft delete, so it owes what delete owes: never leave the
   * reader on a chat the nav no longer lists, and never leave a project with
   * nothing open. setChatArchived works out which of those applies; the
   * replacement session is built here because only this scope can.
   */
  const handleSetChatArchived = useCallback((sessionId, archived) => {
    setAllChatSessions((prev) => {
      const result = setChatArchivedInList({
        sessions: prev,
        sessionId,
        archived,
        activeSessionId,
        projectId: activeProject.id,
      });
      if (!result.changed) return prev;
      let next = result.sessions;
      if (result.needsNewChat) {
        const replacement = makeSession(activeProject.id, defaultGreetingMsg);
        next = [replacement, ...next];
        setActiveSessionId(replacement.id);
      } else if (result.nextActiveSessionId) {
        setActiveSessionId(result.nextActiveSessionId);
      }
      persistSessions(next);
      return next;
    });
  }, [activeProject.id, activeSessionId, defaultGreetingMsg]);

  return {
    /*
     * Surfaced so the UI can say that saving degraded. 'evicted' means the quota
     * recovery dropped regenerable desk snapshots to keep the conversation - the
     * builds are gone from storage and will not survive a refresh, so the user
     * has to be told rather than discovering it later.
     */
    storageFault,
    chatSessions,
    // Every chat across every project, for the sidebar's project tree —
    // chatSessions above stays scoped to the active project.
    allChatSessions,
    openChatSession,
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
    handleCreateHandoverChat,
    handleCreateAdvisorChat,
    handleCreateWorkspaceChat,
    openAdvisorWorkspace,
    forkChatFromMessage,
    handleDeleteChat,
    handleMoveChatToProject,
    handleRenameChat,
    handleToggleChatPinned,
    handleSetChatArchived,
    projects,
    activeProjectId: activeProject.id,
    activeProject,
    setActiveProjectId,
    handleCreateProject,
    updateActiveProject,
    projectContext,
    projectOutcome,
    projectArtifacts,
    projectResume,
  };
}

/** Test-only handle on the storage internals; not part of the hook's API. */
export const __testables = { persistSessions, loadSessions };
