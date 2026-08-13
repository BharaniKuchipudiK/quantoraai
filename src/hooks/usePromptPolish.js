import { useCallback, useState } from 'react';

/**
 * Inline prompt polish — one job: turn rough words into a clear ask.
 * No review card, no full-screen loader. Undo + retry on failure.
 */
export function usePromptPolish({ availableModels, chooseBestFreeModel }) {
  const [isPolishing, setIsPolishing] = useState(false);
  const [undo, setUndo] = useState(null);
  const [error, setError] = useState(null);

  const clearPolish = useCallback(() => {
    setUndo(null);
    setError(null);
  }, []);

  const polish = useCallback(async (sourcePrompt, depth = 'auto') => {
    const source = (sourcePrompt || '').trim();
    if (!source) return null;

    setIsPolishing(true);
    setError(null);

    try {
      const res = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: source, depth }),
      });
      const data = await res.json();

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
    } catch {
      setError('Network error — check your connection and try again.');
      return null;
    } finally {
      setIsPolishing(false);
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
