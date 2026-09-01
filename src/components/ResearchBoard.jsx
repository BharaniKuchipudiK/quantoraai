import React, { useEffect, useMemo, useState } from 'react';

import { deriveResearchBrief } from '../lib/research-brief.js';
import { RESEARCH_BOARD_PREFILLS, RESEARCH_BOARD_PROMPTS } from '../lib/research-board-actions.js';
import { composeResearchBriefMarkdown, researchBriefFileName } from '../lib/research-brief-export.js';

/** Reason codes worth a human sentence; anything else gets the honest default. */
const UNVERIFIED_REASONS = {
  no_reachable_sources: 'none of the cited sources could be fetched',
  no_evidence_proposed: 'no passage in the cited sources was found for it',
  excerpt_not_in_source: 'the proposed evidence was not found verbatim in the source',
  evidence_proposal_failed: 'the evidence check could not run',
};

function standingLabel(result) {
  if (result.standing === 'supported') return 'Verified — supporting quote found in source';
  if (result.standing === 'contested') {
    return result.reasonCode === 'sources_disagree'
      ? 'Contested — verified sources disagree'
      : 'Contested — a cited source disagrees';
  }
  return `Unverified — ${UNVERIFIED_REASONS[result.reasonCode] || 'evidence could not be confirmed'}`;
}

