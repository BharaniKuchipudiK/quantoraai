/*
 * The web app's view of the desktop host.
 *
 * On the website this returns null and nothing changes. Inside Quantora
 * Desktop the preload exposes window.quantoraDesktop; the app uses it for
 * exactly two things today — starting a browser sign-in (Google's widget
 * cannot run on quantora://app) and dropping the stored session on logout.
 */
import { DESKTOP_BRIDGE_KEY, isDesktopBridge } from '../../shared/desktop-bridge-contract.js';

export function getDesktopBridge(scope = typeof window !== 'undefined' ? window : undefined) {
  const candidate = scope ? scope[DESKTOP_BRIDGE_KEY] : undefined;
  return isDesktopBridge(candidate) ? candidate : null;
}
