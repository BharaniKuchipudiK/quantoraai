function appHeader() {
  return document.querySelector('.app-shell--studio .app-header');
}

function originalProfileButton() {
  const header = appHeader();
  return header?.querySelector('button[aria-controls="quantora-profile-menu"], button[aria-haspopup="dialog"]') || null;
}

function sidebarProfile() {
  return document.querySelector('[data-quantora-sidebar-profile]');
}

function positionMenu() {
  const menu = document.getElementById('quantora-profile-menu');
  const proxy = sidebarProfile();
  if (!menu || !proxy) return;
  const rect = proxy.getBoundingClientRect();
  const width = Math.min(320, Math.max(260, window.innerWidth - rect.right - 24));
  Object.assign(menu.style, {
    position: 'fixed',
    left: `${Math.min(window.innerWidth - width - 12, rect.right + 10)}px`,
    right: 'auto',
    top: 'auto',
    bottom: `${Math.max(12, window.innerHeight - rect.bottom)}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(220, Math.min(620, rect.bottom - 18))}px`,
    zIndex: '10000',
  });
}

function openRealProfileMenu() {
  const original = originalProfileButton();
  if (!original) return false;
  original.click();
  requestAnimationFrame(positionMenu);
  setTimeout(positionMenu, 40);
  return true;
}

/**
 * Preserve the real account/profile menu in the specialist sidebar.
 *
 * profile-personalization intentionally adds "Change profile picture" inside
 * the account menu. Its earlier sidebar capture shortcut accidentally replaced
 * the whole menu with the avatar chooser. Register this bridge first and stop
 * that shortcut only for the sidebar Profile entry.
 */
export function installProfileMenuBridge() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const onClickCapture = (event) => {
    const proxy = event.target?.closest?.('[data-quantora-sidebar-profile]');
    if (!proxy) return;
    if (!openRealProfileMenu()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onResize = () => positionMenu();
  document.addEventListener('click', onClickCapture, true);
  window.addEventListener('resize', onResize);

  return () => {
    document.removeEventListener('click', onClickCapture, true);
    window.removeEventListener('resize', onResize);
  };
}
