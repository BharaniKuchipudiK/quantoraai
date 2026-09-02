import { useCallback, useEffect, useState } from 'react';
import { getDesktopBridge } from '../lib/desktop-bridge.js';

/*
 * The desk panes' view of the desktop runtime: null on the website, or
 * { attached, root } plus an attach() that opens the host's folder picker.
 * One hook, so the terminal and git panes cannot disagree about whether a
 * folder is attached.
 */
export default function useDesktopRuntime() {
  const bridge = getDesktopBridge();
  const [state, setState] = useState(() => (bridge ? { attached: false, root: null, busy: false, error: '' } : null));

  const refresh = useCallback(async () => {
    if (!bridge) return;
    try {
      const info = await bridge.runtime.info();
      setState((prev) => ({ ...(prev || {}), attached: info?.attached === true, root: info?.root || null, busy: false, error: '' }));
    } catch (error) {
      setState((prev) => ({ ...(prev || {}), busy: false, error: error?.message || 'The desktop runtime did not answer.' }));
    }
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return undefined;
    let cancelled = false;
    refresh().catch(() => {});
    return () => { cancelled = true; void cancelled; };
  }, [bridge, refresh]);

  const attach = useCallback(async () => {
    if (!bridge) return;
    setState((prev) => ({ ...(prev || {}), busy: true, error: '' }));
    try {
      const info = await bridge.runtime.attach();
      setState((prev) => ({
        ...(prev || {}),
        attached: info?.attached === true,
        root: info?.root || null,
        busy: false,
        error: info?.error || '',
      }));
    } catch (error) {
      setState((prev) => ({ ...(prev || {}), busy: false, error: error?.message || 'Could not attach a folder.' }));
    }
  }, [bridge]);

  return { desktop: state, attach };
}
