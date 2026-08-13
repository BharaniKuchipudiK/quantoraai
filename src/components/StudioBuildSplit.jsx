import React, { useState } from 'react';
import { X, Maximize2, Code2, Eye } from 'lucide-react';
import LivePreviewCanvas from './LivePreviewCanvas';

/**
 * Split-pane build panel — chat left, preview or source code right (Cursor-style).
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
  const [activeTab, setActiveTab] = useState('preview');

  if (!code?.trim()) return null;

  const copyCode = () => {
    try {
      navigator.clipboard.writeText(code);
    } catch { /* best effort */ }
  };

  return (
    <div className={`studio-build-split${isLight ? ' is-light' : ''}`}>
      <div className="studio-build-split__header">
        <div className="studio-build-split__tabs" role="tablist" aria-label="Build panel">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'preview'}
            className={`studio-build-split__tab${activeTab === 'preview' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            <Eye size={14} /> Preview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'code'}
            className={`studio-build-split__tab${activeTab === 'code' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('code')}
          >
            <Code2 size={14} /> Code
          </button>
        </div>
        <div className="studio-build-split__actions">
          {activeTab === 'code' && (
            <button type="button" className="studio-build-split__btn studio-build-split__btn--text" onClick={copyCode}>
              Copy
            </button>
          )}
          {onExpand && activeTab === 'preview' && (
            <button type="button" className="studio-build-split__btn" onClick={onExpand} title="Expand preview">
              <Maximize2 size={15} />
            </button>
          )}
          {onClose && (
            <button type="button" className="studio-build-split__btn" onClick={onClose} title="Hide panel">
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="studio-build-split__body">
        {activeTab === 'preview' ? (
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
        ) : (
          <pre className="studio-build-split__code">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