/** One verified quote, attributed. Disagreements render two of these, labeled. */
function EvidenceQuote({ label, excerpt, sourceUrl }) {
  return (
    <div
      style={{
        marginTop: '5px',
        paddingLeft: '8px',
        borderLeft: '2px solid var(--q-border)',
        fontSize: '0.71rem',
        fontWeight: 400,
        lineHeight: 1.45,
        fontStyle: 'italic',
      }}
    >
      {label ? <span style={{ fontStyle: 'normal', fontWeight: 700 }}>{label} </span> : null}
      “{excerpt}”
      {sourceUrl ? (
        <>
          {' — '}
          <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
            source
          </a>
        </>
      ) : null}
    </div>
  );
}

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
export default function ResearchBoard({ messages, onAsk, onSend, onAppendMessages, signedIn, onRequireAuth }) {
  const brief = useMemo(() => deriveResearchBrief({ messages }), [messages]);
  const [verifying, setVerifying] = useState(false);
  const [diving, setDiving] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  // Watched questions for this account; null until the list answers, so a
  // slow or failed lookup never renders a wrong watch state.
  const [watches, setWatches] = useState(null);
  // Keyed by finding text — the finding's identity across brief re-derives.
  const [standings, setStandings] = useState({});

  /*
   * The desk's differentiator: fetch what this dossier actually cited and
   * make each finding's evidence prove itself. The server grants a standing
   * only when the proposed quote exists verbatim in the fetched source —
   * so "Verified" here means provenance, and the badge wording says so.
   */
  const runVerify = async () => {
    if (!signedIn) {
      onRequireAuth?.();
      return;
    }
    const claims = brief.findings.slice(0, 8).map((finding, index) => ({
      id: `c${index}`,
      text: finding.text,
    }));
    const sourceSet = [];
    for (const finding of brief.findings) {
      for (const uri of finding.sourceUris || []) {
        if (!sourceSet.includes(uri) && sourceSet.length < 6) sourceSet.push(uri);
      }
    }
    if (claims.length === 0 || sourceSet.length === 0) return;
    setVerifying(true);
    setVerifyError('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'research-verify',
          studioDomain: 'research',
          claims,
          sources: sourceSet,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setVerifyError(data.error || 'The evidence check is unavailable right now.');
        return;
      }
      const next = {};
      for (const result of Array.isArray(data.results) ? data.results : []) {
        const index = Number(String(result.claimId || '').replace(/^c/, ''));
        const finding = claims[index] ? brief.findings[index] : null;
        if (finding) next[finding.text] = result;
      }
      setStandings(next);
    } catch {
      setVerifyError('The evidence check could not run. Try again in a moment.');
    } finally {
      setVerifying(false);
    }
  };

  const watchRequest = async (op, question) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'research-watch', studioDomain: 'research', op, question }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The watch service is unavailable right now.');
    return data;
  };

  // Hooks stay above the inactive-board return so their order never shifts.
  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    watchRequest('list')
      .then((data) => { if (!cancelled) setWatches(Array.isArray(data.watches) ? data.watches : []); })
      .catch(() => { /* unknown watch state stays unknown — no wrong badges */ });
    return () => { cancelled = true; };
  }, [signedIn]);

  const currentWatch = Array.isArray(watches)
    ? watches.find((watch) => watch.question === brief.question)
    : null;

  const runWatchOp = async (op) => {
    if (!signedIn) {
      onRequireAuth?.();
      return;
    }
    setVerifyError('');
    try {
      await watchRequest(op, brief.question);
      const data = await watchRequest('list');
      setWatches(Array.isArray(data.watches) ? data.watches : []);
    } catch (err) {
      setVerifyError(err?.message || 'The watch service is unavailable right now.');
    }
  };

  // Nothing to show until the analyst has actually asked something.
  if (!brief.active) return null;

  const answered = brief.groundedTurns + brief.ungroundedTurns > 0;
  const shownSources = brief.sources.slice(0, 8);
  const hiddenSourceCount = brief.sources.length - shownSources.length;

  const busy = verifying || diving;
  const chip = (label, onActivate, { enabled = true, busyLabel = null, busyWhen = false } = {}) => (
    <button
      key={label}
      type="button"
      disabled={!enabled || busy}
      onClick={onActivate}
      className="q-mono-control q-mono-chip"
      style={{
        border: '1px solid var(--q-border)',
        background: 'var(--q-paper)',
        color: 'var(--q-ink)',
        borderRadius: '999px',
        padding: '6px 11px',
        fontSize: '0.76rem',
        fontWeight: 700,
        cursor: enabled && !busy ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.4,
      }}
    >
      {busyLabel && busyWhen ? busyLabel : label}
    </button>
  );
  const askChip = (label, prompt) => chip(label, () => onSend?.(prompt));

  /*
   * The dossier leaves as a file: deterministic markdown of exactly what the
   * board shows — findings with their standings and verified quotes, the
   * plan, the source ledger. No model touches the export.
   */
  const exportBrief = () => {
    const markdown = composeResearchBriefMarkdown({ brief, standings });
    if (!markdown) return;
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = researchBriefFileName(brief.question);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /*
   * Chip prompts live in research-board-actions.js under a tested contract:
   * every steering prompt carries the marker deriveResearchBrief filters on,
   * so a chip turn can never replace the research question.
   */
  /*
   * The dive decomposes the question server-side and comes back as canonical
   * transcript messages; appending them is all the client does — the board
   * derives plan, findings and sources through the same machinery as any
   * hand-typed turn.
   */
  const runDeepDive = async () => {
    if (!signedIn) {
      onRequireAuth?.();
      return;
    }
    setDiving(true);
    setVerifyError('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'research-deep-dive',
          studioDomain: 'research',
          question: brief.question,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setVerifyError(data.error || 'The deep dive is unavailable right now.');
        return;
      }
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        onAppendMessages?.(data.messages);
      }
    } catch {
      setVerifyError('The deep dive could not run. Try again in a moment.');
    } finally {
      setDiving(false);
    }
  };

  const chips = [];
  if (brief.plan.length === 0 && onAppendMessages) {
    chips.push(chip('Deep dive', runDeepDive, { busyLabel: 'Diving…', busyWhen: diving }));
  }
  if (brief.groundedTurns === 0 && answered) {
    chips.push(askChip('Get sources', RESEARCH_BOARD_PROMPTS.getSources));
  }
  if (brief.findings.length > 0) {
    chips.push(chip('Verify evidence', runVerify, { busyLabel: 'Verifying…', busyWhen: verifying }));
    chips.push(askChip('Counter-evidence', RESEARCH_BOARD_PROMPTS.counterEvidence));
  }
  if (brief.sources.length > 0) {
    chips.push(askChip('Cross-check', RESEARCH_BOARD_PROMPTS.crossCheck));
  }
  if (brief.findings.length > 0) {
    chips.push(askChip('Draft the brief', RESEARCH_BOARD_PROMPTS.draftBrief));
    chips.push(chip('Export brief', exportBrief));
  }
  /*
   * Watching is offered only once the list has answered, so the chip can
   * never contradict the account's real watch state.
   */
  if (signedIn && Array.isArray(watches)) {
    chips.push(currentWatch
      ? chip('Unwatch', () => runWatchOp('delete'))
      : chip('Watch this question', () => runWatchOp('create')));
  }
  if (chips.length === 0) {
    chips.push(askChip('Go deeper', RESEARCH_BOARD_PROMPTS.goDeeper));
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
      {brief.plan.length > 0 ? (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {/*
            The question, decomposed. An open sub-question is a chip — click
            it and the desk pursues it; the brief marks it explored when the
            reply lands. An explored one collapses to a quiet line: the work
            is in the findings, not here.
          */}
          {brief.plan.map((item) => (item.explored ? (
            <div key={item.text} style={{ fontSize: '0.73rem', fontWeight: 400, opacity: 0.65 }}>
              ✓ {item.text}
            </div>
          ) : (
            <div key={item.text}>
              {chip(item.text, () => onSend?.(item.text))}
            </div>
          )))}
        </div>
      ) : null}
      {brief.findings.length > 0 ? (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {brief.findings.map((finding) => {
            const standing = standings[finding.text];
            return (
              <div
                key={finding.text}
                style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--q-border)' }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.45 }}>
                  {finding.text}
                </div>
                <div style={{ fontSize: '0.7rem', fontWeight: 400, marginTop: '2px', opacity: 0.75 }}>
                  {standing
                    ? standingLabel(standing)
                    : `Backed by that reply's ${finding.sourceCount} live source${finding.sourceCount === 1 ? '' : 's'}`}
                </div>
                {standing?.excerpt ? (
                  <EvidenceQuote
                    label={standing.counter ? 'Supports:' : null}
                    excerpt={standing.excerpt}
                    sourceUrl={standing.sourceUrl}
                  />
                ) : null}
                {standing?.counter ? (
                  <EvidenceQuote
                    label="Disagrees:"
                    excerpt={standing.counter.excerpt}
                    sourceUrl={standing.counter.sourceUrl}
                  />
                ) : null}
              </div>
            );
          })}
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
      {currentWatch?.changed ? (
        <div
          style={{
            marginTop: '10px',
            padding: '8px 10px',
            borderRadius: '10px',
            border: '1px solid var(--q-ink)',
            fontSize: '0.75rem',
          }}
        >
          <div style={{ fontWeight: 700 }}>The evidence moved since your last check</div>
          {currentWatch.changeNote ? (
            <div style={{ fontWeight: 400, marginTop: '2px' }}>{currentWatch.changeNote}</div>
          ) : null}
          <div style={{ marginTop: '7px' }}>
            {chip('Dismiss', () => runWatchOp('ack'))}
          </div>
        </div>
      ) : currentWatch ? (
        <div style={{ marginTop: '9px', fontSize: '0.72rem', opacity: 0.7 }}>
          Watching — re-checked daily against live sources.
        </div>
      ) : null}
      {brief.next ? (
        <div style={{ marginTop: '9px', fontSize: '0.74rem' }}>{brief.next}</div>
      ) : null}
      {verifyError ? (
        <div style={{ marginTop: '9px', fontSize: '0.76rem', fontWeight: 700 }}>{verifyError}</div>
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
        {onAsk ? chip('Narrow it', () => onAsk(RESEARCH_BOARD_PREFILLS.narrow)) : null}
      </div>
    </div>
  );
}
