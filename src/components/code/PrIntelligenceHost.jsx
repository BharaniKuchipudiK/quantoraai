import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ExternalLink,
  FileCode2,
  GitCompare,
  GitPullRequest,
  Lightbulb,
  Loader2,
  LockKeyhole,
  RefreshCw,
  SearchCode,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';

const PANEL_ATTR = 'data-quantora-pr-intelligence';
const ENTRY_ATTR = 'data-quantora-pr-review-entry';

const severityOrder = { blocker: 0, risk: 1, nudge: 2, opportunity: 3 };
const severityMeta = {
  blocker: { label: 'Blocker', icon: ShieldAlert, color: '#fca5a5', bg: 'rgba(239,68,68,.10)', border: 'rgba(239,68,68,.24)' },
  risk: { label: 'Risk', icon: AlertTriangle, color: '#fdba74', bg: 'rgba(249,115,22,.09)', border: 'rgba(249,115,22,.22)' },
  nudge: { label: 'Nudge', icon: CircleDot, color: '#c4b5fd', bg: 'rgba(139,92,246,.08)', border: 'rgba(139,92,246,.20)' },
  opportunity: { label: 'Opportunity', icon: Lightbulb, color: '#67e8f9', bg: 'rgba(6,182,212,.08)', border: 'rgba(6,182,212,.20)' },
};

function useCodeWorkspaceVisible() {
  const [visible, setVisible] = useState(() => typeof document !== 'undefined' && Boolean(document.querySelector('[data-quantora-code-workspace="true"]')));

  useEffect(() => {
    const check = () => setVisible(Boolean(document.querySelector('[data-quantora-code-workspace="true"]')));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { subtree: true, childList: true });
    window.addEventListener('quantora:open-code-workspace', check);
    window.addEventListener('quantora:close-code-workspace', check);
    return () => {
      observer.disconnect();
      window.removeEventListener('quantora:open-code-workspace', check);
      window.removeEventListener('quantora:close-code-workspace', check);
    };
  }, []);

  return visible;
}

function normalizedFindings(review) {
  return [...(review?.findings || [])].sort((a, b) => {
    const severity = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
    if (severity !== 0) return severity;
    return (b.confidence || 0) - (a.confidence || 0);
  });
}

function riskColor(risk) {
  if (risk === 'critical') return '#f87171';
  if (risk === 'high') return '#fb923c';
  if (risk === 'medium') return '#facc15';
  return '#6ee7b7';
}

function diffLineStyle(line) {
  if (line.startsWith('+++') || line.startsWith('---')) return { color: '#94a3b8', background: 'rgba(148,163,184,.05)' };
  if (line.startsWith('+')) return { color: '#86efac', background: 'rgba(34,197,94,.08)' };
  if (line.startsWith('-')) return { color: '#fca5a5', background: 'rgba(239,68,68,.08)' };
  if (line.startsWith('@@')) return { color: '#93c5fd', background: 'rgba(59,130,246,.08)' };
  return { color: '#cbd5e1', background: 'transparent' };
}

function formatCheck(check) {
  if (!check) return 'Unknown';
  if (check.status !== 'completed') return 'Running';
  if (check.conclusion === 'success' || check.conclusion === 'neutral' || check.conclusion === 'skipped') return 'Passed';
  return check.conclusion || 'Complete';
}

