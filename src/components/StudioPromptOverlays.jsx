import React from 'react';
import { Wand2 } from 'lucide-react';

/** Build-mode overlays above the prompt pill — refine bar and split restore only. */
export default function StudioPromptOverlays({
  refineActive,
  previewCode,
  isGenerating,
  buildSplitDismissed,
  onNewBuild,
  onOpenSplit,
}) {
  const hasPreview = Boolean(previewCode?.trim());

  return (
    <div className="studio-prompt-overlays">
      {refineActive && hasPreview && !isGenerating && (
        <div className="studio-edit-site-bar studio-prompt-dock">
          <Wand2 size={13} color="#f97316" />
          <span>Editing your site — describe changes below</span>
          <button type="button" onClick={onNewBuild}>New build</button>
        </div>
      )}

      {hasPreview && buildSplitDismissed && (
        <div className="studio-split-restore studio-prompt-dock">
          <button type="button" className="studio-split-restore__btn" onClick={onOpenSplit}>
            Open preview panel →
          </button>
        </div>
      )}
    </div>
  );
}
