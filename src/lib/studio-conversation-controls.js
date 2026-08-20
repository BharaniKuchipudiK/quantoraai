const CHAT_SESSIONS_KEY = 'quantora_chat_sessions';
const PROJECTS_KEY = 'quantora_projects_v1';

let scheduled = false;
let observer = null;

function textOf(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function nativeArenaButton() {
  return document.querySelector('.app-shell--studio button[title="Compare two AI models side-by-side in real time"]');
}

function nativeTopBar() {
  const arena = nativeArenaButton();
  return arena?.parentElement?.parentElement || null;
}

function resetButton(topBar) {
  return [...(topBar?.querySelectorAll('button') || [])]
    .find((button) => /^Reset Chat$/i.test(textOf(button))) || null;
}

function profileInitial() {
  return (document.querySelector('[data-quantora-profile-name]')?.textContent?.trim()?.charAt(0) || 'P').toUpperCase();
}

function ensureProfileFallback() {
  const profile = document.querySelector('[data-quantora-sidebar-profile]');
  if (!profile) return;
  const img = profile.querySelector('img');
  let fallback = profile.querySelector('[data-quantora-avatar-fallback]');

  if (!fallback) {
    fallback = document.createElement('span');
    fallback.dataset.quantoraAvatarFallback = 'true';
    Object.assign(fallback.style, {
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      background: 'linear-gradient(135deg,#f97316,#8b5cf6)',
      fontWeight: '800',
      fontSize: '.78rem',
      flexShrink: '0',
    });
    profile.insertBefore(fallback, profile.firstChild || null);
  }

  const showFallback = () => {
    if (img) img.style.display = 'none';
    fallback.textContent = profileInitial();
    fallback.style.display = 'inline-flex';
  };
  const showImage = () => {
    fallback.style.display = 'none';
    if (img) img.style.display = 'block';
  };

  if (!img) {
    showFallback();
    return;
  }
  if (!img.dataset.quantoraFallbackBound) {
    img.dataset.quantoraFallbackBound = 'true';
    img.addEventListener('error', showFallback);
    img.addEventListener('load', () => {
      if (img.naturalWidth > 0) showImage();
    });
  }
  if (img.complete && img.naturalWidth === 0) showFallback();
}

function getSessions() {
  try {
    const sessions = JSON.parse(localStorage.getItem(CHAT_SESSIONS_KEY) || '[]');
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

function activeSessionFromScreen() {
  const sessions = getSessions();
  if (!sessions.length) return null;
  const visibleText = String(document.querySelector('.app-shell--studio')?.innerText || '');
  const scored = sessions.map((session, index) => {
    const firstUser = (session.messages || []).find((message) => message?.sender === 'user' && message?.text)?.text || '';
    const lastUser = [...(session.messages || [])].reverse().find((message) => message?.sender === 'user' && message?.text)?.text || '';
    let score = Math.max(0, 20 - index);
    if (firstUser && visibleText.includes(firstUser.slice(0, Math.min(120, firstUser.length)))) score += 120;
    if (lastUser && visibleText.includes(lastUser.slice(0, Math.min(120, lastUser.length)))) score += 80;
    if (session.title && visibleText.includes(String(session.title).replace(/\.\.\.$/, '').slice(0, 28))) score += 30;
    return { session, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 40 ? scored[0].session : sessions[0];
}

function forkCurrentChat() {
  const source = activeSessionFromScreen();
  if (!source) return;
  const sessions = getSessions();
  const now = Date.now();
  const lastMessage = [...(source.messages || [])].reverse().find((message) => message?.id != null) || null;
  const id = `session-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const baseTitle = String(source.title || 'Forked Chat').replace(/\s*\(fork\)$/i, '').trim();
  const fork = {
    ...source,
    id,
    title: `${baseTitle || 'Forked Chat'} (fork)`.slice(0, 80),
    createdAt: now,
    updatedAt: now,
    messages: (source.messages || []).map((message) => ({ ...message })),
    parentSessionId: source.id || null,
    forkedFromMessageId: lastMessage?.id ?? null,
    forkedAt: now,
  };

  try {
    localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify([fork, ...sessions]));
    const projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    if (Array.isArray(projects) && source.projectId) {
      const reordered = projects
        .map((project) => project?.id === source.projectId ? { ...project, updatedAt: now } : project)
        .sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0));
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(reordered));
    }
    sessionStorage.setItem('quantora_fork_notice', 'true');
    window.location.reload();
  } catch {
    // The original conversation remains untouched if browser storage is unavailable.
  }
}

function ensureForkButton(actions, reset) {
  let fork = actions.querySelector('[data-quantora-fork-chat="true"]');
  if (fork) return fork;
  fork = document.createElement('button');
  fork.type = 'button';
  fork.dataset.quantoraForkChat = 'true';
  fork.title = 'Fork this chat and continue independently';
  fork.textContent = '⑂ Fork Chat';
  Object.assign(fork.style, {
    background: 'rgba(15,23,42,.68)',
    border: '1px solid rgba(148,163,184,.22)',
    color: '#cbd5e1',
    padding: '6px 12px',
    borderRadius: '18px',
    fontSize: '.78rem',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap',
  });
  fork.addEventListener('click', forkCurrentChat);
  if (reset) actions.insertBefore(fork, reset);
  else actions.append(fork);
  return fork;
}

function ensureNativeControls() {
  const arena = nativeArenaButton();
  const topBar = nativeTopBar();
  if (!arena || !topBar) return;

  const actions = arena.parentElement;
  const reset = resetButton(topBar);
  const summary = [...topBar.children].find((child) => child !== actions) || null;

  topBar.dataset.quantoraNativeConversationBar = 'true';
  arena.dataset.quantoraNativeArena = 'true';
  if (summary) summary.dataset.quantoraNativeConversationSummary = 'true';
  if (reset) reset.dataset.quantoraResetChat = 'true';
  actions.dataset.quantoraNativeConversationActions = 'true';

  // The old recovery proxy is obsolete. The visible Arena below is the actual
  // React button wired directly to AiStudio's arenaMode state.
  document.querySelectorAll('[data-quantora-conversation-actions]').forEach((node) => node.remove());
  ensureForkButton(actions, reset);
}

function showForkNotice() {
  if (sessionStorage.getItem('quantora_fork_notice') !== 'true') return;
  sessionStorage.removeItem('quantora_fork_notice');
  const toast = document.createElement('div');
  toast.textContent = 'Fork created — this conversation can now evolve independently.';
  Object.assign(toast.style, {
    position: 'fixed',
    left: '50%',
    bottom: '26px',
    transform: 'translateX(-50%)',
    zIndex: '12000',
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid rgba(148,163,184,.25)',
    borderRadius: '10px',
    padding: '10px 14px',
    boxShadow: '0 18px 50px rgba(0,0,0,.35)',
    font: '700 11px/1.4 Inter,system-ui,sans-serif',
  });
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3000);
}

function run() {
  scheduled = false;
  ensureNativeControls();
  ensureProfileFallback();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(run);
}

export function installStudioConversationControls() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (window.__quantoraStudioConversationControlsInstalled) return () => {};
  window.__quantoraStudioConversationControlsInstalled = true;
  showForkNotice();
  schedule();
  observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  return () => {
    observer?.disconnect();
    observer = null;
    window.removeEventListener('resize', schedule);
    delete window.__quantoraStudioConversationControlsInstalled;
  };
}
