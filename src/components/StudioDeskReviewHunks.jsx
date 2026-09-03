import React from 'react';

const REVIEW_LINE_COLOR = { hunk: '#38bdf8', add: '#22c55e', del: '#f87171' };

export function reviewLineKind(line = '') {
  const text = String(line || '');
  if (text.startsWith('@@')) return 'hunk';
  if (text.startsWith('+')) return 'add';
  if (text.startsWith('-')) return 'del';
  return 'ctx';
}

/**
 * Unified-diff hunks for a desk review row. Lives in Git, not the file tree —
 * the tree only names what changed.
 */
export default function StudioDeskReviewHunks({
  hunks = [],
  path = '',
  note = '',
  subtextColor,
}) {
  if (!Array.isArray(hunks) || hunks.length === 0) {
    return note ? (
      <div
        data-quantora-desk-review-note="true"
        style={{ padding: '0 8px 8px', fontSize: '0.62rem', color: subtextColor, lineHeight: 1.35 }}
      >
        {note}
      </div>
    ) : null;
  }

  return (
    <>
      <div
        data-quantora-desk-review-hunks="true"
        style={{
          margin: '0 4px 8px',
          padding: '6px 6px 4px',
          borderRadius: '6px',
          background: 'rgba(15,23,42,0.65)',
          border: '1px solid rgba(255,255,255,0.08)',
          overflowX: 'auto',
        }}
      >
        {hunks.map((hunk, hunkIndex) => (
          <pre
            key={`${path}-hunk-${hunkIndex}`}
            data-quantora-desk-review-hunk="true"
            style={{
              margin: hunkIndex ? '8px 0 0' : 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '0.58rem',
              lineHeight: 1.4,
              whiteSpace: 'pre',
            }}
          >
            {hunk.header ? (
              <div data-quantora-desk-review-line="hunk" style={{ color: REVIEW_LINE_COLOR.hunk }}>
                {hunk.header}
              </div>
            ) : null}
            {(hunk.lines || []).map((line, lineIndex) => {
              const kind = reviewLineKind(line);
              return (
                <div
                  key={`${path}-hunk-${hunkIndex}-${lineIndex}`}
                  data-quantora-desk-review-line={kind}
                  style={{ color: REVIEW_LINE_COLOR[kind] || subtextColor }}
                >
                  {line}
                </div>
              );
            })}
          </pre>
        ))}
      </div>
      {note ? (
        <div
          data-quantora-desk-review-note="true"
          style={{ padding: '0 8px 8px', fontSize: '0.62rem', color: subtextColor, lineHeight: 1.35 }}
        >
          {note}
        </div>
      ) : null}
    </>
  );
}
