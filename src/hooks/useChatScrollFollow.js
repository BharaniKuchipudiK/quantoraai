import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { setProgrammaticScrollActive, isProgrammaticScrollActive } from '../lib/programmatic-scroll.js';

const BOTTOM_THRESHOLD_PX = 96;
const SCROLL_EPSILON_PX = 3;

/**
 * Pin the message viewport to the latest turn while sending or streaming.
 * One coalesced scroll path — no IntersectionObserver/MutationObserver loops.
 */
export function useChatScrollFollow({
  viewportRef,
  threadRef,
  messages,
  isGenerating,
  streamingMessageId,
  activeSessionId,
}) {
  const followRef = useRef(true);
  const userPausedRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const scrollRafRef = useRef(null);

  const isNearBottom = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return true;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    return distance <= BOTTOM_THRESHOLD_PX;
  }, [viewportRef]);

  const scrollToBottom = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (userPausedRef.current) return;
    if (!followRef.current && !isGenerating) return;

    const target = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    if (Math.abs(viewport.scrollTop - target) <= SCROLL_EPSILON_PX) {
      lastScrollTopRef.current = viewport.scrollTop;
      return;
    }

    setProgrammaticScrollActive(true);
    viewport.scrollTop = target;
    lastScrollTopRef.current = target;

    requestAnimationFrame(() => {
      setProgrammaticScrollActive(false);
    });
  }, [viewportRef, isGenerating]);

  const scheduleScrollToBottom = useCallback(() => {
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      scrollToBottom();
    });
  }, [scrollToBottom]);

  const resumeFollow = useCallback(() => {
    followRef.current = true;
    userPausedRef.current = false;
  }, []);

  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollActive()) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const currentTop = viewport.scrollTop;
    const scrolledUp = currentTop < lastScrollTopRef.current - 4;
    lastScrollTopRef.current = currentTop;

    const nearBottom = isNearBottom();

    if (scrolledUp && !nearBottom) {
      userPausedRef.current = true;
      followRef.current = false;
      return;
    }

    if (nearBottom) {
      userPausedRef.current = false;
      followRef.current = true;
    }
  }, [isNearBottom, viewportRef]);

  useLayoutEffect(() => {
    followRef.current = true;
    userPausedRef.current = false;
    lastScrollTopRef.current = 0;
    scheduleScrollToBottom();
  }, [activeSessionId, scheduleScrollToBottom]);

  useLayoutEffect(() => {
    if (userPausedRef.current) return;
    if (isGenerating) followRef.current = true;
    scheduleScrollToBottom();
  }, [messages.length, isGenerating, streamingMessageId, scheduleScrollToBottom]);

  // Thread height grows while tokens stream — coalesce to one scroll per frame.
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread || messages.length <= 1) return undefined;

    let resizeRaf = null;
    const observer = new ResizeObserver(() => {
      if (userPausedRef.current) return;
      if (!followRef.current && !isGenerating) return;
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        scrollToBottom();
      });
    });

    observer.observe(thread);
    return () => {
      observer.disconnect();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
    };
  }, [threadRef, messages.length > 1, isGenerating, scrollToBottom]);

  useEffect(() => () => {
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    setProgrammaticScrollActive(false);
  }, []);

  return { resumeFollow, handleScroll };
}
