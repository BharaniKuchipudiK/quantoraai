import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const CHAT_SESSIONS_KEY = 'quantora_chat_sessions';
const PROJECTS_KEY = 'quantora_projects_v1';
const RECOVERY_ATTR = 'quantoraStudioRecovery';
const previewRoots = new Map();
let scheduled = false;
let observer = null;

function textOf(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function waitFrame(count = 1) {
  return new Promise((resolve) => {
    const next = () => {
      if (count-- <= 0) return resolve();
      requestAnimationFrame(next);
    };
    next();
  });
}

function exactButton(pattern, root = document) {
  return [...root.querySelectorAll('button')].find((button) => pattern.test(textOf(button))) || null;
}

function findLegacyTopBar() {
  const reset = exactButton(/^Reset Chat$/i);
  return reset?.parentElement?.parentElement || null;
}

function findMainChatColumn() {
  return findLegacyTopBar()?.parentElement || null;
}

function activeArenaButton() {
  return exactButton(/(?:Dual Arena Mode|Arena Mode Active)/i);
}

function isArenaActive() {
  return /Arena Mode Active/i.test(textOf(activeArenaButton()));
}

function styleActionButton(button, active = false) {
  Object.assign(button.style, {
    border: active ? '1px solid rgba(249,115,22,.58)' : '1px solid rgba(148,163,184,.20)',
    background: active ? 'rgba(249,115,22,.14)' : 'rgba(15,23,42,.82)',
    color: active ? '#fb923c' : '#cbd5e1',
    minHeight: '32px',
    padding: '0 10px',
    borderRadius: '10px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    font: '700 11px/1 Inter, system-ui, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0,0,0,.18)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    whiteSpace: 'nowrap',
  });
}

function getSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_SESSIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findVisibleSourceSession() {
  const sessions = getSessions();
  if (!sessions.length) return null;
  const main = findMainChatColumn();
  const visibleText = String(main?.innerText || document.body.innerText || '');

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
  const source = findVisibleSourceSession();
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
    // Keep the current conversation intact if browser storage is unavailable.
  }
}

function ensureConversationActions() {
  const main = findMainChatColumn();
  if (!main || document.querySelector('[data-quantora-code-workspace="true"]')) return;
  let bar = main.querySelector('[data-quantora-conversation-actions]');
  if (!bar) {
    if (getComputedStyle(main).position === 'static') main.style.position = 'relative';
    bar = document.createElement('div');
    bar.dataset.quantoraConversationActions = 'true';
    Object.assign(bar.style, {
      position: 'absolute',
      top: '10px',
      right: '12px',
      zIndex: '80',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      pointerEvents: 'auto',
    });

    const arena = document.createElement('button');
    arena.type = 'button';
    arena.dataset.quantoraDualArena = 'true';
    arena.title = 'Compare two AI responses side-by-side';
    arena.addEventListener('click', () => {
      const original = activeArenaButton();
      original?.click();
      setTimeout(schedule, 0);
      setTimeout(schedule, 80);
    });

    const fork = document.createElement('button');
    fork.type = 'button';
    fork.dataset.quantoraForkChat = 'true';
    fork.title = 'Branch this conversation and continue independently';
    fork.textContent = '⑂ Fork Chat';
    fork.addEventListener('click', forkCurrentChat);
    styleActionButton(fork, false);

    bar.append(arena, fork);
    main.append(bar);
  }

  const arena = bar.querySelector('[data-quantora-dual-arena]');
  if (arena) {
    const active = isArenaActive();
    arena.textContent = active ? '⚔ Arena Active' : '⚔ Dual Arena';
    styleActionButton(arena, active);
    arena.disabled = !activeArenaButton();
    arena.style.opacity = arena.disabled ? '.45' : '1';
  }
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
    fallback.textContent = profileInitial();
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

function cleanTabLabel(value) {
  return String(value || '').replace(/[×✕]\s*$/, '').trim();
}

function isFileTabLabel(label) {
  return /(?:^|\/)[^/]+\.(?:json|html?|css|scss|sass|less|jsx?|tsx?|mjs|cjs|py|md|yaml|yml|toml|vue|svelte)$/i.test(label);
}

function commonAncestor(a, b) {
  if (!a || !b) return null;
  let node = a;
  while (node && !node.contains(b)) node = node.parentElement;
  return node;
}

function fileTabsFor(workspace) {
  const seen = new Set();
  return [...workspace.querySelectorAll('button')]
    .map((button) => ({ button, label: cleanTabLabel(textOf(button)) }))
    .filter(({ label }) => isFileTabLabel(label))
    .filter(({ label }) => {
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

function visibleEditor(workspace) {
  return [...workspace.querySelectorAll('textarea')]
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 150 && rect.height > 120;
    })
    .sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    })[0] || null;
}

