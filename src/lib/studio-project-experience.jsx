import React from 'react';
import { createRoot } from 'react-dom/client';
import BrowserProjectPreview from '../components/BrowserProjectPreview.jsx';
import { isBrowserProjectVfs } from './browser-project-runtime.js';

const roots = new Map();
let observer = null;
let scheduled = false;
let rebuildTimer = null;

function textOf(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function waitFrames(count = 1) {
  return new Promise((resolve) => {
    const next = () => {
      if (count-- <= 0) return resolve();
      requestAnimationFrame(next);
    };
    next();
  });
}

function cleanTabLabel(value) {
  return String(value || '').replace(/[×✕]\s*$/, '').trim();
}

function isFileLabel(label) {
  return /(?:^|\/)[^/]+\.(?:json|html?|css|scss|sass|less|jsx?|tsx?|mjs|cjs|py|md|yaml|yml|toml|vue|svelte)$/i.test(label);
}

function fileButtons(workspace) {
  const seen = new Set();
  return [...(workspace?.querySelectorAll('button') || [])]
    .map((button) => ({ button, label: cleanTabLabel(textOf(button)) }))
    .filter(({ label }) => isFileLabel(label))
    .filter(({ label }) => {
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

function previewButton(workspace) {
  return [...(workspace?.querySelectorAll('button') || [])]
    .find((button) => /^Preview$/i.test(cleanTabLabel(textOf(button)))) || null;
}

function containsFixedAncestor(node, stopAt) {
  let current = node;
  while (current && current !== stopAt && current !== document.body) {
    if (getComputedStyle(current).position === 'fixed') return true;
    current = current.parentElement;
  }
  return false;
}

function findWorkspace() {
  const shell = document.querySelector('.app-shell--studio');
  if (!shell) return null;
  const candidates = [];
  const previews = [...shell.querySelectorAll('button')]
    .filter((button) => /^Preview$/i.test(cleanTabLabel(textOf(button))));

  for (const preview of previews) {
    let node = preview.parentElement;
    for (let depth = 0; node && depth < 9; depth += 1, node = node.parentElement) {
      if (containsFixedAncestor(node, shell)) continue;
      const files = fileButtons(node);
      if (files.length < 2 || !(node.querySelector('iframe') || node.querySelector('textarea'))) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      candidates.push({ node, area: rect.width * rect.height, width: rect.width });
    }
  }

  // Prefer the smallest non-fixed project container. This deliberately rejects
  // the legacy full-screen Preview overlay, which used to masquerade as the
  // workspace and caused the Canvas to take over the whole browser.
  const chosen = candidates
    .filter(({ width }) => width <= window.innerWidth * 0.78)
    .sort((a, b) => a.area - b.area)[0]
    || candidates.sort((a, b) => a.area - b.area)[0]
    || null;

  if (!chosen) return null;
  chosen.node.dataset.quantoraLegacyWorkspace = 'true';
  return chosen.node;
}

function visibleEditor(workspace) {
  return [...(workspace?.querySelectorAll('textarea') || [])]
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

function revealRealEditor(workspace) {
  const textarea = visibleEditor(workspace);
  if (!textarea) return;
  textarea.style.color = '#e2e8f0';
  textarea.style.caretColor = '#e2e8f0';
  const pre = textarea.parentElement?.querySelector('pre');
  if (pre) pre.style.display = 'none';
}

async function collectFiles(workspace) {
  const files = {};
  const tabs = fileButtons(workspace);
  const preview = previewButton(workspace);
  if (tabs.length < 2 || !preview) return files;

  workspace.dataset.quantoraCollectingFiles = 'true';
  try {
    for (const { button, label } of tabs) {
      button.click();
      await waitFrames(2);
      const editor = visibleEditor(workspace);
      if (editor) files[label] = { content: editor.value || '' };
    }
    preview.click();
    await waitFrames(2);
  } finally {
    delete workspace.dataset.quantoraCollectingFiles;
  }
  return files;
}

function ensureFilePicker(workspace) {
  const tabs = fileButtons(workspace);
  const preview = previewButton(workspace);
  if (tabs.length < 2 || !preview) return;
  const tabStrip = preview.parentElement?.parentElement;
  if (!tabStrip) return;

  for (const { button } of tabs) {
    const wrapper = button.parentElement;
    if (!wrapper) continue;
    wrapper.dataset.quantoraHiddenGeneratedFileTab = 'true';
    wrapper.style.display = 'none';
  }

  let picker = tabStrip.querySelector('[data-quantora-file-picker="true"]');
  if (!picker) {
    picker = document.createElement('select');
    picker.dataset.quantoraFilePicker = 'true';
    picker.setAttribute('aria-label', 'Files');
    Object.assign(picker.style, {
      alignSelf: 'center',
      height: '32px',
      maxWidth: '260px',
      marginLeft: '8px',
      padding: '0 30px 0 10px',
      borderRadius: '9px',
      border: '1px solid rgba(148,163,184,.24)',
      background: '#111827',
      color: '#cbd5e1',
      font: '650 12px/1 Inter,system-ui,sans-serif',
      outline: 'none',
      cursor: 'pointer',
    });
    picker.addEventListener('change', () => {
      if (!picker.value) return;
      const target = fileButtons(workspace).find(({ label }) => label === picker.value);
      target?.button.click();
      requestAnimationFrame(() => revealRealEditor(workspace));
    });
    preview.addEventListener('click', () => { picker.value = ''; });
    tabStrip.append(picker);
  }

  const labels = tabs.map(({ label }) => label);
  const current = [...picker.options].map((option) => option.value);
  const desired = ['', ...labels];
  if (current.join('\n') !== desired.join('\n')) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = `Files (${labels.length})`;
    picker.replaceChildren(placeholder, ...labels.map((label) => {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      return option;
    }));
  }
}

function largestIframe(workspace) {
  return [...(workspace?.querySelectorAll('iframe') || [])]
    .sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    })[0] || null;
}

function projectFingerprint(files) {
  return JSON.stringify(Object.entries(files || {}).map(([path, file]) => [path, file?.content || '']));
}

function ensureRuntimeHost(workspace) {
  const frame = largestIframe(workspace);
  const hostParent = frame?.parentElement;
  if (!hostParent) return null;
  if (getComputedStyle(hostParent).position === 'static') hostParent.style.position = 'relative';

  let host = hostParent.querySelector(':scope > [data-quantora-project-runtime="true"]');
  if (!host) {
    host = document.createElement('div');
    host.dataset.quantoraProjectRuntime = 'true';
    host.dataset.runtimeState = 'preparing';
    Object.assign(host.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '24',
      background: '#ffffff',
      overflow: 'hidden',
      display: 'grid',
      placeItems: 'center',
    });
    host.innerHTML = '<div data-quantora-preview-preparing="true" style="font:700 13px/1.4 Inter,system-ui,sans-serif;color:#475569;display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:999px;background:#f97316;box-shadow:0 0 0 5px rgba(249,115,22,.10)"></span>Preparing your preview…</div>';
    hostParent.append(host);
  }
  return host;
}

async function ensureProjectRuntime(workspace) {
  if (!workspace || workspace.dataset.quantoraCollectingFiles === 'true' || workspace.dataset.quantoraRuntimeBusy === 'true') return;
  const tabs = fileButtons(workspace);
  const hasPackage = tabs.some(({ label }) => label === 'package.json');
  const hasEntry = tabs.some(({ label }) => /(?:^|\/)src\/(?:main|index|App)\.(?:jsx?|tsx?)$/i.test(label));
  if (!hasPackage || !hasEntry) return;

  // Cover the legacy iframe immediately so users never see a browser refusal,
  // a third-party loader, or a spinning cube while Quantora is collecting and
  // compiling the project.
  const host = ensureRuntimeHost(workspace);
  if (!host) return;

  workspace.dataset.quantoraRuntimeBusy = 'true';
  try {
    const files = await collectFiles(workspace);
    if (!isBrowserProjectVfs(files)) {
      host.dataset.runtimeState = 'failed';
      host.innerHTML = '<div role="alert" style="max-width:520px;padding:28px;font:600 13px/1.55 Inter,system-ui,sans-serif;color:#475569"><strong style="display:block;color:#b91c1c;margin-bottom:6px">Preview needs attention</strong>Quantora could not identify a runnable browser project. The failed runtime was kept hidden.</div>';
      return;
    }

    const key = projectFingerprint(files);
    const existing = roots.get(host);
    if (existing?.key === key) return;
    const root = existing?.root || createRoot(host);
    roots.set(host, { root, key });
    root.render(
      <BrowserProjectPreview
        vfs={files}
        onRuntimeStateChange={(state) => {
          host.dataset.runtimeState = state?.kind || 'unknown';
          host.dataset.runtimeBodyText = String(state?.bodyText || '').slice(0, 500);
        }}
      />,
    );
  } finally {
    delete workspace.dataset.quantoraRuntimeBusy;
  }
}

function nearestFixedAncestor(node) {
  let current = node?.parentElement || null;
  while (current && current !== document.body) {
    if (getComputedStyle(current).position === 'fixed') return current;
    current = current.parentElement;
  }
  return null;
}

function dockStandalonePreview() {
  const workspace = findWorkspace();
  const closeButtons = [...document.querySelectorAll('.app-shell--studio button[title="Close preview (Esc)"]')];
  const close = closeButtons.find((button) => !workspace?.contains(button) && nearestFixedAncestor(button)) || null;
  if (!close) return;
  const overlay = nearestFixedAncestor(close);
  if (!overlay) return;

  overlay.dataset.quantoraDockedPreview = 'true';
  const mobile = window.innerWidth < 900;
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '12px',
    right: '12px',
    bottom: '12px',
    left: mobile ? '12px' : 'auto',
    width: mobile ? 'calc(100vw - 24px)' : 'min(58vw, 980px)',
    height: 'auto',
    padding: '0',
    margin: '0',
    background: 'transparent',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'stretch',
  });
  const panel = overlay.firstElementChild;
  if (panel instanceof HTMLElement) {
    Object.assign(panel.style, {
      width: '100%',
      maxWidth: 'none',
      height: '100%',
      maxHeight: 'none',
      margin: '0',
      borderRadius: '16px',
    });
  }
}

