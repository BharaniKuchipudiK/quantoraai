import {
  STUDIO_DOMAIN_STATE_EVENT,
  normalizeStudioDomain,
} from './studio-shell-events.js';

const AGENTIC_DOMAINS = new Set(['travel', 'education', 'finance', 'research']);
const HIDDEN_DISPLAY_MARKER = 'quantoraOriginalDisplay';

function isAgenticDomain(domain) {
  return AGENTIC_DOMAINS.has(normalizeStudioDomain(domain));
}

function setPolicyHidden(element, hidden) {
  if (!element) return;
  if (hidden) {
    if (!element.dataset[HIDDEN_DISPLAY_MARKER]) {
      element.dataset[HIDDEN_DISPLAY_MARKER] = element.style.display || '__empty__';
    }
    element.style.display = 'none';
    return;
  }
  const original = element.dataset[HIDDEN_DISPLAY_MARKER];
  if (!original) return;
  element.style.display = original === '__empty__' ? '' : original;
  delete element.dataset[HIDDEN_DISPLAY_MARKER];
}

function exactLeafText(text) {
  return [...document.querySelectorAll('span,div,p,button')]
    .filter((element) => element.children.length === 0 && element.textContent?.trim() === text);
}

function currentDomain() {
  return normalizeStudioDomain(document.documentElement.dataset.quantoraDomain || '');
}

function findLivePreviewRoot() {
  const label = exactLeafText('Live Preview')[0];
  const header = label?.parentElement;
  if (!header) return null;
  return header.parentElement || null;
}

function tagCanvasControls(root) {
  if (!root) return;
  root.dataset.quantoraCanvasRoot = 'true';

  const label = [...root.querySelectorAll('span')]
    .find((element) => element.textContent?.trim() === 'Live Preview');
  const header = label?.parentElement;
  const actions = header?.children?.[1];
  if (!actions) return;

  // The responsive-device switcher is the only direct toolbar child containing
  // exactly three icon-only buttons. Tag it once so CSS can hide it in advisor
  // workspaces without relying on implementation-specific class names.
  for (const child of [...actions.children]) {
    if (child.dataset?.quantoraCanvasFullscreenButton) continue;
    const buttons = child.tagName === 'DIV' ? child.querySelectorAll(':scope > button') : [];
    if (buttons.length === 3 && [...buttons].every((button) => !button.textContent?.trim())) {
      child.dataset.quantoraCanvasDeviceSwitcher = 'true';
      break;
    }
  }
}

function fullscreenButton(root) {
  return root?.querySelector('[data-quantora-canvas-fullscreen-button]') || null;
}

function setCanvasFullscreen(root, nextValue) {
  if (!root) return;
  const isFullscreen = Boolean(nextValue);
  root.dataset.quantoraCanvasFullscreen = isFullscreen ? 'true' : 'false';
  document.documentElement.dataset.quantoraCanvasFullscreen = isFullscreen ? 'true' : '';

  const button = fullscreenButton(root);
  if (button) {
    button.setAttribute('aria-label', isFullscreen ? 'Exit full screen' : 'Expand canvas');
    button.setAttribute('title', isFullscreen ? 'Exit full screen' : 'Expand canvas');
    button.textContent = isFullscreen ? '↙' : '⛶';
  }
}

function ensureFullscreenButton(root) {
  if (!root || fullscreenButton(root)) return;
  const label = [...root.querySelectorAll('span')]
    .find((element) => element.textContent?.trim() === 'Live Preview');
  const header = label?.parentElement;
  const actions = header?.children?.[1];
  if (!actions) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.quantoraCanvasFullscreenButton = 'true';
  button.setAttribute('aria-label', 'Expand canvas');
  button.setAttribute('title', 'Expand canvas');
  button.textContent = '⛶';
  Object.assign(button.style, {
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '7px',
    fontSize: '17px',
    lineHeight: '1',
    opacity: '0.82',
  });
  button.addEventListener('mouseenter', () => { button.style.background = 'rgba(148,163,184,0.14)'; });
  button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
  button.addEventListener('click', () => {
    setCanvasFullscreen(root, root.dataset.quantoraCanvasFullscreen !== 'true');
  });

  const closeButton = [...actions.querySelectorAll(':scope > button')]
    .find((candidate) => /close preview/i.test(candidate.getAttribute('title') || ''));
  actions.insertBefore(button, closeButton || null);
}

function hideModelRecommendation(active) {
  // The proactive model recommendation is useful in neutral/advanced Studio,
  // but violates the Agentic Workspace abstraction. It has no stable component
  // class yet, so identify the tiny recommendation card by its own copy + Switch
  // action and hide only that card.
  for (const button of [...document.querySelectorAll('.app-shell--studio button')]) {
    if (button.textContent?.trim() !== 'Switch') continue;
    let candidate = button.parentElement;
    while (candidate && candidate !== document.body) {
      const text = candidate.textContent || '';
      if (/Recommend:/i.test(text) && /Looks like you/i.test(text)) {
        setPolicyHidden(candidate, active);
        break;
      }
      candidate = candidate.parentElement;
    }
  }
}

function applyWorkspaceUiPolicy() {
  const domain = currentDomain();
  const agentic = isAgenticDomain(domain);
  document.documentElement.dataset.quantoraAgenticWorkspace = agentic ? domain : '';

  hideModelRecommendation(agentic);

  const root = findLivePreviewRoot();
  if (root) {
    tagCanvasControls(root);
    ensureFullscreenButton(root);
    root.dataset.quantoraCanvasContext = agentic ? domain : 'general';
  }
}

export function installAgenticWorkspaceUiPolicy() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyWorkspaceUiPolicy();
    });
  };

  const onDomain = () => schedule();
  const onKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    const root = document.querySelector('[data-quantora-canvas-root][data-quantora-canvas-fullscreen="true"]');
    if (root) setCanvasFullscreen(root, false);
  };

  window.addEventListener(STUDIO_DOMAIN_STATE_EVENT, onDomain);
  document.addEventListener('keydown', onKeyDown);
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-quantora-domain'] });
  schedule();

  return () => {
    window.removeEventListener(STUDIO_DOMAIN_STATE_EVENT, onDomain);
    document.removeEventListener('keydown', onKeyDown);
    observer.disconnect();
  };
}
