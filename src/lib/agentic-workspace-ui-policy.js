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

function findStudioSidebar() {
  const collapse = document.querySelector('.app-shell--studio button[title="Collapse sidebar"]');
  return collapse?.parentElement?.parentElement || null;
}

function sidebarIsOpen() {
  const sidebar = findStudioSidebar();
  if (!sidebar) return true;

  // React flips these inline values immediately when the user collapses the
  // sidebar, while the rendered width continues animating for ~300ms. Trust the
  // state-bearing inline styles first so the restore control appears immediately.
  const inlineWidth = String(sidebar.style.width || '').trim();
  const inlineOpacity = String(sidebar.style.opacity || '').trim();
  const inlinePointerEvents = String(sidebar.style.pointerEvents || '').trim();
  if (inlineWidth === '0px' || inlineWidth === '0' || inlineOpacity === '0' || inlinePointerEvents === 'none') {
    return false;
  }

  const rect = sidebar.getBoundingClientRect();
  const opacity = Number.parseFloat(window.getComputedStyle(sidebar).opacity || '1');
  return rect.width > 80 && opacity > 0.4;
}

function ensureSidebarRestoreControl() {
  const shell = document.querySelector('.app-shell--studio');
  const existing = document.querySelector('[data-quantora-sidebar-restore]');
  if (!shell || sidebarIsOpen()) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.quantoraSidebarRestore = 'true';
  button.setAttribute('title', 'Open navigation');
  button.setAttribute('aria-label', 'Open navigation');
  button.textContent = '☰';
  Object.assign(button.style, {
    position: 'absolute',
    top: '16px',
    left: '12px',
    width: '38px',
    height: '38px',
    borderRadius: '11px',
    border: '1px solid rgba(148,163,184,0.30)',
    background: 'rgba(15,23,42,0.94)',
    color: '#e2e8f0',
    boxShadow: '0 10px 28px rgba(15,23,42,0.24)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    lineHeight: '1',
    zIndex: '10020',
  });
  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(30,41,59,0.98)';
    button.style.borderColor = 'rgba(249,115,22,0.45)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(15,23,42,0.94)';
    button.style.borderColor = 'rgba(148,163,184,0.30)';
  });
  button.addEventListener('click', () => {
    const nativeOpen = document.querySelector('.app-shell--studio button[title="Open Chat History Sidebar"]');
    nativeOpen?.click();
    setTimeout(() => ensureSidebarRestoreControl(), 80);
    setTimeout(() => ensureSidebarRestoreControl(), 360);
  });
  shell.append(button);
}

function parseYouTubeVideoId(rawHref) {
  if (!rawHref) return null;
  try {
    const url = new URL(rawHref, window.location.href);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
    if (!['youtube.com', 'm.youtube.com'].includes(host)) return null;
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const parts = url.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || null;
  } catch {
    return null;
  }
  return null;
}

function closeMediaCanvas() {
  document.querySelector('[data-quantora-media-canvas]')?.remove();
  document.documentElement.dataset.quantoraMediaFullscreen = '';
}

function setMediaFullscreen(panel, button, fullscreen) {
  if (!panel) return;
  panel.dataset.quantoraMediaFullscreen = fullscreen ? 'true' : 'false';
  document.documentElement.dataset.quantoraMediaFullscreen = fullscreen ? 'true' : '';
  if (button) {
    button.textContent = fullscreen ? '↙' : '⛶';
    button.setAttribute('title', fullscreen ? 'Exit full screen' : 'Expand video');
    button.setAttribute('aria-label', fullscreen ? 'Exit full screen' : 'Expand video');
  }
}

function makeMediaHeaderButton(label, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('title', title);
  button.setAttribute('aria-label', title);
  Object.assign(button.style, {
    border: 'none',
    background: 'transparent',
    color: '#cbd5e1',
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: '8px',
    fontSize: '15px',
    lineHeight: '1',
  });
  button.addEventListener('mouseenter', () => { button.style.background = 'rgba(148,163,184,0.14)'; });
  button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
  return button;
}