export default function PrIntelligenceHost() {
  const codeVisible = useCodeWorkspaceVisible();
  const [open, setOpen] = useState(false);
  const [prUrl, setPrUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [tab, setTab] = useState('review');
  const [fixBusyId, setFixBusyId] = useState('');
  const [fixProposal, setFixProposal] = useState(null);
  const [fixError, setFixError] = useState('');

  useEffect(() => {
    if (!codeVisible) setOpen(false);
  }, [codeVisible]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const findings = useMemo(() => normalizedFindings(data?.review), [data]);
  const selectedFile = useMemo(() => {
    const files = data?.snapshot?.files || [];
    return files.find(file => file.path === selectedPath) || files[0] || null;
  }, [data, selectedPath]);

  const reviewPullRequest = useCallback(async () => {
    const url = prUrl.trim();
    if (!url) {
      setError('Paste a GitHub pull-request URL first.');
      return;
    }
    setBusy(true);
    setError('');
    setFixError('');
    setFixProposal(null);
    try {
      const response = await fetch('/api/github/pr-intelligence', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prUrl: url }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `PR review failed (${response.status})`);
      setData(payload);
      setSelectedPath(payload?.snapshot?.files?.[0]?.path || '');
      setTab('review');
    } catch (reviewError) {
      setData(null);
      setError(reviewError?.message || 'Unable to review this pull request.');
    } finally {
      setBusy(false);
    }
  }, [prUrl]);

  const prepareFix = useCallback(async (finding) => {
    if (!data?.snapshot?.url || !finding?.path) return;
    setFixBusyId(finding.id);
    setFixError('');
    try {
      const response = await fetch('/api/github/pr-fix', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prUrl: data.snapshot.url, finding }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Repair preview failed (${response.status})`);
      setFixProposal(payload?.proposal || null);
      if (!payload?.proposal) throw new Error('Quantora did not return a reviewable repair proposal.');
      setTab('fix');
    } catch (fixFailure) {
      setFixError(fixFailure?.message || 'Unable to prepare a repair preview.');
    } finally {
      setFixBusyId('');
    }
  }, [data]);

  if (!codeVisible) return null;

  return (
    <>
      <button
        type="button"
        {...{ [ENTRY_ATTR]: 'true' }}
        onClick={() => setOpen(true)}
        title="Review a GitHub pull request"
        style={{
          position: 'fixed', top: 66, right: 344, zIndex: 12012, height: 32,
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 10px',
          borderRadius: 8, border: '1px solid rgba(249,115,22,.28)', background: 'rgba(10,15,29,.94)',
          color: '#fdba74', boxShadow: '0 10px 30px rgba(0,0,0,.20)', cursor: 'pointer',
          font: '750 11px/1 Inter, system-ui, sans-serif',
        }}
      >
        <GitPullRequest size={13} /> PR Review
      </button>

      {open && (
        <div
          {...{ [PANEL_ATTR]: 'true' }}
          style={{ position: 'fixed', inset: 0, zIndex: 13000, background: 'rgba(2,6,23,.78)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', padding: 22, color: '#e2e8f0', fontFamily: 'Inter, Plus Jakarta Sans, system-ui, sans-serif' }}
        >
          <div style={{ width: 'min(1380px, 96vw)', height: 'min(880px, 92vh)', border: '1px solid rgba(148,163,184,.18)', borderRadius: 18, background: '#080d19', boxShadow: '0 40px 120px rgba(0,0,0,.60)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <header style={{ minHeight: 64, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '11px 14px 11px 17px', borderBottom: '1px solid rgba(148,163,184,.16)', background: '#070b16' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 10, display: 'grid', placeItems: 'center', border: '1px solid rgba(249,115,22,.28)', background: 'rgba(249,115,22,.10)' }}><GitPullRequest size={18} color="#fb923c" /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 850, letterSpacing: '-.01em' }}>Quantora PR Intelligence</div>
                  <div style={{ color: '#64748b', fontSize: 10.5, marginTop: 2 }}>Understand intent · inspect architecture · find flaws · nudge quality · prepare repair · verify evidence</div>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close PR Intelligence" style={iconButton}><X size={18} /></button>
            </header>

            <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: 10, borderBottom: '1px solid rgba(148,163,184,.14)', background: '#0a0f1d' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${error ? 'rgba(248,113,113,.42)' : 'rgba(148,163,184,.18)'}`, borderRadius: 10, background: '#070b16', padding: '0 11px' }}>
                <GitPullRequest size={14} color="#64748b" />
                <input
                  value={prUrl}
                  onChange={(event) => setPrUrl(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && !busy) reviewPullRequest(); }}
                  placeholder="https://github.com/owner/repository/pull/123"
                  aria-label="GitHub pull request URL"
                  style={{ flex: 1, minWidth: 0, height: 38, border: 0, outline: 0, background: 'transparent', color: '#e2e8f0', font: '12px/1 Inter, system-ui, sans-serif' }}
                />
              </div>
              <button type="button" onClick={reviewPullRequest} disabled={busy} style={{ ...primaryButton, opacity: busy ? .7 : 1 }}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <SearchCode size={14} />}
                {busy ? 'Reviewing…' : 'Review PR'}
              </button>
            </div>

            {error && <div role="alert" style={errorBanner}>{error}</div>}
            {fixError && <div role="alert" style={errorBanner}>{fixError}</div>}

            {!data ? (
              <EmptyReview busy={busy} />
            ) : (
              <>
                <div style={{ flexShrink: 0, minHeight: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '9px 14px', borderBottom: '1px solid rgba(148,163,184,.14)', background: '#0a0f1d' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{data.snapshot.repository}</span>
                      <span style={{ color: '#475569' }}>•</span>
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>#{data.snapshot.number}</span>
                      <span style={{ color: '#cbd5e1', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.snapshot.title}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 4, color: '#64748b', fontSize: 9.8 }}>
                      <span>{data.snapshot.base.ref} ← {data.snapshot.head.ref}</span>
                      <span>{data.snapshot.changedFiles} files</span>
                      <span style={{ color: '#86efac' }}>+{data.snapshot.additions}</span>
                      <span style={{ color: '#fca5a5' }}>−{data.snapshot.deletions}</span>
                      <span>{data.snapshot.commits} commits</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                    <ScorePill label={`${data.review.score}%`} detail="review score" color={riskColor(data.review.risk)} />
                    <ScorePill label={String(data.review.risk || 'low').toUpperCase()} detail="risk" color={riskColor(data.review.risk)} />
                    <ScorePill label={data.review.readyForReview ? 'READY' : 'REVIEW'} detail={data.review.readyForReview ? 'no blocking evidence' : 'attention needed'} color={data.review.readyForReview ? '#6ee7b7' : '#facc15'} />
                  </div>
                </div>

                <div style={{ height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3, padding: '0 10px', borderBottom: '1px solid rgba(148,163,184,.14)', background: '#070b16' }}>
                  <TabButton active={tab === 'review'} onClick={() => setTab('review')} icon={<Sparkles size={12} />} label={`Review${findings.length ? ` ${findings.length}` : ''}`} />
                  <TabButton active={tab === 'diff'} onClick={() => setTab('diff')} icon={<GitCompare size={12} />} label={`Diff ${data.snapshot.changedFiles}`} />
                  <TabButton active={tab === 'checks'} onClick={() => setTab('checks')} icon={<CheckCircle2 size={12} />} label={`Checks ${data.snapshot.checks?.length || 0}`} />
                  {fixProposal && <TabButton active={tab === 'fix'} onClick={() => setTab('fix')} icon={<Wrench size={12} />} label="Fix Preview" />}
                </div>

                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {tab === 'review' && <ReviewSurface data={data} findings={findings} onShowDiff={(path) => { if (path) setSelectedPath(path); setTab('diff'); }} onPrepareFix={prepareFix} fixBusyId={fixBusyId} />}
                  {tab === 'diff' && <DiffSurface files={data.snapshot.files || []} selectedFile={selectedFile} selectedPath={selectedFile?.path || selectedPath} onSelect={setSelectedPath} />}
                  {tab === 'checks' && <ChecksSurface checks={data.snapshot.checks || []} verificationPlan={data.review.verificationPlan || []} />}
                  {tab === 'fix' && fixProposal && <FixPreviewSurface proposal={fixProposal} />}
                </div>

                <footer style={{ minHeight: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px 8px 14px', borderTop: '1px solid rgba(148,163,184,.14)', background: '#070b16' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, color: '#64748b', fontSize: 10 }}>
                    <LockKeyhole size={12} />
                    <span>Local repair previews are supported. GitHub branch write-back stays locked until Quantora has user-scoped repository authorization.</span>
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                    <a href={data.snapshot.url} target="_blank" rel="noreferrer" style={secondaryButton}><ExternalLink size={12} /> Open PR</a>
                    <button type="button" disabled title="Requires connected, user-scoped GitHub write permission" style={{ ...primaryButton, opacity: .42, cursor: 'not-allowed' }}><LockKeyhole size={13} /> Write fix to PR</button>
                  </div>
                </footer>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function EmptyReview({ busy }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: 30, background: 'radial-gradient(circle at 50% 10%, rgba(249,115,22,.055), transparent 35%), #080d19' }}>
      <div style={{ maxWidth: 560, textAlign: 'center' }}>
        <div style={{ width: 54, height: 54, margin: '0 auto 14px', display: 'grid', placeItems: 'center', borderRadius: 16, border: '1px solid rgba(249,115,22,.22)', background: 'rgba(249,115,22,.08)' }}>{busy ? <Loader2 size={23} color="#fb923c" className="animate-spin" /> : <GitPullRequest size={23} color="#fb923c" />}</div>
        <div style={{ fontSize: 19, fontWeight: 850, letterSpacing: '-.025em' }}>{busy ? 'Understanding this pull request…' : 'Review the feature, not just the syntax.'}</div>
        <div style={{ color: '#64748b', fontSize: 11.5, lineHeight: 1.6, marginTop: 8 }}>Quantora reads the PR intent, changed-file patches and GitHub checks, then looks for correctness issues, architectural risks, missing evidence and worthwhile improvements.</div>
        <div style={{ marginTop: 17, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
          {['Feature intent', 'Architecture', 'Bugs & risk', 'Diff & evidence'].map(label => <div key={label} style={{ padding: '9px 7px', border: '1px solid rgba(148,163,184,.13)', borderRadius: 9, color: '#94a3b8', background: '#0a0f1d', fontSize: 9.7 }}>{label}</div>)}
        </div>
      </div>
    </div>
  );
}

function ReviewSurface({ data, findings, onShowDiff, onPrepareFix, fixBusyId }) {
  return (
    <div style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, .85fr)', overflow: 'hidden' }}>
      <div style={{ minHeight: 0, overflowY: 'auto', padding: 14, borderRight: '1px solid rgba(148,163,184,.14)' }}>
        <SectionTitle icon={<Sparkles size={13} />} title="What this PR is trying to do" />
        <div style={cardStyle}>
          <div style={{ color: '#e2e8f0', fontSize: 12, lineHeight: 1.55 }}>{data.review.featureIntent || data.snapshot.title}</div>
          {data.review.summary && <div style={{ color: '#94a3b8', fontSize: 10.8, lineHeight: 1.55, marginTop: 8 }}>{data.review.summary}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
            {(data.review.architectureAreas || []).map(area => <span key={area} style={chipStyle}>{area}</span>)}
          </div>
        </div>

        <SectionTitle icon={<ShieldAlert size={13} />} title={`Engineering findings${findings.length ? ` · ${findings.length}` : ''}`} />
        {findings.length ? findings.map(item => <FindingCard key={item.id} finding={item} onShowDiff={onShowDiff} onPrepareFix={onPrepareFix} fixBusy={fixBusyId === item.id} />) : (
          <div style={{ ...cardStyle, display: 'flex', gap: 8, alignItems: 'center', color: '#6ee7b7', fontSize: 11.5 }}><CheckCircle2 size={14} /> No deterministic or deep-review findings were raised.</div>
        )}
      </div>

      <div style={{ minHeight: 0, overflowY: 'auto', padding: 14, background: '#070b16' }}>
        <SectionTitle icon={<GitCompare size={13} />} title="Architecture impact" />
        <div style={cardStyle}>
          {(data.review.architectureImpact || []).length ? data.review.architectureImpact.map((item, index) => <Bullet key={`${item}-${index}`} text={item} />) : <div style={{ color: '#64748b', fontSize: 10.8 }}>No additional architecture impact was inferred beyond the changed areas.</div>}
        </div>

        <SectionTitle icon={<Lightbulb size={13} />} title="Feature opportunities" />
        <div style={cardStyle}>
          {(data.review.improvements || []).length ? data.review.improvements.map((item, index) => <Bullet key={`${item}-${index}`} text={item} accent="#67e8f9" />) : <div style={{ color: '#64748b', fontSize: 10.8 }}>No separate feature-level opportunities were proposed.</div>}
        </div>

        <SectionTitle icon={<CheckCircle2 size={13} />} title="Verification plan" />
        <div style={cardStyle}>
          {(data.review.verificationPlan || []).map((item, index) => <div key={`${item}-${index}`} style={{ display: 'flex', gap: 8, padding: '4px 0', color: '#cbd5e1', fontSize: 10.6, lineHeight: 1.45 }}><span style={{ width: 16, height: 16, flexShrink: 0, borderRadius: 99, display: 'grid', placeItems: 'center', background: 'rgba(52,211,153,.10)', color: '#6ee7b7', fontSize: 8.5, fontWeight: 850 }}>{index + 1}</span><span>{item}</span></div>)}
        </div>

        <div style={{ ...cardStyle, marginTop: 12, borderColor: 'rgba(148,163,184,.12)', background: 'rgba(15,23,42,.45)' }}>
          <div style={{ color: '#94a3b8', fontSize: 9.8, fontWeight: 800, letterSpacing: '.06em' }}>REVIEW ENGINE</div>
          <div style={{ color: '#64748b', fontSize: 10, lineHeight: 1.5, marginTop: 5 }}>{data.review.deepReviewStatus === 'complete' ? 'Deterministic engineering rules + architecture-aware deep review.' : 'Deterministic engineering review is active. Deep model review was unavailable for this run.'}</div>
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding, onShowDiff, onPrepareFix, fixBusy }) {
  const meta = severityMeta[finding.severity] || severityMeta.nudge;
  const Icon = meta.icon;
  const canPrepareFix = Boolean(finding.path && (finding.severity === 'blocker' || finding.severity === 'risk') && (finding.confidence || 0) >= 0.72);
  return (
    <div data-pr-finding-id={finding.id} data-pr-finding-severity={finding.severity} style={{ border: `1px solid ${meta.border}`, borderRadius: 11, background: meta.bg, padding: 10, marginBottom: 7 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Icon size={14} color={meta.color} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ color: meta.color, fontSize: 9.2, fontWeight: 850, letterSpacing: '.055em', textTransform: 'uppercase' }}>{meta.label}</span>
            {finding.source === 'agent' && <span style={{ color: '#64748b', fontSize: 8.7 }}>deep review</span>}
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 8.8 }}>{Math.round((finding.confidence || 0) * 100)}%</span>
          </div>
          <div style={{ color: '#e2e8f0', fontSize: 11.5, fontWeight: 760, marginTop: 3 }}>{finding.title}</div>
          <div style={{ color: '#94a3b8', fontSize: 10.3, lineHeight: 1.5, marginTop: 4 }}>{finding.rationale}</div>
          {finding.suggestion && <div style={{ color: '#cbd5e1', fontSize: 10.2, lineHeight: 1.48, marginTop: 6 }}><span style={{ color: meta.color, fontWeight: 800 }}>Nudge:</span> {finding.suggestion}</div>}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 7 }}>
            {finding.path && <button type="button" onClick={() => onShowDiff(finding.path)} style={textButton}><FileCode2 size={11} /> {finding.path} <ChevronRight size={10} /></button>}
            {canPrepareFix && <button type="button" onClick={() => onPrepareFix(finding)} disabled={fixBusy} style={{ ...textButton, color: '#fdba74', opacity: fixBusy ? .65 : 1 }}>{fixBusy ? <Loader2 size={11} className="animate-spin" /> : <Wrench size={11} />} {fixBusy ? 'Preparing…' : 'Prepare Fix'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffSurface({ files, selectedFile, selectedPath, onSelect }) {
  return (
    <div style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)' }}>
      <aside style={{ minHeight: 0, overflowY: 'auto', borderRight: '1px solid rgba(148,163,184,.14)', background: '#0a0f1d', padding: 7 }}>
        <div style={{ color: '#64748b', fontSize: 9.5, fontWeight: 850, letterSpacing: '.07em', padding: '5px 7px 8px' }}>CHANGED FILES</div>
        {files.map(file => {
          const active = file.path === selectedPath;
          return (
            <button key={file.path} type="button" onClick={() => onSelect(file.path)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${active ? 'rgba(249,115,22,.23)' : 'transparent'}`, borderRadius: 8, background: active ? 'rgba(249,115,22,.08)' : 'transparent', color: active ? '#fed7aa' : '#cbd5e1', padding: '7px 8px', cursor: 'pointer', textAlign: 'left', marginBottom: 2 }}>
              <FileCode2 size={12} color={active ? '#fb923c' : '#64748b'} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10.5 }}>{file.path}</span>
              <span style={{ color: '#86efac', fontSize: 8.8 }}>+{file.additions}</span>
              <span style={{ color: '#fca5a5', fontSize: 8.8 }}>−{file.deletions}</span>
            </button>
          );
        })}
      </aside>
      <section style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#060914' }}>
        {selectedFile ? (
          <>
            <div style={{ minHeight: 38, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 11px', borderBottom: '1px solid rgba(148,163,184,.14)', color: '#cbd5e1', fontSize: 10.8 }}>
              <GitCompare size={12} color="#fb923c" />
              <span style={{ fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFile.path}</span>
              <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 9.5 }}>{selectedFile.status} · {selectedFile.changes} changed lines</span>
            </div>
            <div data-quantora-pr-diff="true" style={{ flex: 1, minHeight: 0, overflow: 'auto', font: '10.5px/1.5 JetBrains Mono, SFMono-Regular, Consolas, monospace' }}>
              {selectedFile.patch ? selectedFile.patch.split('\n').map((line, index) => {
                const lineStyle = diffLineStyle(line);
                return <div key={`${index}-${line.slice(0, 20)}`} style={{ minWidth: '100%', width: 'max-content', padding: '0 10px', whiteSpace: 'pre', color: lineStyle.color, background: lineStyle.background }}><span style={{ display: 'inline-block', width: 38, color: '#334155', userSelect: 'none', textAlign: 'right', marginRight: 11 }}>{index + 1}</span>{line || ' '}</div>;
              }) : <div style={{ padding: 18, color: '#64748b', fontSize: 11 }}>GitHub did not provide a textual patch for this file. This can happen for binary files or very large diffs.</div>}
            </div>
          </>
        ) : <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 11 }}>No changed file selected.</div>}
      </section>
    </div>
  );
}

function FixPreviewSurface({ proposal }) {
  return (
    <div data-quantora-pr-fix-preview="true" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: '#070b16' }}>
      <div style={{ flexShrink: 0, padding: '10px 13px', borderBottom: '1px solid rgba(148,163,184,.14)', background: 'rgba(249,115,22,.055)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wrench size={14} color="#fb923c" />
          <span style={{ color: '#fed7aa', fontSize: 11.5, fontWeight: 800 }}>{proposal.summary}</span>
          <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 9.3 }}>head {String(proposal.headSha || '').slice(0, 9)}</span>
        </div>
        <div style={{ marginTop: 5, color: '#94a3b8', fontSize: 10.2, lineHeight: 1.45 }}>{proposal.reason}</div>
        <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#facc15', fontSize: 9.8, fontWeight: 700 }}><AlertTriangle size={11} /> Local proposal — not written to GitHub · not verified</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(148,163,184,.14)' }}>
        <CodeComparisonPane label="BEFORE · PR HEAD" path={proposal.path} content={proposal.before} accent="#fca5a5" />
        <CodeComparisonPane label="PROPOSED FIX" path={proposal.path} content={proposal.after} accent="#86efac" />
      </div>
    </div>
  );
}

function CodeComparisonPane({ label, path, content, accent }) {
  const lines = String(content || '').split('\n');
  return (
    <section style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#060914' }}>
      <div style={{ height: 37, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', borderBottom: '1px solid rgba(148,163,184,.12)' }}>
        <span style={{ color: accent, fontSize: 9.2, fontWeight: 850, letterSpacing: '.06em' }}>{label}</span>
        <span style={{ color: '#64748b', fontSize: 9.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
      </div>
      <pre style={{ flex: 1, minHeight: 0, margin: 0, overflow: 'auto', padding: '8px 0 14px', color: '#cbd5e1', background: '#060914', font: '10.4px/1.55 JetBrains Mono, SFMono-Regular, Consolas, monospace' }}>
        {lines.map((line, index) => <div key={`${index}-${line.slice(0, 16)}`} style={{ minWidth: '100%', width: 'max-content', whiteSpace: 'pre', padding: '0 10px' }}><span style={{ display: 'inline-block', width: 36, marginRight: 10, textAlign: 'right', color: '#334155', userSelect: 'none' }}>{index + 1}</span>{line || ' '}</div>)}
      </pre>
    </section>
  );
}

function ChecksSurface({ checks, verificationPlan }) {
  return (
    <div style={{ height: '100%', minHeight: 0, overflowY: 'auto', padding: 16 }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <SectionTitle icon={<CheckCircle2 size={13} />} title="GitHub execution evidence" />
        <div style={cardStyle}>
          {checks.length ? checks.map((check, index) => {
            const passed = check.status === 'completed' && ['success', 'neutral', 'skipped'].includes(check.conclusion);
            const running = check.status !== 'completed';
            return <div key={`${check.name}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: index === checks.length - 1 ? 0 : '1px solid rgba(148,163,184,.09)' }}>
              {running ? <RefreshCw size={13} color="#facc15" /> : passed ? <CheckCircle2 size={13} color="#6ee7b7" /> : <AlertTriangle size={13} color="#fca5a5" />}
              <span style={{ flex: 1, minWidth: 0, color: '#cbd5e1', fontSize: 11 }}>{check.name}</span>
              <span style={{ color: running ? '#facc15' : passed ? '#6ee7b7' : '#fca5a5', fontSize: 9.6, fontWeight: 750 }}>{formatCheck(check)}</span>
              {check.url && <a href={check.url} target="_blank" rel="noreferrer" aria-label={`Open ${check.name}`} style={{ color: '#64748b', display: 'inline-flex' }}><ExternalLink size={11} /></a>}
            </div>;
          }) : <div style={{ color: '#64748b', fontSize: 10.8 }}>No GitHub check-run evidence was available for the PR head revision.</div>}
        </div>

        <SectionTitle icon={<SearchCode size={13} />} title="Quantora verification plan" />
        <div style={cardStyle}>
          {verificationPlan.map((item, index) => <div key={`${item}-${index}`} style={{ display: 'flex', gap: 8, padding: '5px 0', color: '#cbd5e1', fontSize: 10.8, lineHeight: 1.5 }}><span style={{ color: '#6ee7b7', fontWeight: 850 }}>{index + 1}.</span><span>{item}</span></div>)}
        </div>
      </div>
    </div>
  );
}

function ScorePill({ label, detail, color }) {
  return <div style={{ minWidth: 72, border: '1px solid rgba(148,163,184,.15)', borderRadius: 9, background: '#070b16', padding: '5px 8px', textAlign: 'center' }}><div style={{ color, fontSize: 10.5, fontWeight: 850 }}>{label}</div><div style={{ color: '#475569', fontSize: 7.8, marginTop: 1, textTransform: 'uppercase', letterSpacing: '.055em' }}>{detail}</div></div>;
}

function TabButton({ active, onClick, icon, label }) {
  return <button type="button" onClick={onClick} style={{ height: '100%', display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, borderBottom: active ? '1px solid #f97316' : '1px solid transparent', background: 'transparent', color: active ? '#e2e8f0' : '#64748b', padding: '0 8px', cursor: 'pointer', fontSize: 10.5 }}>{icon}{label}</button>;
}

function SectionTitle({ icon, title }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 9.8, fontWeight: 850, letterSpacing: '.065em', textTransform: 'uppercase', margin: '0 0 7px 2px' }}>{icon}{title}</div>;
}

function Bullet({ text, accent = '#fdba74' }) {
  return <div style={{ display: 'flex', gap: 7, color: '#cbd5e1', fontSize: 10.6, lineHeight: 1.5, padding: '3px 0' }}><span style={{ color: accent, marginTop: 1 }}>•</span><span>{text}</span></div>;
}

const errorBanner = { flexShrink: 0, padding: '8px 14px', color: '#fca5a5', background: 'rgba(239,68,68,.08)', borderBottom: '1px solid rgba(239,68,68,.16)', fontSize: 11.5 };
const cardStyle = { border: '1px solid rgba(148,163,184,.14)', borderRadius: 11, background: '#0a0f1d', padding: 11, marginBottom: 14 };
const chipStyle = { border: '1px solid rgba(148,163,184,.15)', borderRadius: 999, color: '#94a3b8', background: '#070b16', padding: '3px 7px', fontSize: 8.8 };
const iconButton = { width: 32, height: 32, border: 0, borderRadius: 8, background: 'transparent', color: '#94a3b8', display: 'inline-grid', placeItems: 'center', cursor: 'pointer' };
const textButton = { border: 0, padding: 0, background: 'transparent', color: '#93c5fd', fontSize: 9.8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 };
const primaryButton = { minHeight: 38, border: 0, borderRadius: 9, background: '#f97316', color: '#fff', padding: '0 13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', font: '800 10.8px/1 Inter, system-ui, sans-serif', textDecoration: 'none' };
const secondaryButton = { minHeight: 34, border: '1px solid rgba(148,163,184,.18)', borderRadius: 9, background: '#0f172a', color: '#cbd5e1', padding: '0 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', font: '700 10.2px/1 Inter, system-ui, sans-serif', textDecoration: 'none' };
