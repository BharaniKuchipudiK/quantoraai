import React from 'react';
import { FileCode } from 'lucide-react';
import { listStudioFiles, studioFileLabel } from '../lib/studio-file-tree.js';
import { checkState } from '../lib/studio-desk-criteria.js';

const PROBE_MARK = { ok: 'ok', fix: 'fix', unverified: '?' };
const REVIEW_LINE_COLOR = { hunk: '#38bdf8', add: '#22c55e', del: '#f87171' };

function reviewLineKind(line = '') {
  const text = String(line || '');
  if (text.startsWith('@@')) return 'hunk';
  if (text.startsWith('+')) return 'add';
  if (text.startsWith('-')) return 'del';
  return 'ctx';
}

export default function StudioFileTree({
  vfs,
  activePath,
  onSelect,
  isLight,
  textColor,
  subtextColor,
  review = [],
  probes = [],
  nextBeat = '',
  job = null,
  width = 212,
}) {
  const files = listStudioFiles(vfs);
  const jobPurpose = typeof job?.purpose === 'string' ? job.purpose : '';
  const paneWidth = Math.max(120, Number(width) || 212);

  return (
    <div
      data-quantora-file-tree="true"
      style={{
        width: `${paneWidth}px`,
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
        borderRight: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)',
        background: isLight ? '#f8fafc' : '#070913',
        padding: '8px 6px',
      }}
    >
      <div style={{
        fontSize: '0.65rem',
        fontWeight: 800,
        letterSpacing: '0.06em',
        color: subtextColor,
        padding: '4px 8px 8px',
        textTransform: 'uppercase',
      }}
      >
        Files
      </div>
      {jobPurpose ? (
        <div
          data-quantora-desk-job-panel="true"
          style={{
            margin: '0 4px 8px',
            padding: '8px',
            borderRadius: '8px',
            background: isLight ? '#fff7ed' : 'rgba(249,115,22,0.08)',
            border: isLight ? '1px solid #fed7aa' : '1px solid rgba(249,115,22,0.25)',
          }}
        >
          <div style={{
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: subtextColor,
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}
          >
            Job
          </div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: textColor, lineHeight: 1.35 }}>
            {jobPurpose}
          </div>
          {Array.isArray(job?.mustWork) && job.mustWork[0] ? (
            <div style={{ fontSize: '0.65rem', color: subtextColor, marginTop: '4px', lineHeight: 1.35 }}>
              {job.mustWork[0]}
            </div>
          ) : null}
        </div>
      ) : null}
      {Array.isArray(review) && review.length > 0 ? (
        <div data-quantora-desk-review="true" style={{ padding: '8px 4px 6px' }}>
          <div style={{
            fontSize: '0.65rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: subtextColor,
            padding: '4px 8px 6px',
            textTransform: 'uppercase',
          }}
          >
            Review
          </div>
          {review.map((row) => (
            <div key={`review-${row.path}`}>
              <button
                type="button"
                data-quantora-desk-review-file={row.path}
                onClick={() => onSelect(row.path)}
                title={row.path}
                style={rowStyle(activePath === row.path, isLight, textColor, subtextColor)}
              >
                <FileCode size={12} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {studioFileLabel(row.path)}
                </span>
                {row.exact === false ? (
                  <span style={{ fontSize: '0.62rem', color: subtextColor, flexShrink: 0 }}>changed</span>
                ) : (
                  <span style={{ fontSize: '0.62rem', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {row.added ? <span style={{ color: '#22c55e' }}>+{row.added}</span> : null}
                    {row.added && row.removed ? ' ' : null}
                    {row.removed ? <span style={{ color: '#f87171' }}>−{row.removed}</span> : null}
                  </span>
                )}
              </button>
              {Array.isArray(row.hunks) && row.hunks.length > 0 ? (
                <div
                  data-quantora-desk-review-hunks="true"
                  style={{
                    margin: '0 4px 8px',
                    padding: '6px 6px 4px',
                    borderRadius: '6px',
                    background: isLight ? '#fff' : 'rgba(15,23,42,0.65)',
                    border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)',
                    overflowX: 'auto',
                  }}
                >
                  {row.hunks.map((hunk, hunkIndex) => (
                    <pre
                      key={`${row.path}-hunk-${hunkIndex}`}
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
                        <div data-quantora-desk-review-line="hunk" style={{ color: '#38bdf8' }}>
                          {hunk.header}
                        </div>
                      ) : null}
                      {(hunk.lines || []).map((line, lineIndex) => {
                        const kind = reviewLineKind(line);
                        return (
                          <div
                            key={`${row.path}-hunk-${hunkIndex}-${lineIndex}`}
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
              ) : null}
              {row.note ? (
                <div
                  data-quantora-desk-review-note="true"
                  style={{ padding: '0 8px 8px', fontSize: '0.62rem', color: subtextColor, lineHeight: 1.35 }}
                >
                  {row.note}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {Array.isArray(probes) && probes.length > 0 ? (
        <div data-quantora-desk-probes="true" style={{ padding: '4px 4px 10px' }}>
          <div style={{
            fontSize: '0.65rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: subtextColor,
            padding: '4px 8px 6px',
            textTransform: 'uppercase',
          }}
          >
            Preview checks
          </div>
          {probes.map((check) => {
            const state = checkState(check);
            return (
              <div
                key={`probe-${check.id}`}
                data-quantora-desk-probe={check.id}
                data-quantora-desk-probe-ok={state === 'ok' ? 'true' : 'false'}
                data-quantora-desk-probe-state={state}
                style={{
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'flex-start',
                  padding: '4px 8px',
                  fontSize: '0.68rem',
                  lineHeight: 1.35,
                  color: state === 'ok' ? textColor : (state === 'unverified' ? subtextColor : (isLight ? '#b45309' : '#fbbf24')),
                }}
              >
                <span style={{ flexShrink: 0, fontWeight: 800 }}>{PROBE_MARK[state]}</span>
                <span>{check.label}</span>
              </div>
            );
          })}
          {nextBeat ? (
            <div
              data-quantora-desk-next="true"
              style={{ padding: '4px 8px 0', fontSize: '0.65rem', color: subtextColor, lineHeight: 1.35 }}
            >
              Next: {nextBeat}
            </div>
          ) : null}
        </div>
      ) : null}
      {files.length === 0 ? (
        <div style={{ padding: '10px 8px', fontSize: '0.72rem', color: subtextColor, lineHeight: 1.45 }}>
          No files yet. Ask me to build something.
        </div>
      ) : files.map((path) => (
        <button
          key={path}
          type="button"
          onClick={() => onSelect(path)}
          title={path}
          style={rowStyle(activePath === path, isLight, textColor, subtextColor)}
        >
          <FileCode size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {studioFileLabel(path)}
          </span>
        </button>
      ))}
    </div>
  );
}

function rowStyle(active, isLight, textColor, subtextColor) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    borderRadius: '8px',
    padding: '7px 8px',
    marginBottom: '2px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: active ? 700 : 500,
    color: active ? '#f97316' : textColor,
    background: active
      ? (isLight ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.12)')
      : 'transparent',
  };
}