function cleanupRoots() {
  for (const [host, value] of roots) {
    if (host.isConnected) continue;
    try { value.root.unmount(); } catch {}
    roots.delete(host);
  }
}

function run() {
  scheduled = false;
  cleanupRoots();
  const workspace = findWorkspace();
  if (workspace) {
    ensureFilePicker(workspace);
    revealRealEditor(workspace);
    void ensureProjectRuntime(workspace);
  }
  dockStandalonePreview();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(run);
}

function onInput(event) {
  const workspace = findWorkspace();
  if (!workspace || !workspace.contains(event.target) || !(event.target instanceof HTMLTextAreaElement)) return;
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(schedule, 450);
}

function onClickCapture(event) {
  const target = event.target instanceof Element ? event.target.closest('button') : null;
  if (!target || target.getAttribute('title') !== 'Preview') return;
  const workspace = findWorkspace();
  if (!workspace || workspace.contains(target)) return;
  const preview = previewButton(workspace);
  if (!preview) return;

  // When a project workspace already exists, there must be only one Preview
  // surface. Route the message-level Preview action to the right-side Canvas
  // instead of letting legacy AiStudio create a second blocking overlay.
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  preview.click();
  schedule();
}

export function installStudioProjectExperience() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (window.__quantoraStudioProjectExperienceInstalled) return () => {};
  window.__quantoraStudioProjectExperienceInstalled = true;
  schedule();
  observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('input', onInput, true);
  document.addEventListener('click', onClickCapture, true);
  window.addEventListener('resize', schedule);
  return () => {
    observer?.disconnect();
    observer = null;
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('click', onClickCapture, true);
    window.removeEventListener('resize', schedule);
    window.clearTimeout(rebuildTimer);
    for (const [, value] of roots) {
      try { value.root.unmount(); } catch {}
    }
    roots.clear();
    delete window.__quantoraStudioProjectExperienceInstalled;
  };
}