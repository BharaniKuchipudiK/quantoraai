import { useCallback, useEffect, useRef, useState } from 'react';
import { isProgrammaticScrollActive } from '../lib/programmatic-scroll.js';

const SCROLLABLE = '.ai-studio-messages, .app-main--studio, .app-main';

/**
 * Hides the app header while the user scrolls down in workspace content;
 * reveals on scroll up, pointer near the top edge, or Escape.
 */
export function useAutoHideHeader(enabled, { blocked = false } = {}) {
  const [hidden, setHidden] = useState(false);
  const scrollMapRef = useRef(new WeakMap());

  const show = useCallback(() => setHidden(false), []);
  const hide = useCallback(() => setHidden(true), []);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return undefined;
    }
    setHidden(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const onWheel = (event) => {
      if (blocked) return;
      if (event.deltaY > 12) hide();
      else if (event.deltaY < -12) show();
    };

    const onScroll = (event) => {
      if (blocked) return;
      if (isProgrammaticScrollActive()) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches?.(SCROLLABLE) && !target.closest?.(SCROLLABLE)) return;

      const scrollEl = target.matches(SCROLLABLE) ? target : target.closest(SCROLLABLE);
      if (!(scrollEl instanceof HTMLElement)) return;

      const prev = scrollMapRef.current.get(scrollEl) ?? scrollEl.scrollTop;
      const next = scrollEl.scrollTop;
      scrollMapRef.current.set(scrollEl, next);

      if (next > prev + 6) hide();
      else if (next < prev - 6) show();
    };

    const onMouseMove = (event) => {
      if (event.clientY <= 36) show();
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') show();
    };

    window.addEventListener('wheel', onWheel, { passive: true, capture: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true });
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, blocked, hide, show]);

  return { hidden, show, hide };
}
