import React from 'react';
import { X, Maximize2 } from 'lucide-react';
import LivePreviewCanvas from './LivePreviewCanvas';

/**
 * Split-pane live preview — chat on the left, site preview on the right (Cursor-style).
 */
export default function StudioBuildSplit({
  code,
  isLight,
  onClose,
  onExpand,
  user,
  onRequireAuth,
  onPublishComplete,
  onShareComplete,
  suggestedProjectName,
}) {
  if (!code?.trim()) return null;

  return (
    <div className={`studio-build-split${isLight ? ' is-light' : ''}`}>
      <div className="studio-build-split__header">
        <span className="studio-build-split__title">Live Preview</span>
        <div className="studio-build-split__actions">
          {onExpand && (
            <button type="button" className="studio-build-split__btn" onClick={onExpand} title="Expand preview">
              <Maximize2 size={15} />
            </button>
          )}
          {onClose && (
            <button type="button" className="studio-build-split__btn" onClick={onClose} title="Hide preview panel">
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="studio-build-split__body">
        <LivePreviewCanvas
          code={code}
          isLight={isLight}
          hideHeader
          user={user}
          onRequireAuth={onRequireAuth}
          suggestedProjectName={suggestedProjectName}
          onPublishComplete={onPublishComplete}
          onShareComplete={onShareComplete}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