function revealActualFileText() {
  for (const textarea of document.querySelectorAll('textarea')) {
    const workspace = textarea.closest('[data-quantora-legacy-workspace]');
    if (!workspace) continue;
    const rect = textarea.getBoundingClientRect();
    if (rect.width < 150 || rect.height < 120) continue;
    textarea.style.color = '#e2e8f0';
    textarea.style.caretColor = '#e2e8f0';
    const pre = textarea.parentElement?.querySelector('pre');
    if (pre) pre.style.display = 'none';
  }
}

function markLegacyWorkspace() {
  const existing = document.querySelector('[data-quantora-legacy-workspace="true"]');
  if (existing?.isConnected) return existing;

  const frame = [...document.querySelectorAll('iframe')].find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    if (rect.width < 300 || rect.height < 180) return false;
    return [...document.querySelectorAll('button')].some((button) => {
      const label = cleanTabLabel(textOf(button));
      if (!isFileTabLabel(label)) return false;
      const br = button.getBoundingClientRect();
      return br.left >= rect.left - 120 && br.right <= rect.right + 120 && br.bottom <= rect.top + 120;
    });
  });
  if (!frame) return null;
  const tab = [...document.querySelectorAll('button')].find((button) => {
    const label = cleanTabLabel(textOf(button));
    if (!isFileTabLabel(label)) return false;
    const fr = frame.getBoundingClientRect();
    const br = button.getBoundingClientRect();
    return br.left >= fr.left - 120 && br.right <= fr.right + 120 && br.bottom <= fr.top + 120;
  });
  const workspace = commonAncestor(tab, frame);
  if (workspace) workspace.dataset.quantoraLegacyWorkspace = 'true';
  return workspace;
}

function ensureCompactFileNavigation(workspace) {
  if (!workspace) return;
  const tabs = fileTabsFor(workspace);
  if (tabs.length < 2) return;
  const previewButton = [...workspace.querySelectorAll('button')]
    .find((button) => /^Preview$/i.test(cleanTabLabel(textOf(button)))) || null;
  const tabStrip = previewButton?.parentElement?.parentElement;
  if (!tabStrip) return;

  for (const { button } of tabs) {
    const wrapper = button.parentElement;
    if (!wrapper) continue;
    wrapper.dataset.quantoraHiddenFileTab = 'true';
    wrapper.style.display = 'none';
  }

  let picker = tabStrip.querySelector('[data-quantora-file-picker]');
  if (!picker) {
    picker = document.createElement('select');
    picker.dataset.quantoraFilePicker = 'true';
    picker.setAttribute('aria-label', 'Project files');
    Object.assign(picker.style, {
      alignSelf: 'center',
      height: '32px',
      maxWidth: '240px',
      marginLeft: '8px',
      padding: '0 30px 0 10px',
      borderRadius: '9px',
      border: '1px solid rgba(148,163,184,.24)',
      background: '#111827',
      color: '#cbd5e1',
      font: '600 12px/1 Inter,system-ui,sans-serif',
      outline: 'none',
      cursor: 'pointer',
    });
    picker.addEventListener('change', () => {
      const target = fileTabsFor(workspace).find(({ label }) => label === picker.value);
      target?.button.click();
      requestAnimationFrame(() => revealActualFileText());
    });
    tabStrip.append(picker);
  }

  const previous = picker.value;
  const labels = tabs.map(({ label }) => label);
  const currentOptions = [...picker.options].map((option) => option.value);
  if (currentOptions.join('\n') !== labels.join('\n')) {
    picker.replaceChildren(...labels.map((label) => {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      return option;
    }));
  }
  if (labels.includes(previous)) picker.value = previous;
}

