const CHAT_SESSIONS_KEY = 'quantora_chat_sessions';
const PROJECTS_KEY = 'quantora_projects_v1';
const STYLE_ID = 'quantora-studio-stability-boundary-style';

let observer = null;
let scheduled = false;

function currentDomain() {
  return String(document.documentElement.dataset.quantoraDomain || '').trim().toLowerCase();
}

function textOf(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function getSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_SESSIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mainStudioShell() {
  return document.querySelector('.app-shell--studio');
}

function nativeArenaButton() {
  const shell = mainStudioShell();
  if (!shell) return null;
  return [...shell.querySelectorAll('button')].find((button) => (
    button.title === 'Compare two AI models side-by-side in real time'
  )) || null;
}

function syncArenaBridge() {
  const proxy = document.querySelector('[data-quantora-dual-arena]');
  if (!proxy) return;
  const native = nativeArenaButton();

  if (!proxy.dataset.quantoraNativeArenaBridge) {
    proxy.dataset.quantoraNativeArenaBridge = 'true';
    proxy.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const target = nativeArenaButton();
      target?.click();
      window.setTimeout(schedule, 0);
      window.setTimeout(schedule, 80);
    }, true);
  }

  const active = /Arena Mode Active/i.test(textOf(native));
  proxy.disabled = !native;
  proxy.style.opacity = native ? '1' : '.45';
  proxy.textContent = active ? '⚔ Arena Active' : '⚔ Dual Arena';
  proxy.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function getVisibleSourceSession() {
  const sessions = getSessions();
  if (!sessions.length) return null;
  const shell = mainStudioShell();
  const visibleText = String(shell?.innerText || '');

  const scored = sessions.map((session, index) => {
    const userMessages = (session.messages || []).filter((message) => message?.sender === 'user' && message?.text);
    const firstUser = userMessages[0]?.text || '';
    const lastUser = userMessages[userMessages.length - 1]?.text || '';
    let score = Math.max(0, 20 - index);
    if (firstUser && visibleText.includes(firstUser.slice(0, Math.min(120, firstUser.length)))) score += 120;
    if (lastUser && visibleText.includes(lastUser.slice(0, Math.min(120, lastUser.length)))) score += 80;
    if (session.title && visibleText.includes(String(session.title).replace(/\.\.\.$/, '').slice(0, 28))) score += 30;
    return { session, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.score >= 40 ? scored[0].session : sessions[0];
}

function forkFromAssistantResponse(responseIndex) {
  const source = getVisibleSourceSession();
  if (!source) return;

  const messages = Array.isArray(source.messages) ? source.messages : [];
  const assistantMessages = messages.filter((message) => (
    message?.sender === 'ai' && message?.type !== 'greeting' && (message?.text || message?.isDual)
  ));
  const target = assistantMessages[responseIndex] || assistantMessages[assistantMessages.length - 1] || null;
  const targetIndex = target ? messages.findIndex((message) => message === target || (target.id != null && message?.id === target.id)) : messages.length - 1;
  if (targetIndex < 0) return;

  const sessions = getSessions();
  const now = Date.now();
  const id = `session-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const baseTitle = String(source.title || 'Forked Chat').replace(/\s*\(fork\)$/i, '').trim();
  const fork = {
    ...source,
    id,
    title: `${baseTitle || 'Forked Chat'} (fork)`.slice(0, 80),
    createdAt: now,
    updatedAt: now,
    messages: messages.slice(0, targetIndex + 1).map((message) => ({ ...message })),
    parentSessionId: source.id || null,
    forkedFromMessageId: target?.id ?? null,
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
    // Never damage the current conversation when browser storage is unavailable.
  }
}

function removeTopFork() {
  const topFork = document.querySelector('[data-quantora-fork-chat]');
  topFork?.remove();
}

function assistantFooterRows() {
  const shell = mainStudioShell();
  if (!shell) return [];
  return [...shell.querySelectorAll('button[title="Copy"]')]
    .map((copy) => copy.parentElement)
    .filter((row) => row && row.querySelector('button[title="Regenerate"]'));
}

function ensureFooterForks() {
  const rows = assistantFooterRows();
  rows.forEach((row, responseIndex) => {
    let fork = row.querySelector('[data-quantora-message-fork="true"]');
    if (!fork) {
      fork = document.createElement('button');
      fork.type = 'button';
      fork.dataset.quantoraMessageFork = 'true';
      fork.title = 'Fork Chat';
      fork.setAttribute('aria-label', 'Fork Chat from this response');
      fork.textContent = '⑂ Fork Chat';
      Object.assign(fork.style, {
        background: 'transparent',
        border: 'none',
        color: '#94a3b8',
        cursor: 'pointer',
        padding: '3px 4px',
        borderRadius: '6px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        font: '600 11px/1.2 Inter,system-ui,sans-serif',
        opacity: '.78',
      });
      fork.addEventListener('mouseenter', () => { fork.style.opacity = '1'; });
      fork.addEventListener('mouseleave', () => { fork.style.opacity = '.78'; });
      fork.addEventListener('click', () => {
        const index = Number(fork.dataset.quantoraResponseIndex || '0');
        forkFromAssistantResponse(Number.isFinite(index) ? index : 0);
      });
      row.append(fork);
    }
    fork.dataset.quantoraResponseIndex = String(responseIndex);
  });
}

function installBoundaryStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html[data-quantora-domain="travel"] [data-quantora-sidebar-canvas] {
      display: none !important;
    }
    html[data-quantora-domain="travel"] [data-quantora-legacy-workspace="true"] {
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;
  document.head.append(style);
}

function closeTravelCodeWorkspace() {
  if (currentDomain() !== 'travel') return;
  const workspaces = [...document.querySelectorAll('[data-quantora-legacy-workspace="true"]')];
  for (const workspace of workspaces) {
    const header = workspace.firstElementChild;
    const headerButtons = header ? [...header.querySelectorAll('button')] : [];
    const close = headerButtons[headerButtons.length - 1] || null;
    if (close && !/Preview App/i.test(textOf(close))) {
      close.click();
      continue;
    }
    // Last-resort visual fail-closed behavior. The domain CSS already keeps the
    // stale code surface invisible while React catches up on the next render.
    workspace.style.visibility = 'hidden';
    workspace.style.pointerEvents = 'none';
  }
}

function isTravelCanvasControl(target) {
  if (!(target instanceof Element)) return false;
  const button = target.closest('button');
  if (!button) return false;
  if (button.closest('[data-quantora-sidebar-canvas]')) return true;
  const title = String(button.getAttribute('title') || '');
  const label = textOf(button);
  return /Preview in Workspace|Push to Canvas|Push raw prompt to Dream Canvas/i.test(title)
    || /^Preview$/i.test(label) && Boolean(button.closest('[data-quantora-legacy-workspace]'));
}

function onClickCapture(event) {
  const target = event.target instanceof Element ? event.target : null;

  const arenaProxy = target?.closest('[data-quantora-dual-arena]');
  if (arenaProxy) {
    // The listener installed directly on the proxy owns this click; this branch
    // simply prevents unrelated capture handlers from treating it as Canvas UI.
    return;
  }

  if (currentDomain() === 'travel' && isTravelCanvasControl(target)) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  }
}

function run() {
  scheduled = false;
  installBoundaryStyle();
  removeTopFork();
  syncArenaBridge();
  ensureFooterForks();
  closeTravelCodeWorkspace();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(run);
}

export function installStudioStabilityBoundary() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (window.__quantoraStudioStabilityBoundaryInstalled) return () => {};
  window.__quantoraStudioStabilityBoundaryInstalled = true;

  installBoundaryStyle();
  document.addEventListener('click', onClickCapture, true);
  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-quantora-domain'],
    childList: true,
    subtree: true,
  });
  schedule();

  return () => {
    document.removeEventListener('click', onClickCapture, true);
    observer?.disconnect();
    observer = null;
    document.getElementById(STYLE_ID)?.remove();
    delete window.__quantoraStudioStabilityBoundaryInstalled;
  };
}
