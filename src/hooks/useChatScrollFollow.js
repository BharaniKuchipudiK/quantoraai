import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const BOTTOM_THRESHOLD_PX = 96;

/**
 * Keeps the studio message viewport pinned to the latest turn while the user
 * is sending, streaming, or reading near the bottom.
 *
 * Three mechanisms work together:
 * 1. useLayoutEffect on message/generation changes (post-paint scroll)
 * 2. ResizeObserver on the thread (markdown/streaming height growth)
 * 3. IntersectionObserver sentinel (corrects drift if scroll falls behind)
 */
export function useChatScrollFollow({
  viewportRef,
  threadRef,
  endRef,
  messages,
  isGenerating,
  streamingMessageId,
  activeSessionId,
}) {
  const followRef = useRef(true);
  const userPausedRef = useRef(false);
  const programmaticRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const rafRef = useRef(null);

  const tailSignature = messages.length
    ? `${messages[messages.length - 1]?.id}:${messages[messages.length - 1]?.text?.length ?? 0}`
    : 'empty';

  const distanceFromBottom = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return 0;
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  }, [viewportRef]);

  const scrollToBottom = useCallback((behavior = 'auto') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (userPausedRef.current) return;
    if (!followRef.current && !isGenerating) return;

    programmaticRef.current = true;
    const target = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

    if (behavior === 'smooth') {
      viewport.scrollTo({ top: target, behavior: 'smooth' });
    } else {
      viewport.scrollTop = target;
    }

    lastScrollTopRef.current = viewport.scrollTop;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        programmaticRef.current = false;
        rafRef.current = null;
      });
    });
  }, [viewportRef, isGenerating]);

  const resumeFollow = useCallback(() => {
    followRef.current = true;
    userPausedRef.current = false;
  }, []);

  const handleScroll = useCallback(() => {
    if (programmaticRef.current) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const currentTop = viewport.scrollTop;
    const scrolledUp = currentTop < lastScrollTopRef.current - 4;
    lastScrollTopRef.current = currentTop;

    const nearBottom = distanceFromBottom() <= BOTTOM_THRESHOLD_PX;

    if (scrolledUp && !nearBottom) {
      userPausedRef.current = true;
      followRef.current = false;
      return;
    }

    if (nearBottom) {
      userPausedRef.current = false;
      followRef.current = true;
    }
  }, [distanceFromBottom, viewportRef]);

  useLayoutEffect(() => {
    followRef.current = true;
    userPausedRef.current = false;
    lastScrollTopRef.current = 0;
    scrollToBottom('auto');
  }, [activeSessionId, scrollToBottom]);

  useLayoutEffect(() => {
    if (userPausedRef.current) return;
    if (isGenerating) followRef.current = true;
    scrollToBottom('auto');
  }, [messages, isGenerating, streamingMessageId, tailSignature, scrollToBottom]);

  useEffect(() => {
    const thread = threadRef.current;
    const viewport = viewportRef.current;
    if (!thread || !viewport) return undefined;

    const onSizeChange = () => {
      if (userPausedRef.current) return;
      if (!followRef.current && !isGenerating) return;
      scrollToBottom('auto');
    };

    const resizeObserver = new ResizeObserver(onSizeChange);
    resizeObserver.observe(thread);
    resizeObserver.observe(viewport);

    return () => resizeObserver.disconnect();
  }, [threadRef, viewportRef, isGenerating, messages.length > 1, scrollToBottom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const sentinel = endRef?.current;
    if (!viewport || !sentinel || messages.length <= 1) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) return;
        if (userPausedRef.current) return;
        if (!followRef.current && !isGenerating) return;
        scrollToBottom('auto');
      },
      { root: viewport, threshold: 0, rootMargin: '0px 0px 48px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [endRef, viewportRef, isGenerating, messages.length, tailSignature, scrollToBottom]);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      if (!userPausedRef.current && (followRef.current || isGenerating)) {
        scrollToBottom('auto');
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-header-hidden'] });
    return () => observer.disconnect();
  }, [scrollToBottom, isGenerating]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return { resumeFollow, scrollToBottom, handleScroll };
}
