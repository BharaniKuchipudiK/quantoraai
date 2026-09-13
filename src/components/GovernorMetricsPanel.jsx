import React from 'react';

const fmt = (value) => value == null ? '—' : Number(value).toLocaleString();
const pct = (value) => value == null ? '—' : `${Math.round(Number(value) * 100)}%`;

const Metric = ({ label, value, detail }) => (
  <div style={{ padding: '14px 16px', border: '1px solid rgba(148,163,184,0.12)', borderRadius: '12px', background: 'rgba(15,23,42,0.42)' }}>
    <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 650, marginBottom: '6px' }}>{label}</div>
    <div style={{ color: '#f8fafc', fontSize: '1.45rem', fontWeight: 760, letterSpacing: '-0.02em' }}>{value}</div>
    {detail ? <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '5px' }}>{detail}</div> : null}
  </div>
);

const GovernorMetricsPanel = ({ governor }) => {
  if (!governor) return null;
  const unavailable = governor.source === 'unavailable' || governor.source === 'not_configured';
  const sourceLabel = governor.source === 'measured'
    ? 'MEASURED'
    : governor.source === 'no-rows'
      ? 'NO EVENTS'
      : String(governor.source || 'UNKNOWN').replaceAll('_', ' ').toUpperCase();

  return (
    <section style={{
      marginBottom: '18px',
      border: '1px solid rgba(56,189,248,0.16)',
      borderRadius: '14px',
      background: '#09090b',
      padding: '18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 760 }}>Runtime Governor</div>
          <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px' }}>
            Governed lifecycle reliability · last {governor.windowHours || 24} hours
          </div>
        </div>
        <div style={{
          color: unavailable ? '#f59e0b' : '#38bdf8',
          border: `1px solid ${unavailable ? 'rgba(245,158,11,0.25)' : 'rgba(56,189,248,0.25)'}`,
          background: unavailable ? 'rgba(245,158,11,0.08)' : 'rgba(56,189,248,0.08)',
          borderRadius: '999px', padding: '5px 9px', fontSize: '0.65rem', fontWeight: 760,
        }}>{sourceLabel}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px' }}>
        <Metric label="LIFECYCLES" value={fmt(governor.lifecycleCount)} detail={`${fmt(governor.activeLifecycleCount)} active`} />
        <Metric label="VERIFIED COMPLETION" value={pct(governor.verifiedCompletionRate)} detail={`${fmt(governor.verifiedCompletedCount)} verified`} />
        <Metric label="FAILED" value={fmt(governor.failedCount)} detail={`${fmt(governor.stalledFailureCount)} stalled`} />
        <Metric label="RECOVERED" value={fmt(governor.recoveredLifecycleCount)} detail={`${pct(governor.recoveryRate)} of lifecycles`} />
        <Metric label="OUTCOME SATISFIED" value={fmt(governor.outcomeSatisfiedCount)} detail={`${fmt(governor.outcomeFailedCount)} failed`} />
        <Metric label="JUDGE FALLBACK" value={fmt(governor.modelJudgeRequiredCount)} detail={`${fmt(governor.outcomeIndeterminateCount)} indeterminate`} />
      </div>

      <div style={{ marginTop: '12px', color: '#64748b', fontSize: '0.7rem' }}>
        Events: {fmt(governor.eventCount)} · terminal lifecycles: {fmt(governor.terminalCount)} · sources: {Object.entries(governor.bySource || {}).map(([key, value]) => `${key} ${value}`).join(' · ') || '—'}
      </div>
    </section>
  );
};

export default GovernorMetricsPanel;
