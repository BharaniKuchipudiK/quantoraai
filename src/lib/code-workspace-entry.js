const ENTRY_ATTR = 'data-quantora-code-entry';

function studioVisible() {
  return Boolean(document.querySelector('.app-shell--studio, [data-quantora-specialist-shell="true"]'));
}

function specialistContainer() {
  const candidates = [...document.querySelectorAll('div')];
  const heading = candidates.find((node) => node.textContent?.trim() === 'Specialized Agents');
  return heading?.nextElementSibling || null;
}

function makeEntry(container) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute(ENTRY_ATTR, 'true');
  button.setAttribute('aria-label', 'Open Quantora Code');
  button.title = 'Open Quantora Code';
  button.style.cssText = [
    'width:100%',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'padding:8px 12px',
    'border-radius:8px',
    'border:1px solid transparent',
    'background:transparent',
    'color:inherit',
    'font:inherit',
    'font-size:.85rem',
    'font-weight:600',
    'cursor:pointer',
    'text-align:left',
    'transition:background .15s ease,border-color .15s ease,color .15s ease',
  ].join(';');

  const icon = document.createElement('span');
  icon.textContent = '</>';
  icon.style.cssText = 'display:inline-grid;place-items:center;width:18px;height:18px;color:#f97316;font:800 10px/1 JetBrains Mono,monospace;flex-shrink:0';

  const label = document.createElement('span');
  label.textContent = 'Code';
  label.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';

  const badge = document.createElement('span');
  badge.textContent = 'NEW';
  badge.style.cssText = 'margin-left:auto;font-size:8px;font-weight:800;letter-spacing:.06em;color:#fb923c;border:1px solid rgba(249,115,22,.28);border-radius:999px;padding:2px 6px';

  button.append(icon, label, badge);
  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(249,115,22,.08)';
    button.style.borderColor = 'rgba(249,115,22,.18)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = 'transparent';
    button.style.borderColor = 'transparent';
  });
  button.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('quantora:open-code-workspace'));
  });

  container.appendChild(button);
  return button;
}

function ensureEntry() {
  if (!studioVisible()) return;
  if (document.querySelector(`[${ENTRY_ATTR}]`)) return;
  const container = specialistContainer();
  if (!container) return;
  makeEntry(container);
}

export function installCodeWorkspaceEntry() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensureEntry();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true });
  const interval = window.setInterval(schedule, 1200);
  schedule();

  return () => {
    observer.disconnect();
    window.clearInterval(interval);
    document.querySelector(`[${ENTRY_ATTR}]`)?.remove();
  };
}
