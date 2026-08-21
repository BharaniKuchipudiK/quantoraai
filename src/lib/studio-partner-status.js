/**
 * Partner-status copy for Studio: what just happened, and what to do next.
 * This is the Cursor-style "human progress" line — not a chatbot spinner.
 */

export function resolveStudioPartnerStatus({
  isGenerating = false,
  generatingLabel = '',
  elapsedSec = 0,
  lastAiIsError = false,
  hasPreview = false,
  continueLabel = '',
  lastAiText = '',
  hasUserTurn = false,
} = {}) {
  const clock = `0:${String(Math.max(0, Number(elapsedSec) || 0)).padStart(2, '0')}`;

  if (isGenerating) {
    return {
      now: generatingLabel || 'Working on a result you can actually use…',
      next: hasPreview
        ? `Preview stays open while this updates. ${clock}`
        : `Hang tight — it appears in Preview when it can run. ${clock}`,
    };
  }

  if (lastAiIsError) {
    return {
      now: 'That turn did not finish.',
      next: 'Retry, or tell me what to try instead.',
    };
  }

  if (hasPreview) {
    return {
      now: 'You have a working preview of what we just built.',
      next: continueLabel
        ? `Next: ${continueLabel}. Or say what to change.`
        : 'Next: tweak it, add anything the business still needs, or publish when you are ready.',
    };
  }

  if (lastAiText && hasUserTurn) {
    return {
      now: 'Answered in chat. There is no runnable preview yet.',
      next: continueLabel || 'Ask me to build a working page if that is the outcome you want.',
    };
  }

  return null;
}