function dockStandalonePreviewOverlay() {
  const close = [...document.querySelectorAll('button[title="Close preview (Esc)"]')]
    .find((button) => !button.closest('[data-quantora-legacy-workspace]')) || null;
  if (!close) return;

  let overlay = close.parentElement;
  while (overlay && overlay !== document.body && overlay.style.position !== 'fixed') {
    overlay = overlay.parentElement;
  }
  if (!overlay || overlay === document.body) return;
  overlay.dataset.quantoraDockedPreview = 'true';

  const mobile = window.innerWidth < 900;
  Object.assign(overlay.style, {
    top: '12px',
    right: '12px',
    bottom: '12px',
    left: mobile ? '12px' : 'auto',
    width: mobile ? 'calc(100vw - 24px)' : 'min(58vw, 980px)',
    height: 'auto',
    padding: '0',
    background: 'transparent',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'stretch',
    zIndex: '10010',
    pointerEvents: 'none',
  });

  const panel = [...overlay.children].find((child) => child instanceof HTMLElement) || null;
  if (panel) {
    Object.assign(panel.style, {
      width: '100%',
      height: '100%',
      maxWidth: 'none',
      maxHeight: 'none',
      margin: '0',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 24px 70px rgba(0,0,0,.42)',
      pointerEvents: 'auto',
    });
  }
}

async function collectWorkspaceFiles(workspace) {
  const tabs = fileTabsFor(workspace);
  const previewButton = [...workspace.querySelectorAll('button')].find((button) => /^Preview$/i.test(cleanTabLabel(textOf(button)))) || null;
  if (tabs.length < 2 || !previewButton) return null;
  const files = {};
  for (const { button, label } of tabs) {
    button.click();
    await waitFrame(2);
    const editor = visibleEditor(workspace);
    if (editor) files[label] = editor.value || '';
  }
  previewButton.click();
  await waitFrame(3);
  return Object.keys(files).length ? files : null;
}

function parsePackage(files) {
  try {
    return JSON.parse(files?.['package.json'] || '{}');
  } catch {
    return {};
  }
}

function detectTemplate(files, pkg) {
  const names = Object.keys(files || {});
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const usesReact = Boolean(deps.react) || names.some((name) => /(?:^|\/)src\/(?:main|App)\.(?:jsx|tsx)$/i.test(name));
  const usesTs = names.some((name) => /\.tsx?$/i.test(name));
  if (usesReact) return usesTs ? 'vite-react-ts' : 'vite-react';
  return usesTs ? 'vanilla-ts' : 'vanilla';
}

function normalizeSandpackFiles(files) {
  const result = {};
  for (const [path, code] of Object.entries(files || {})) {
    if (path === 'package.json') continue;
    result[`/${path.replace(/^\/+/, '')}`] = { code: String(code || '') };
  }
  return result;
}

function ProjectRuntime({ runtime }) {
  const { SandpackLayout, SandpackPreview, useSandpack } = runtime;
  const { sandpack } = useSandpack();
  return (
    <SandpackLayout
      data-quantora-project-runtime-status={sandpack.status || 'unknown'}
      style={{ width: '100%', height: '100%', minHeight: 0, border: 'none', borderRadius: 0 }}
    >
      <SandpackPreview
        showNavigator={false}
        showRefreshButton
        showOpenInCodeSandbox={false}
        style={{ width: '100%', height: '100%', minHeight: '100%', flex: 1 }}
      />
    </SandpackLayout>
  );
}

