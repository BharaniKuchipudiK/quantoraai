import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Inline prompt polish — one job: turn rough words into a clear ask.
 * No review card, no full-screen loader. Undo + retry on failure.
 */
export function usePromptPolish({ availableModels, chooseBestFreeModel }) {
  const [isPolishing, setIsPolishing] = useState(false);
  const [undo, setUndo] = useState(null);
  const [error, setError] = useState(null);
  const requestRef = useRef({ id: 0, controller: null });

  const clearPolish = useCallback(() => {
    requestRef.current.controller?.abort();
    requestRef.current = { id: requestRef.current.id + 1, controller: null };
    setIsPolishing(false);
    setUndo(null);
    setError(null);
  }, []);

  useEffect(() => () => {
    requestRef.current.controller?.abort();
    requestRef.current = { id: requestRef.current.id + 1, controller: null };
  }, []);

  const polish = useCallback(async (sourcePrompt, depth = 'auto') => {
    const source = (sourcePrompt || '').trim();
    if (!source) return null;

    requestRef.current.controller?.abort();
    const requestId = requestRef.current.id + 1;
    const controller = new AbortController();
    requestRef.current = { id: requestId, controller };
    setIsPolishing(true);
    setError(null);

    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: source, depth }),
        signal: controller.signal,
      });
      const data = await res.json();

      if (requestRef.current.id !== requestId) return null;

      if (!res.ok || !data.enhancedPrompt) {
        const message = data.error || 'Could not polish your prompt. Try again.';
        setError(message);
        return null;
      }

      let model = null;
      try {
        model = chooseBestFreeModel(availableModels, data.enhancedPrompt)?.model || null;
      } catch {
        model = null;
      }

      const result = {
        original: source,
        prompt: data.enhancedPrompt,
        tier: data.tier || 'Enrich',
        model,
      };
      setUndo(result);
      return result;
    } catch (requestError) {
      if (requestError?.name === 'AbortError' || requestRef.current.id !== requestId) {
        return null;
      }
      setError('Network error — check your connection and try again.');
      return null;
    } finally {
      if (requestRef.current.id === requestId) {
        requestRef.current = { id: requestId, controller: null };
        setIsPolishing(false);
      }
    }
  }, [availableModels, chooseBestFreeModel]);

  return {
    isPolishing,
    undo,
    error,
    polish,
    clearPolish,
    setError,
  };
}
