import React from 'react';

function number(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(part, whole) {
  const a = number(part);
  const b = number(whole);
  if (a == null || b == null || b <= 0) return null;
  return Math.round((a / b) * 1000) / 10;
}

function compact(value) {
  const parsed = number(value);
  if (parsed == null) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(parsed);
}

function integer(value) {
  const parsed = number(value);
  return parsed == null ? '—' : Math.round(parsed).toLocaleString();
}

function money(value) {
  const parsed = number(value);
  if (parsed == null) return '—';
  if (Math.abs(parsed) < 0.01 && parsed !== 0) return `$${parsed.toFixed(4)}`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(parsed);
}

function duration(ms) {
  const parsed = number(ms);
  if (parsed == null) return '—';
  if (parsed < 1000) return `${Math.round(parsed)}ms`;
  return `${(parsed / 1000).toFixed(parsed >= 10000 ? 1 : 2)}s`;
}

function shortModel(id) {
  const text = String(id || '').trim();
  return text ? (text.split('/').pop() || text) : 'Unknown';
}

function shortSha(sha) {
  const text = String(sha || '').trim();
  return text ? text.slice(0, 7) : '—';
}

function relativeTime(value) {
  if (!value) return '—';
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return '—';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))}h ago`;
  return `${Math.max(1, Math.round(diff / 86_400_000))}d ago`;
}

function sourceKnown(source) {
  return source === 'measured' || source === 'partial' || source === 'no-rows';
}

function statusColor(status) {
  if (status === 'open' || status === 'ERROR' || status === 'BLOCKED') return '#ef4444';
  if (status === 'impaired' || status === 'CANCELED' || status === 'BUILDING' || status === 'QUEUED') return '#f59e0b';
  return '#10b981';
}

function Gauge({ label, value, note, tone = 'good', isLight }) {
  const measured = number(value);
  const bounded = measured == null ? 0 : Math.max(0, Math.min(100, measured));
  const angle = Math.PI + (bounded / 100) * Math.PI;
  const needleX = 90 + Math.cos(angle) * 48;
  const needleY = 88 + Math.sin(angle) * 48;
  const accent = tone === 'risk' ? '#f97316' : tone === 'neutral' ? '#3b82f6' : '#10b981';
  const foreground = isLight ? '#0f172a' : '#f8fafc';

  return (
    <div style={{
      minWidth: 0,
      padding: '18px 16px 15px',
      borderRadius: '15px',
      border: isLight ? '1px solid rgba(15,23,42,0.10)' : '1px solid rgba(148,163,184,0.14)',
      background: isLight ? '#ffffff' : 'linear-gradient(150deg, rgba(15,23,42,0.88), rgba(3,7,18,0.96))',
      boxShadow: isLight ? '0 8px 30px rgba(15,23,42,0.05)' : 'inset 0 1px 0 rgba(255,255,255,0.025)',
    }}>
      <div style={{ color: '#94a3b8', fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.055em', textTransform: 'uppercase' }}>{label}</div>
      <svg viewBox="0 0 180 102" width="100%" height="112" role="img" aria-label={`${label}: ${measured == null ? 'unavailable' : `${measured}%`}`} style={{ display: 'block', marginTop: '4px' }}>
        <path d="M 20 88 A 70 70 0 0 1 160 88" fill="none" stroke={isLight ? '#e2e8f0' : '#172033'} strokeWidth="13" strokeLinecap="round" pathLength="100" />
        {measured != null && (
          <path d="M 20 88 A 70 70 0 0 1 160 88" fill="none" stroke={accent} strokeWidth="13" strokeLinecap="round" pathLength="100" strokeDasharray={`${bounded} 100`} />
        )}
        {[0, 25, 50, 75, 100].map((mark) => {
          const tickAngle = Math.PI + (mark / 100) * Math.PI;
          const x1 = 90 + Math.cos(tickAngle) * 60;
          const y1 = 88 + Math.sin(tickAngle) * 60;
          const x2 = 90 + Math.cos(tickAngle) * 67;
          const y2 = 88 + Math.sin(tickAngle) * 67;
          return <line key={mark} x1={x1} y1={y1} x2={x2} y2={y2} stroke={isLight ? '#94a3b8' : '#475569'} strokeWidth="1.5" />;
        })}
        {measured != null && <line x1="90" y1="88" x2={needleX} y2={needleY} stroke={foreground} strokeWidth="2.5" strokeLinecap="round" />}
        <circle cx="90" cy="88" r="5" fill={foreground} />
        <text x="90" y="66" textAnchor="middle" fill={foreground} fontSize="22" fontWeight="760">{measured == null ? '—' : `${Math.round(measured)}%`}</text>
      </svg>
      <div style={{ color: '#64748b', fontSize: '0.62rem', lineHeight: 1.45, minHeight: '2.7em' }}>{note}</div>
    </div>
  );
}

function Metric({ label, value, note, isLight, emphasis = false }) {
  return (
    <div style={{
      minWidth: 0,
      padding: '13px 14px',
      borderRadius: '11px',
      border: emphasis ? '1px solid rgba(59,130,246,0.30)' : (isLight ? '1px solid rgba(15,23,42,0.08)' : '1px solid rgba(148,163,184,0.10)'),
      background: emphasis ? (isLight ? 'rgba(59,130,246,0.06)' : 'rgba(37,99,235,0.10)') : (isLight ? 'rgba(248,250,252,0.9)' : 'rgba(15,23,42,0.34)'),
    }}>
      <div style={{ color: '#64748b', fontSize: '0.61rem', marginBottom: '6px' }}>{label}</div>
      <div style={{ color: isLight ? '#0f172a' : '#f8fafc', fontSize: '1.02rem', fontWeight: 740, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {note && <div style={{ color: '#475569', fontSize: '0.56rem', marginTop: '4px', lineHeight: 1.35 }}>{note}</div>}
    </div>
  );
}

function SectionTitle({ title, subtitle, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 720, color: 'inherit', letterSpacing: '-0.012em' }}>{title}</h3>
        {subtitle && <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '0.68rem', lineHeight: 1.45 }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function StatusPill({ label, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '999px', border: `1px solid ${color}35`, background: `${color}12`, color, fontSize: '0.61rem', fontWeight: 720, letterSpacing: '0.025em' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />{label}
    </span>
  );
}

function panelStyle(isLight) {
  return {
    padding: '19px',
    borderRadius: '14px',
    border: isLight ? '1px solid rgba(15,23,42,0.09)' : '1px solid rgba(148,163,184,0.12)',
    background: isLight ? '#fff' : '#09090b',
    minWidth: 0,
  };
}

function buildActions({ technical, operations, fundedShare, costCoverage }) {
  const actions = [];
  const latency = technical?.latencySummary;
  const vercel = operations?.vercel;
  const openRouter = operations?.openRouter;
  const circuits = operations?.circuits;
  const reliability = operations?.reliability;

  if (vercel?.current && vercel.current.state !== 'READY') {
    actions.push({ severity: 'urgent', title: `Production deployment is ${vercel.current.state}`, detail: `Deployment ${vercel.current.id || 'unknown'} needs review before treating production as healthy.` });
  }
  if (circuits?.open > 0) {
    actions.push({ severity: 'urgent', title: `${circuits.open} inference circuit${circuits.open === 1 ? '' : 's'} open`, detail: 'At least one route is actively being suppressed by the circuit breaker.' });
  }
  if (circuits?.impaired > 0) {
    actions.push({ severity: 'attention', title: `${circuits.impaired} inference route${circuits.impaired === 1 ? '' : 's'} impaired`, detail: 'Recent failures are newer than the last recorded success on these routes.' });
  }
  if (reliability?.failures > 0) {
    actions.push({ severity: 'attention', title: `${integer(reliability.failures)} recent model-attempt failures`, detail: `${integer(reliability.fallbackRescues)} fallback rescues were recorded in the same model-quality window.` });
  }
  if (number(latency?.p95_latency_ms) >= 60_000) {
    actions.push({ severity: 'attention', title: `Slow AI tail: p95 is ${duration(latency.p95_latency_ms)}`, detail: `Average latency is ${duration(latency.avg_latency_ms)}; the slowest tail is materially longer.` });
  }
  if (costCoverage != null && costCoverage < 100) {
    const exact = operations?.consumption?.exact_requests;
    const requests = operations?.consumption?.requests;
    actions.push({ severity: 'visibility', title: `Exact cost attribution covers ${Math.round(costCoverage)}% of requests`, detail: `${integer(exact)} of ${integer(requests)} requests carry exact provider usage. Cost totals are incomplete until this gap closes.` });
  }
  if (fundedShare != null && fundedShare >= 90) {
    actions.push({ severity: 'cost', title: `${Math.round(fundedShare)}% of measured requests use Quantora-managed keys`, detail: 'The platform is carrying nearly all measured inference exposure rather than shifting usage to BYOK.' });
  }
  if (openRouter?.source === 'unavailable') {
    actions.push({ severity: 'visibility', title: 'OpenRouter account balance is unavailable', detail: 'Inference telemetry still works, but key usage / credit headroom could not be read from OpenRouter.' });
  }

  if (!actions.length) {
    actions.push({ severity: 'clear', title: 'No immediate operator action detected', detail: 'Measured deployment, circuit, latency, reliability and cost-visibility signals have no active exception.' });
  }
  return actions.slice(0, 6);
}

function ActionQueue({ actions, isLight }) {
  const styleFor = (severity) => {
    if (severity === 'urgent') return { color: '#ef4444', label: 'URGENT' };
    if (severity === 'attention') return { color: '#f59e0b', label: 'ATTENTION' };
    if (severity === 'cost') return { color: '#f97316', label: 'COST' };
    if (severity === 'visibility') return { color: '#8b5cf6', label: 'VISIBILITY' };
    return { color: '#10b981', label: 'CLEAR' };
  };

  return (
    <section style={panelStyle(isLight)} data-quantora-operator-actions={actions.length}>
      <SectionTitle title="What needs attention" subtitle="Deterministic operator cues from measured telemetry — no generated health score." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '15px' }}>
        {actions.map((action, index) => {
          const tone = styleFor(action.severity);
          return (
            <div key={`${action.title}-${index}`} style={{ display: 'grid', gridTemplateColumns: '88px minmax(0,1fr)', gap: '10px', padding: '11px 12px', borderRadius: '10px', border: isLight ? '1px solid rgba(15,23,42,0.07)' : '1px solid rgba(148,163,184,0.09)', background: isLight ? 'rgba(248,250,252,0.85)' : 'rgba(15,23,42,0.30)' }}>
              <div style={{ color: tone.color, fontSize: '0.57rem', fontWeight: 800, letterSpacing: '0.08em', paddingTop: '2px' }}>{tone.label}</div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 680, color: isLight ? '#0f172a' : '#e2e8f0' }}>{action.title}</div>
                <div style={{ fontSize: '0.61rem', color: '#64748b', lineHeight: 1.45, marginTop: '3px' }}>{action.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OpenRouterCard({ openRouter, isLight }) {
  const measured = sourceKnown(openRouter?.source);
  const remaining = number(openRouter?.credits?.remaining);
  const capRemaining = number(openRouter?.usage?.limitRemaining);
  const stateColor = openRouter?.source === 'measured' ? '#10b981' : openRouter?.source === 'partial' ? '#f59e0b' : '#64748b';
  return (
    <div style={panelStyle(isLight)} data-quantora-openrouter-source={openRouter?.source || 'missing'}>
      <SectionTitle
        title="OpenRouter"
        subtitle="Live key spend and credit headroom from OpenRouter, cached for one minute."
        right={<StatusPill label={(openRouter?.source || 'unavailable').toUpperCase()} color={stateColor} />}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '9px', marginTop: '15px' }}>
        <Metric label="Today" value={measured ? money(openRouter?.usage?.daily) : '—'} note="key usage" isLight={isLight} />
        <Metric label="This week" value={measured ? money(openRouter?.usage?.weekly) : '—'} note="key usage" isLight={isLight} />
        <Metric label="This month" value={measured ? money(openRouter?.usage?.monthly) : '—'} note="key usage" isLight={isLight} emphasis />
        <Metric label="Credits remaining" value={remaining == null ? '—' : money(remaining)} note="account credit pool" isLight={isLight} emphasis={remaining != null} />
        <Metric label="Key limit remaining" value={capRemaining == null ? '—' : money(capRemaining)} note={openRouter?.usage?.limit == null ? 'no key cap reported' : `${money(openRouter.usage.limit)} configured cap`} isLight={isLight} />
        <Metric label="Lifetime key usage" value={measured ? money(openRouter?.usage?.total) : '—'} note={openRouter?.usage?.isFreeTier === true ? 'free-tier key' : 'reported by /api/v1/key'} isLight={isLight} />
      </div>
    </div>
  );
}

function VercelCard({ vercel, isLight }) {
  const current = vercel?.current;
  const currentState = current?.state || (vercel?.environment === 'production' ? 'PRODUCTION' : 'UNKNOWN');
  const color = statusColor(current?.state || (vercel?.source === 'measured' ? 'healthy' : 'impaired'));
  return (
    <div style={panelStyle(isLight)} data-quantora-vercel-source={vercel?.source || 'missing'}>
      <SectionTitle
        title="Vercel production"
        subtitle="Live production deployment state and recent deploy reliability."
        right={<StatusPill label={currentState} color={color} />}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '9px', marginTop: '15px' }}>
        <Metric label="Current commit" value={shortSha(current?.commitSha || vercel?.commitSha)} note={current?.commitMessage ? String(current.commitMessage).split('\n')[0].slice(0, 58) : 'production SHA'} isLight={isLight} emphasis />
        <Metric label="Deploy success" value={vercel?.successRate == null ? '—' : `${Math.round(vercel.successRate)}%`} note={`${integer(vercel?.readyDeployments)} ready / ${integer(vercel?.finishedDeployments)} finished`} isLight={isLight} />
        <Metric label="Region" value={vercel?.region || '—'} note={vercel?.environment || 'environment unavailable'} isLight={isLight} />
        <Metric label="Production URL" value={vercel?.productionUrl || '—'} note={current?.createdAt ? `deployed ${relativeTime(current.createdAt)}` : 'runtime metadata'} isLight={isLight} />
      </div>
      {!!vercel?.recent?.length && (
        <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <div style={{ color: '#64748b', fontSize: '0.59rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 720 }}>Recent production deploys</div>
          {vercel.recent.slice(0, 4).map((row) => (
            <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', fontSize: '0.65rem', padding: '6px 0', borderBottom: isLight ? '1px solid rgba(15,23,42,0.05)' : '1px solid rgba(148,163,184,0.07)' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isLight ? '#334155' : '#cbd5e1' }}>{shortSha(row.commitSha)} · {row.commitMessage ? row.commitMessage.split('\n')[0] : row.id}</span>
              <span style={{ flexShrink: 0, color: statusColor(row.state), fontWeight: 700 }}>{row.state}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CircuitCard({ circuits, isLight }) {
  const rows = Array.isArray(circuits?.rows) ? circuits.rows : [];
  const visible = rows.filter((row) => row.status !== 'healthy').slice(0, 6);
  const domainRows = rows.filter((row) => String(row.circuit_key || '').startsWith('inference:domain:')).slice(0, 4);
  return (
    <section style={panelStyle(isLight)} data-quantora-circuit-source={circuits?.source || 'missing'}>
      <SectionTitle
        title="Provider control tower"
        subtitle="Circuit-breaker state across Gemini and OpenRouter inference routes."
        right={<div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}><StatusPill label={`${circuits?.open || 0} OPEN`} color="#ef4444" /><StatusPill label={`${circuits?.impaired || 0} IMPAIRED`} color="#f59e0b" /><StatusPill label={`${circuits?.healthy || 0} HEALTHY`} color="#10b981" /></div>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px,1fr))', gap: '10px', marginTop: '15px' }}>
        {domainRows.map((row) => (
          <div key={row.circuit_key} style={{ padding: '11px 12px', borderRadius: '10px', background: isLight ? 'rgba(248,250,252,0.9)' : 'rgba(15,23,42,0.34)', borderLeft: `3px solid ${statusColor(row.status)}` }}>
            <div style={{ color: isLight ? '#0f172a' : '#e2e8f0', fontSize: '0.72rem', fontWeight: 680 }}>{String(row.circuit_key).replace('inference:domain:', '').replace(':server', '')}</div>
            <div style={{ color: '#64748b', fontSize: '0.58rem', marginTop: '4px' }}>{row.status.toUpperCase()} · last success {relativeTime(row.last_success_at)}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '14px' }}>
        <div style={{ color: '#64748b', fontSize: '0.59rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 720, marginBottom: '7px' }}>Routes needing attention</div>
        {!visible.length ? (
          <div style={{ color: '#10b981', fontSize: '0.68rem' }}>No currently impaired or open inference routes.</div>
        ) : visible.map((row) => (
          <div key={row.circuit_key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '12px', alignItems: 'center', padding: '8px 0', borderBottom: isLight ? '1px solid rgba(15,23,42,0.05)' : '1px solid rgba(148,163,184,0.07)' }}>
            <div style={{ minWidth: 0 }}>
              <div title={row.circuit_key} style={{ color: isLight ? '#334155' : '#cbd5e1', fontSize: '0.66rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(row.circuit_key).replace('inference:route:', '')}</div>
              <div style={{ color: '#64748b', fontSize: '0.56rem', marginTop: '3px' }}>{integer(row.failures)} recorded failures · last failure {relativeTime(row.last_failure_at)}</div>
            </div>
            <StatusPill label={row.status.toUpperCase()} color={statusColor(row.status)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ModelReliability({ models, isLight }) {
  const rows = Array.isArray(models) ? models.filter((row) => row.attempts > 0).slice(0, 10) : [];
  return (
    <section style={panelStyle(isLight)} data-quantora-model-reliability={rows.length}>
      <SectionTitle title="Model reliability" subtitle="Observed model attempts, outcomes, fallback rescues and successful-response latency — routing-level “auto” failures are excluded." />
      {!rows.length ? <div style={{ color: '#64748b', fontSize: '0.7rem', padding: '30px 0', textAlign: 'center' }}>No model-quality observations available.</div> : (
        <div style={{ marginTop: '14px', overflowX: 'auto' }}>
          <div style={{ minWidth: '650px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,1.8fr) .65fr .65fr .65fr .8fr .75fr', gap: '10px', padding: '0 9px 8px', color: '#64748b', fontSize: '0.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.055em' }}>
              <span>Model</span><span>Success</span><span>Attempts</span><span>Failures</span><span>Rescues</span><span>Avg latency</span>
            </div>
            {rows.map((row) => {
              const success = number(row.successRate);
              const color = success == null ? '#64748b' : success >= 95 ? '#10b981' : success >= 80 ? '#f59e0b' : '#ef4444';
              return (
                <div key={row.modelId} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,1.8fr) .65fr .65fr .65fr .8fr .75fr', gap: '10px', alignItems: 'center', padding: '10px 9px', borderTop: isLight ? '1px solid rgba(15,23,42,0.06)' : '1px solid rgba(148,163,184,0.08)', fontSize: '0.66rem' }}>
                  <div style={{ minWidth: 0 }}><div title={row.modelId} style={{ color: isLight ? '#0f172a' : '#e2e8f0', fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortModel(row.modelId)}</div><div style={{ color: '#475569', fontSize: '0.54rem', marginTop: '2px' }}>{relativeTime(row.lastEventAt)}</div></div>
                  <span style={{ color, fontWeight: 750 }}>{success == null ? '—' : `${Math.round(success)}%`}</span>
                  <span style={{ color: '#94a3b8' }}>{integer(row.attempts)}</span>
                  <span style={{ color: row.failures ? '#f59e0b' : '#64748b' }}>{integer(row.failures)}</span>
                  <span style={{ color: row.fallbackRescues ? '#8b5cf6' : '#64748b' }}>{integer(row.fallbackRescues)}</span>
                  <span style={{ color: '#94a3b8' }}>{duration(row.avgLatencyMs)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function CostAndCapacity({ operations, keyMix, isLight }) {
  const consumption = operations?.consumption;
  const exact = number(consumption?.exact_requests);
  const requests = number(consumption?.requests);
  const exactCoverage = operations?.costAttributionCoveragePct;
  return (
    <section style={panelStyle(isLight)}>
      <SectionTitle title="Cost & capacity" subtitle="What Quantora is funding, what can be priced exactly, and where the observability gaps remain." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px,1fr))', gap: '9px', marginTop: '15px' }}>
        <Metric label="Platform-key requests" value={integer(keyMix?.server_key_requests)} note="last 7d" isLight={isLight} />
        <Metric label="Platform-key tokens" value={compact(keyMix?.server_key_tokens_est)} note="estimated, last 7d" isLight={isLight} />
        <Metric label="Exact usage records" value={exact == null ? '—' : `${integer(exact)} / ${integer(requests)}`} note={exactCoverage == null ? 'coverage unavailable' : `${Math.round(exactCoverage)}% exact attribution`} isLight={isLight} emphasis />
        <Metric label="Provider-reported cost" value={exactCoverage === 100 ? money(consumption?.provider_reported_cost_usd) : 'Incomplete'} note={exactCoverage === 100 ? 'last 7d exact records' : 'do not treat zero as free'} isLight={isLight} />
        <Metric label="Quantora-funded cost" value={exactCoverage === 100 ? money(consumption?.quantora_funded_cost_usd) : 'Incomplete'} note={exactCoverage === 100 ? 'last 7d' : 'exact provider usage not yet universal'} isLight={isLight} />
      </div>
    </section>
  );
}

export default function TechnicalCommandCenter({ technical, turnFailures = null, isLight = false }) {
  const operations = technical?.operations;
  if (!operations) return null;

  const keyMix = technical?.keyMix;
  const totalRequests = number(keyMix?.total_requests);
  const serverRequests = number(keyMix?.server_key_requests);
  const fundedShare = totalRequests && serverRequests != null ? pct(serverRequests, totalRequests) : null;
  const costCoverage = number(operations?.costAttributionCoveragePct);
  const reliability = operations?.reliability;
  const vercel = operations?.vercel;
  const actions = buildActions({ technical, operations, fundedShare, costCoverage });
  const foreground = isLight ? '#0f172a' : '#f8fafc';

  const currentDeploymentHealthy = vercel?.current?.state === 'READY' || (!vercel?.current && vercel?.environment === 'production');
  const headline = operations?.circuits?.open > 0
    ? `${operations.circuits.open} inference circuit${operations.circuits.open === 1 ? '' : 's'} currently open`
    : !currentDeploymentHealthy
      ? 'Production deployment needs attention'
      : reliability?.failures > 0
        ? `Platform serving, with ${integer(reliability.failures)} recent model-attempt failures`
        : 'Measured operational signals are clear';

  return (
    <div data-quantora-technical-command-center={operations.source || 'unknown'} style={{ color: foreground, display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '22px' }}>
      <section style={{ ...panelStyle(isLight), padding: '20px 22px', background: isLight ? 'linear-gradient(130deg,#fff,#f8fafc)' : 'linear-gradient(130deg, rgba(15,23,42,0.92), rgba(3,7,18,0.98))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '22px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '250px', flex: 1 }}>
            <div style={{ color: '#64748b', fontSize: '0.6rem', fontWeight: 780, letterSpacing: '0.11em', textTransform: 'uppercase', marginBottom: '7px' }}>Live operating picture</div>
            <div style={{ fontSize: '1.18rem', fontWeight: 760, letterSpacing: '-0.025em' }}>{headline}</div>
            <div style={{ color: '#64748b', fontSize: '0.65rem', marginTop: '7px', lineHeight: 1.45 }}>
              Supabase runtime truth + OpenRouter key telemetry + Vercel production deployment state. External account reads are cached for 60 seconds.
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
            <StatusPill label={`AI ${reliability?.successRate == null ? '—' : `${Math.round(reliability.successRate)}%`}`} color={reliability?.successRate >= 95 ? '#10b981' : '#f59e0b'} />
            <StatusPill label={`VERCEL ${vercel?.current?.state || (vercel?.environment || 'UNKNOWN').toUpperCase()}`} color={currentDeploymentHealthy ? '#10b981' : '#f59e0b'} />
            <StatusPill label={`${operations?.circuits?.open || 0} CIRCUITS OPEN`} color={operations?.circuits?.open ? '#ef4444' : '#10b981'} />
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px,1fr))', gap: '12px' }}>
        <Gauge label="AI attempt success" value={reliability?.successRate} note={`${integer(reliability?.successes)} successful / ${integer(reliability?.attempts)} observed model attempts`} tone="good" isLight={isLight} />
        <Gauge label="Production deploy success" value={vercel?.successRate} note={`${integer(vercel?.readyDeployments)} READY / ${integer(vercel?.finishedDeployments)} recent finished production deploys`} tone="good" isLight={isLight} />
        <Gauge label="Quantora-funded share" value={fundedShare} note={`${integer(serverRequests)} server-key / ${integer(totalRequests)} measured requests · higher means more platform cost exposure`} tone="risk" isLight={isLight} />
        <Gauge label="Exact cost attribution" value={costCoverage} note={`${integer(operations?.consumption?.exact_requests)} exact / ${integer(operations?.consumption?.requests)} usage records · higher means stronger cost truth`} tone="neutral" isLight={isLight} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: '16px' }}>
        <ActionQueue actions={actions} isLight={isLight} />
        <section style={panelStyle(isLight)}>
          <SectionTitle title="Latency pulse" subtitle="Raw measured latency — shown as time, not converted into an invented health score." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '10px', marginTop: '15px' }}>
            <Metric label="Average AI latency" value={duration(technical?.latencySummary?.avg_latency_ms)} note={`${integer(technical?.latencySummary?.requests)} requests · last 7d`} isLight={isLight} />
            <Metric label="P95 AI latency" value={duration(technical?.latencySummary?.p95_latency_ms)} note="slow-tail experience · last 7d" isLight={isLight} emphasis />
            <Metric label="Fallback rescues" value={integer(reliability?.fallbackRescues)} note="model-quality window" isLight={isLight} />
            <Metric label="Failed turns" value={turnFailures?.source === 'measured' || turnFailures?.source === 'no-rows' ? integer(turnFailures?.faults) : '—'} note={`last ${turnFailures?.windowHours || 24}h · faults, not refusals`} isLight={isLight} />
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px,1fr))', gap: '16px' }}>
        <OpenRouterCard openRouter={operations.openRouter} isLight={isLight} />
        <VercelCard vercel={operations.vercel} isLight={isLight} />
      </div>

      <CircuitCard circuits={operations.circuits} isLight={isLight} />
      <CostAndCapacity operations={operations} keyMix={keyMix} isLight={isLight} />
      <ModelReliability models={operations.models} isLight={isLight} />
    </div>
  );
}
