import React, { useMemo } from 'react';

import { deriveResearchBrief } from '../lib/research-brief.js';

/**
 * One research dossier: the question, the findings, and — the part a chat
 * transcript loses — where every one of them came from. Does not browse or
 * fetch on its own; the chips steer the conversation, and the conversation is
 * what does the work.
 *
 * The board reads the transcript itself (deriveResearchBrief), the same
 * pattern as the trip board: the server appends a numbered Sources block to
 * every grounded reply, so the evidence trail already lives in the messages.
 *
 * The standing line is the point of this desk. An answer with live sources
 * behind it and an answer from model memory look identical in a chat bubble;
 * here they are counted apart, and a board with zero grounded answers says so
 * instead of dressing up. Every row is conditional — a fully dark
 * investigation collapses to the question and one row of chips.
 *
 * Monochrome (Quantora design system): tokens flip on [data-theme], hierarchy
 * is type, space and border. No accent colours, no isLight prop.
 */
export default function ResearchBoard({ messages, onAsk, onSend }) {
  const brief = useMemo(() => deriveResearchBrief({ messages }), [messages]);

  // Nothing to show until the analyst has actually asked something.
  if (!brief.active) return null;

  const answered = brief.groundedTurns + brief.ungroundedTurns > 0;
  const shownSources = brief.sources.slice(0, 8);
  const hiddenSourceCount = brief.sources.length - shownSources.length;

  const chip = (label, prompt, { prefill = false } = {}) => (
    <button
      key={label}
      type="button"
      onClick={() => (prefill ? onAsk?.(prompt) : onSend?.(prompt))}
      className="q-mono-control q-mono-chip"
      style={{
        border: '1px solid var(--q-border)',
        background: 'var(--q-paper)',
        color: 'var(--q-ink)',
        borderRadius: '999px',
        padding: '6px 11px',
        fontSize: '0.76rem',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  /*
   * Every chip prompt names "this board" — deriveResearchBrief uses that
   * marker to keep chip turns from replacing the research question.
   */
  const chips = [];
  if (brief.groundedTurns === 0 && answered) {
    chips.push(chip('Get sources', 'Re-answer the question on this board using live web sources, and cite them.'));
  }
  if (brief.findings.length > 0) {
    chips.push(chip('Counter-evidence', 'Find credible counter-evidence to the findings on this board, with live sources.'));
  }
  if (brief.sources.length > 0) {
    chips.push(chip('Cross-check', 'Cross-check the findings on this board against publishers not already in its source ledger, with live sources.'));
  }
  if (brief.findings.length > 0) {
    chips.push(chip('Draft the brief', 'Draft a concise research brief from the findings and sources on this board, clearly marking anything that is still unverified.'));
  }
  if (chips.length === 0) {
    chips.push(chip('Go deeper', 'Investigate the question on this board using live web sources, and cite them.'));
  }

  return (
    <div
      data-quantora-research-board="true"
      data-quantora-workspace-capabilities="research"
      style={{
        marginTop: '10px',
        border: '1px solid var(--q-border)',
        borderRadius: '14px',
        padding: '12px 14px',
        textAlign: 'left',
        background: 'var(--q-paper)',
        color: 'var(--q-ink)',
      }}
    >
      <div style={{ fontSize: '0.86rem', fontWeight: 800, letterSpacing: '0.01em' }}>
        {brief.question}
      </div>
      {answered ? (
        <div style={{ fontSize: '0.72rem', fontWeight: 400, marginTop: '3px' }}>
          {brief.groundedTurns > 0
            ? `${brief.groundedTurns} answer${brief.groundedTurns === 1 ? '' : 's'} backed by live sources`
            : 'No answer here is backed by live sources yet'}
          {brief.ungroundedTurns > 0 && brief.groundedTurns > 0
            ? ` · ${brief.ungroundedTurns} unverified`
            : ''}
        </div>
      ) : null}
      {brief.findings.length > 0 ? (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {brief.findings.map((finding) => (
            <div
              key={finding.text}
              style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--q-border)' }}
            >
              <div style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.45 }}>
                {finding.text}
              </div>
              <div style={{ fontSize: '0.7rem', fontWeight: 400, marginTop: '2px', opacity: 0.75 }}>
                {`Backed by that reply's ${finding.sourceCount} live source${finding.sourceCount === 1 ? '' : 's'}`}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {shownSources.length > 0 ? (
        <div
          style={{
            borderTop: '1px solid var(--q-border)',
            marginTop: '10px',
            paddingTop: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {shownSources.map((source) => (
            <div key={source.uri} style={{ fontSize: '0.73rem', fontWeight: 400 }}>
              <a href={source.uri} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 700 }}>
                {source.host || source.title}
              </a>
              {source.host && source.title && source.title !== source.host ? ` — ${source.title}` : ''}
              {source.citedInTurns > 1 ? ` · cited in ${source.citedInTurns} answers` : ''}
            </div>
          ))}
          {hiddenSourceCount > 0 ? (
            <div style={{ fontSize: '0.7rem', fontWeight: 400, opacity: 0.75 }}>
              {`+${hiddenSourceCount} more source${hiddenSourceCount === 1 ? '' : 's'} in the conversation`}
            </div>
          ) : null}
        </div>
      ) : null}
      {brief.next ? (
        <div style={{ marginTop: '9px', fontSize: '0.74rem' }}>{brief.next}</div>
      ) : null}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '7px',
          borderTop: '1px solid var(--q-border)',
          marginTop: '10px',
          paddingTop: '10px',
        }}
      >
        {chips}
        {onAsk ? chip('Narrow it', 'Narrow this down to ', { prefill: true }) : null}
      </div>
    </div>
  );
}
