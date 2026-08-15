import React from 'react';
import { Wand2 } from 'lucide-react';

/** Slim feedback row — polish in progress, success with undo, or error with retry. */
export default function StudioWandStatus({
  isPolishing,
  undo,
  error,
  isLight,
  onUndo,
  onShorter,
  onMoreDetail,
  onRetry,
  onDismissError,
}) {
  if (!isPolishing && !undo && !error) return null;

  return (
    <div className={`studio-wand-status${isLight ? ' is-light' : ''}`} role="status" aria-live="polite">
      {isPolishing && (
        <span className="studio-wand-status__message">
          <Wand2 size={12} aria-hidden="true" />
          Polishing your prompt…
        </span>
      )}

      {!isPolishing && error && (
        <>
          <span className="studio-wand-status__message studio-wand-status__message--error">{error}</span>
          {onRetry && (
            <button type="button" className="studio-wand-status__action" onClick={onRetry}>
              Retry
            </button>
          )}
          {onDismissError && (
            <button type="button" className="studio-wand-status__action studio-wand-status__action--muted" onClick={onDismissError}>
              Dismiss
            </button>
          )}
        </>
      )}

      {!isPolishing && !error && undo && (
        <>
          <span className="studio-wand-status__message">
            Polished · {undo.tier}
          </span>
          {onUndo && (
            <button type="button" className="studio-wand-status__action" onClick={onUndo}>
              Undo
            </button>
          )}
          {onShorter && (
            <button type="button" className="studio-wand-status__action studio-wand-status__action--muted" onClick={onShorter}>
              Shorter
            </button>
          )}
          {onMoreDetail && (
            <button type="button" className="studio-wand-status__action studio-wand-status__action--muted" onClick={onMoreDetail}>
              More detail
            </button>
          )}
        </>
      )}
    </div>
  );
}
