import { normalizeStudioDomain } from './studio-shell-events.js';

function currentDomain() {
  return normalizeStudioDomain(document.documentElement.dataset.quantoraDomain || '');
}

function elapsedSeconds(text) {
  const match = String(text || '').trim().match(/^(\d+):(\d{2})s$/);
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
}

function progressCopy(seconds, domain) {
  if (seconds < 5) return 'Understanding your request…';
  if (seconds < 15) {
    if (domain === 'education') return 'Working through the concepts and context…';
    if (domain === 'travel') return 'Working through the trip details…';
    if (domain === 'finance') return 'Working through the numbers and trade-offs…';
    if (domain === 'research') return 'Working through the evidence and scope…';
    return 'Working through the details…';
  }
  if (seconds < 30) return 'Putting a useful response together…';
  if (seconds < 45) return 'This is a more involved request — still working…';
  return 'Still working — this is taking a little longer than usual…';
}

function enhanceGenerationProgress() {
  const shell = document.querySelector('.app-shell--studio');
  if (!shell) return;

  const timers = [...shell.querySelectorAll('div,span')]
    .filter((element) => element.children.length === 0 && elapsedSeconds(element.textContent) !== null);

  for (const timer of timers) {
    const seconds = elapsedSeconds(timer.textContent);
    if (seconds === null) continue;
    const row = timer.parentElement;
    if (!row || !row.querySelector('svg')) continue;

    timer.dataset.quantoraElapsedTimer = 'true';
    Object.assign(timer.style, {
      flex: '0 0 auto',
      color: 'var(--text-secondary, #94a3b8)',
      fontFamily: 'inherit',
      fontSize: '0.76rem',
      fontWeight: '550',
      paddingTop: '9px',
      minWidth: '42px',
    });

    let status = row.querySelector('[data-quantora-generation-progress]');
    if (!status) {
      status = document.createElement('div');
      status.dataset.quantoraGenerationProgress = 'true';
      timer.insertAdjacentElement('afterend', status);
    }
    status.textContent = progressCopy(seconds, currentDomain());
    Object.assign(status.style, {
      flex: '1',
      minWidth: '0',
      color: 'var(--text-secondary, #94a3b8)',
      fontSize: '0.88rem',
      lineHeight: '1.35',
      fontWeight: '500',
      paddingTop: '8px',
    });
  }
}

function closeInlineImageViewer() {
  document.querySelector('[data-quantora-inline-image-viewer]')?.remove();
}

function openInlineImageViewer(image) {
  if (!image?.src) return;
  closeInlineImageViewer();

  const overlay = document.createElement('div');
  overlay.dataset.quantoraInlineImageViewer = 'true';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '10070',
    background: 'rgba(2,6,23,0.88)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '28px',
    cursor: 'zoom-out',
  });

  const expanded = document.createElement('img');
  expanded.src = image.src;
  expanded.alt = image.alt || '';
  expanded.referrerPolicy = image.referrerPolicy || 'strict-origin-when-cross-origin';
  Object.assign(expanded.style, {
    maxWidth: '94vw',
    maxHeight: '90vh',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
    borderRadius: '14px',
    boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
    cursor: 'default',
  });
  expanded.addEventListener('click', (event) => event.stopPropagation());

  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close image');
  close.setAttribute('title', 'Close image');
  close.textContent = '×';
  Object.assign(close.style, {
    position: 'fixed',
    top: '18px',
    right: '20px',
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(15,23,42,0.92)',
    color: '#fff',
    fontSize: '24px',
    cursor: 'pointer',
  });
  close.addEventListener('click', closeInlineImageViewer);
  overlay.addEventListener('click', closeInlineImageViewer);
  overlay.append(expanded, close);
  document.body.append(overlay);
}

function enhanceInlineImages() {
  const images = document.querySelectorAll('.app-shell--studio .markdown-prose img[src]');
  for (const image of images) {
    if (image.dataset.quantoraInlineImage === 'true') continue;
    image.dataset.quantoraInlineImage = 'true';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = image.referrerPolicy || 'strict-origin-when-cross-origin';
    image.setAttribute('title', image.getAttribute('title') || 'Click to expand');
    Object.assign(image.style, {
      display: 'block',
      width: 'auto',
      maxWidth: 'min(100%, 760px)',
      maxHeight: '520px',
      height: 'auto',
      objectFit: 'contain',
      margin: '14px 0',
      borderRadius: '14px',
      border: '1px solid rgba(148,163,184,0.22)',
      boxShadow: '0 12px 32px rgba(15,23,42,0.14)',
      cursor: 'zoom-in',
    });
    image.addEventListener('click', () => openInlineImageViewer(image));
  }
}

export function installStudioResponsePresentation() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceGenerationProgress();
      enhanceInlineImages();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  const interval = window.setInterval(schedule, 1000);
  const onKeyDown = (event) => {
    if (event.key === 'Escape') closeInlineImageViewer();
  };
  document.addEventListener('keydown', onKeyDown);
  schedule();

  return () => {
    observer.disconnect();
    window.clearInterval(interval);
    document.removeEventListener('keydown', onKeyDown);
    closeInlineImageViewer();
  };
}
