import React from 'react';
import TechnicalCommandCenter from './TechnicalCommandCenter';

const DEFINITIVELY_READ = new Set(['measured', 'no-rows']);

export function getTechnicalCommandCenterVisibility(technical) {
  const operations = technical?.operations;
  if (!operations) {
    return {
      ready: false,
      circuitsKnown: false,
      vercelKnown: false,
      reason: 'Operational telemetry has not been returned yet.',
    };
  }

  const circuitsKnown = DEFINITIVELY_READ.has(operations?.circuits?.source);
  const vercelKnown = operations?.vercel?.source === 'measured' && Boolean(operations?.vercel?.current);

  if (!circuitsKnown || !vercelKnown) {
    const missing = [];
    if (!circuitsKnown) missing.push('provider circuit state');
    if (!vercelKnown) missing.push('current Vercel production deployment');
    return {
      ready: false,
      circuitsKnown,
      vercelKnown,
      reason: `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not currently measured.`,
    };
  }

  return { ready: true, circuitsKnown: true, vercelKnown: true, reason: '' };
}

export default function TechnicalCommandCenterBoundary({ technical, turnFailures = null, isLight = false }) {
  const visibility = getTechnicalCommandCenterVisibility(technical);
  if (visibility.ready) {
    return <TechnicalCommandCenter technical={technical} turnFailures={turnFailures} isLight={isLight} />;
  }

  const operations = technical?.operations;
  const circuitsSource = operations?.circuits?.source || 'missing';
  const vercelSource = operations?.vercel?.source || 'missing';
  const foreground = isLight ? '#0f172a' : '#f8fafc';

  return (
    <section
      data-quantora-technical-command-center="partial"
      data-quantora-circuit-source={circuitsSource}
      data-quantora-vercel-source={vercelSource}
      style={{
        marginBottom: '22px',
        padding: '20px 22px',
        borderRadius: '14px',
        border: '1px solid rgba(245,158,11,0.28)',
        background: isLight ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.08)',
        color: foreground,
      }}
    >
      <div style={{ color: '#f59e0b', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
        Operating picture partially observed
      </div>
      <div style={{ marginTop: '8px', fontSize: '1rem', fontWeight: 720, letterSpacing: '-0.015em' }}>
        Critical operational sources are unavailable, so Quantora will not render green zeroes or a healthy command-center state.
      </div>
      <div style={{ marginTop: '8px', color: '#94a3b8', fontSize: '0.68rem', lineHeight: 1.55 }}>
        {visibility.reason} Circuit source: <strong>{circuitsSource}</strong>. Vercel source: <strong>{vercelSource}</strong>.
        The deep diagnostics below remain available while these sources recover.
      </div>
    </section>
  );
}
