const validationCache = new Map();

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
  document.querySelector('[data-quantora-media-canvas="youtube"]')?.remove();
  document.documentElement.dataset.quantoraMediaFullscreen = '';
}

function setMediaFullscreen(panel, button, fullscreen) {
  panel.dataset.quantoraMediaFullscreen = fullscreen ? 'true' : 'false';
  document.documentElement.dataset.quantoraMediaFullscreen = fullscreen ? 'true' : '';
  if (button) {
    button.textContent = fullscreen ? '↙' : '⛶';
    button.setAttribute('title', fullscreen ? 'Exit full screen' : 'Expand video');
    button.setAttribute('aria-label', fullscreen ? 'Exit full screen' : 'Expand video');
  }
}

function headerButton(label, title) {
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

function openYouTubeCanvas({ id, title, href }) {
  const shell = document.querySelector('.app-shell--studio');
  if (!shell || !id) return;

  closeMediaCanvas();

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

  const sourceTitle = document.createElement('div');
  sourceTitle.textContent = title || 'YouTube video';
  Object.assign(sourceTitle.style, {
    flex: '1',
    minWidth: '0',
    color: '#e2e8f0',
    fontSize: '0.84rem',
    fontWeight: '650',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });

  const external = document.createElement('a');
  external.href = href;
  external.target = '_blank';
  external.rel = 'noopener noreferrer';
  external.textContent = 'Open on YouTube ↗';
  external.setAttribute('title', 'Open this video on YouTube');
  Object.assign(external.style, {
    color: '#93c5fd',
    fontSize: '0.74rem',
    fontWeight: '650',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  });

  const expand = headerButton('⛶', 'Expand video');
  expand.addEventListener('click', () => {
    setMediaFullscreen(panel, expand, panel.dataset.quantoraMediaFullscreen !== 'true');
  });

  const close = headerButton('×', 'Close video');
  close.style.fontSize = '22px';
  close.addEventListener('click', closeMediaCanvas);
  header.append(sourceTitle, external, expand, close);

  const frame = document.createElement('iframe');
  frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1&autoplay=1`;
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

async function validateYouTube(id) {
  if (validationCache.has(id)) return validationCache.get(id);
  const pending = fetch(`/api/youtube-validate?id=${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) return { valid: false, reason: `http_${response.status}` };
      return response.json();
    })
    .catch(() => ({ valid: false, reason: 'verification_failed' }));
  validationCache.set(id, pending);
  return pending;
}

function removeUnavailableRecommendation(anchor) {
  const container = anchor.closest('li') || anchor.closest('p');
  if (container) {
    container.dataset.quantoraYoutubeUnavailable = 'true';
    container.remove();
  } else {
    anchor.remove();
  }
}

function stylePlayButton(button, state) {
  const checking = state === 'checking';
  button.disabled = checking;
  button.textContent = checking ? 'Checking…' : '▶ Play';
  button.setAttribute('title', checking ? 'Checking video availability' : 'Play in Quantora');
  Object.assign(button.style, {
    marginLeft: '7px',
    padding: '3px 9px',
    borderRadius: '999px',
    border: '1px solid rgba(239,68,68,0.30)',
    background: checking ? 'rgba(148,163,184,0.10)' : 'rgba(239,68,68,0.10)',
    color: checking ? '#94a3b8' : '#ef4444',
    cursor: checking ? 'progress' : 'pointer',
    fontSize: '0.72rem',
    fontWeight: '750',
    verticalAlign: 'middle',
    opacity: checking ? '0.8' : '1',
  });
}

async function enhanceAnchor(anchor) {
  if (!anchor?.isConnected || anchor.dataset.quantoraYoutubeGuard) return;
  const id = parseYouTubeVideoId(anchor.href);
  if (!id) return;

  anchor.dataset.quantoraYoutubeGuard = 'true';
  // Prevent the older workspace policy from adding its own Watch control.
  anchor.dataset.quantoraYoutubeSource = 'true';
  anchor.removeAttribute('target');
  anchor.removeAttribute('rel');
  anchor.setAttribute('aria-disabled', 'true');
  anchor.style.cursor = 'progress';
  anchor.style.opacity = '0.72';

  const parent = anchor.parentElement || anchor;
  parent.querySelectorAll('[data-quantora-youtube-watch]').forEach((node) => node.remove());

  const play = document.createElement('button');
  play.type = 'button';
  play.dataset.quantoraYoutubePlay = 'true';
  stylePlayButton(play, 'checking');
  anchor.insertAdjacentElement('afterend', play);

  const result = await validateYouTube(id);
  if (!anchor.isConnected) return;
  if (!result?.valid) {
    removeUnavailableRecommendation(anchor);
    return;
  }

  const href = anchor.href;
  const title = anchor.textContent?.trim() || result.title || 'YouTube video';
  const openInside = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    openYouTubeCanvas({ id, title, href });
  };

  anchor.dataset.quantoraYoutubeValidation = 'valid';
  anchor.removeAttribute('aria-disabled');
  anchor.style.cursor = 'pointer';
  anchor.style.opacity = '1';
  anchor.setAttribute('title', 'Play in Quantora');
  anchor.addEventListener('click', openInside);

  stylePlayButton(play, 'ready');
  play.addEventListener('click', openInside);
}

function enhanceYouTubeRecommendations() {
  const anchors = document.querySelectorAll('.app-shell--studio .markdown-prose a[href]');
  for (const anchor of anchors) enhanceAnchor(anchor);
}

export function installYoutubeMediaExperience() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceYouTubeRecommendations();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true });

  const onKeyDown = (event) => {
    if (event.key === 'Escape') closeMediaCanvas();
  };
  document.addEventListener('keydown', onKeyDown);
  const interval = window.setInterval(schedule, 900);
  schedule();

  return () => {
    observer.disconnect();
    window.clearInterval(interval);
    document.removeEventListener('keydown', onKeyDown);
    closeMediaCanvas();
  };
}

export { parseYouTubeVideoId };