function openYouTubeMediaCanvas({ id, title, href }) {
  if (!id) return;
  closeMediaCanvas();

  const shell = document.querySelector('.app-shell--studio');
  if (!shell) {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }

  const panel = document.createElement('section');
  panel.dataset.quantoraMediaCanvas = 'youtube';
  panel.dataset.quantoraMediaFullscreen = 'false';
  Object.assign(panel.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    bottom: '16px',
    width: window.innerWidth < 900 ? 'calc(100vw - 32px)' : 'min(56vw, 960px)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: '16px',
    background: '#0f172a',
    border: '1px solid rgba(148,163,184,0.28)',
    boxShadow: '0 28px 70px rgba(0,0,0,0.46)',
    zIndex: '10040',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    height: '48px',
    flexShrink: '0',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '0 12px 0 16px',
    background: '#111827',
    borderBottom: '1px solid rgba(148,163,184,0.20)',
  });

  const source = document.createElement('a');
  source.href = href;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.textContent = title || 'YouTube video';
  source.title = 'Open source on YouTube';
  Object.assign(source.style, {
    flex: '1',
    minWidth: '0',
    color: '#e2e8f0',
    fontSize: '0.84rem',
    fontWeight: '650',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textDecoration: 'none',
  });

  const expand = makeMediaHeaderButton('⛶', 'Expand video');
  expand.addEventListener('click', () => {
    setMediaFullscreen(panel, expand, panel.dataset.quantoraMediaFullscreen !== 'true');
  });
  const close = makeMediaHeaderButton('×', 'Close video');
  close.style.fontSize = '22px';
  close.addEventListener('click', closeMediaCanvas);
  header.append(source, expand, close);

  const frame = document.createElement('iframe');
  frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1`;
  frame.title = title || 'YouTube video';
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.setAttribute('allowfullscreen', '');
  frame.setAttribute('credentialless', '');
  Object.assign(frame.style, {
    flex: '1',
    width: '100%',
    minHeight: '0',
    border: 'none',
    background: '#000',
  });

  panel.append(header, frame);
  shell.append(panel);
}

function ensureYouTubeActions() {
  const anchors = document.querySelectorAll('.app-shell--studio .markdown-prose a[href]');
  for (const anchor of anchors) {
    if (anchor.dataset.quantoraYoutubeSource) continue;
    const href = anchor.href;
    const id = parseYouTubeVideoId(href);
    if (!id) continue;
    anchor.dataset.quantoraYoutubeSource = 'true';

    const watch = document.createElement('button');
    watch.type = 'button';
    watch.dataset.quantoraYoutubeWatch = 'true';
    watch.textContent = 'Watch ▶';
    watch.setAttribute('title', 'Play in Quantora');
    Object.assign(watch.style, {
      marginLeft: '7px',
      padding: '2px 8px',
      borderRadius: '999px',
      border: '1px solid rgba(239,68,68,0.30)',
      background: 'rgba(239,68,68,0.10)',
      color: '#ef4444',
      cursor: 'pointer',
      fontSize: '0.72rem',
      fontWeight: '750',
      verticalAlign: 'middle',
    });
    watch.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openYouTubeMediaCanvas({ id, title: anchor.textContent?.trim() || 'YouTube video', href });
    });
    anchor.insertAdjacentElement('afterend', watch);
  }
}

function applyWorkspaceUiPolicy() {
  const domain = currentDomain();
  const agentic = isAgenticDomain(domain);
  document.documentElement.dataset.quantoraAgenticWorkspace = agentic ? domain : '';

  hideModelRecommendation(agentic);
  ensureSidebarRestoreControl();
  ensureYouTubeActions();

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
  const onClick = (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button) return;
    const title = button.getAttribute('title') || '';
    if (/Collapse sidebar|Open Chat History Sidebar/i.test(title)) {
      setTimeout(schedule, 40);
      setTimeout(schedule, 360);
    }
  };
  const onResize = () => schedule();
  const onKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    const media = document.querySelector('[data-quantora-media-canvas]');
    if (media) {
      if (media.dataset.quantoraMediaFullscreen === 'true') {
        const expand = media.querySelector('button[title="Exit full screen"]');
        setMediaFullscreen(media, expand, false);
      } else {
        closeMediaCanvas();
      }
      return;
    }
    const root = document.querySelector('[data-quantora-canvas-root][data-quantora-canvas-fullscreen="true"]');
    if (root) setCanvasFullscreen(root, false);
  };

  window.addEventListener(STUDIO_DOMAIN_STATE_EVENT, onDomain);
  window.addEventListener('resize', onResize);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-quantora-domain'] });
  schedule();

  return () => {
    window.removeEventListener(STUDIO_DOMAIN_STATE_EVENT, onDomain);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown);
    observer.disconnect();
    closeMediaCanvas();
  };
}