function ProjectPreview({ runtime, files }) {
  const pkg = useMemo(() => parsePackage(files), [files]);
  const template = useMemo(() => detectTemplate(files, pkg), [files, pkg]);
  const sandpackFiles = useMemo(() => normalizeSandpackFiles(files), [files]);
  const dependencies = useMemo(() => ({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }), [pkg]);
  const { SandpackProvider } = runtime;
  return (
    <div data-quantora-real-project-preview="true" style={{ width: '100%', height: '100%', minHeight: 0, background: '#fff' }}>
      <SandpackProvider
        template={template}
        files={sandpackFiles}
        customSetup={{ dependencies }}
        options={{ autorun: true, recompileMode: 'immediate' }}
        style={{ width: '100%', height: '100%' }}
      >
        <ProjectRuntime runtime={runtime} />
      </SandpackProvider>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: '#fff', color: '#475569', font: '600 12px/1.5 Inter, system-ui, sans-serif' }}>
      Building the real project preview…
    </div>
  );
}

function PreviewMount({ files }) {
  const [runtime, setRuntime] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    import('@codesandbox/sandpack-react')
      .then((module) => { if (alive) setRuntime(module); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  if (failed) return <div role="alert" style={{ padding: 18, color: '#b91c1c', background: '#fff' }}>Project preview runtime could not start. Your source files are unchanged.</div>;
  if (!runtime) return <PreviewLoading />;
  return <ProjectPreview runtime={runtime} files={files} />;
}

function cleanupPreviewRoots() {
  for (const [host, root] of previewRoots) {
    if (!host.isConnected) {
      try { root.unmount(); } catch {}
      previewRoots.delete(host);
    }
  }
}

async function ensureProjectPreview() {
  cleanupPreviewRoots();
  const workspace = markLegacyWorkspace();
  if (!workspace || workspace.dataset.quantoraPreviewBridgeBusy === 'true') return;
  const tabs = fileTabsFor(workspace);
  const hasPackage = tabs.some(({ label }) => label === 'package.json');
  const hasAppEntry = tabs.some(({ label }) => /(?:^|\/)src\/(?:main|App)\.(?:jsx|tsx|js|ts)$/i.test(label));
  if (!hasPackage || !hasAppEntry) return;

  const existing = workspace.querySelector('[data-quantora-project-preview-bridge]');
  if (existing) return;
  workspace.dataset.quantoraPreviewBridgeBusy = 'true';
  try {
    const files = await collectWorkspaceFiles(workspace);
    if (!files?.['package.json']) return;
    const frame = workspace.querySelector('iframe');
    const hostParent = frame?.parentElement;
    if (!hostParent) return;
    if (getComputedStyle(hostParent).position === 'static') hostParent.style.position = 'relative';
    const host = document.createElement('div');
    host.dataset.quantoraProjectPreviewBridge = 'true';
    Object.assign(host.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '18',
      background: '#fff',
      overflow: 'hidden',
    });
    hostParent.append(host);
    const root = createRoot(host);
    previewRoots.set(host, root);
    root.render(<PreviewMount files={files} />);
  } finally {
    delete workspace.dataset.quantoraPreviewBridgeBusy;
  }
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
    font: '700 11px/1.4 Inter, system-ui, sans-serif',
  });
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3000);
}

function runRecovery() {
  scheduled = false;
  ensureProfileFallback();
  ensureConversationActions();
  const workspace = markLegacyWorkspace();
  ensureCompactFileNavigation(workspace);
  dockStandalonePreviewOverlay();
  revealActualFileText();
  void ensureProjectPreview();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(runRecovery);
}

export function installStudioRegressionRecovery() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (document.documentElement.dataset[RECOVERY_ATTR] === 'true') return () => {};
  document.documentElement.dataset[RECOVERY_ATTR] = 'true';
  showForkNotice();
  schedule();
  observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'src'] });
  window.addEventListener('resize', schedule);
  return () => {
    observer?.disconnect();
    observer = null;
    window.removeEventListener('resize', schedule);
    for (const [, root] of previewRoots) {
      try { root.unmount(); } catch {}
    }
    previewRoots.clear();
    delete document.documentElement.dataset[RECOVERY_ATTR];
  };
}
