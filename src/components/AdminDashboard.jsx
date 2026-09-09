import React, { useState, useEffect } from 'react';
import { Activity, ChevronLeft, Cpu, BarChart3, AlertTriangle, MessageSquareText } from 'lucide-react';

const AdminDashboard = ({ onBack }) => {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('user'); // 'user' | 'technical' | 'feedback'

  useEffect(() => {
    let cancelled = false;

    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/admin/metrics', {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });

        if (res.status === 401 || res.status === 403) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(body.error || 'You do not have access to this dashboard.');
            setLoading(false);
          }
          return;
        }

        if (res.status === 503) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setError(body.error || 'Telemetry is not configured on this deployment.');
          return;
        }
        if (!res.ok) throw new Error(`Server error (${res.status})`);

        const data = await res.json();
        if (!cancelled) {
          setMetrics(data);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading) return (
    <div style={{ background: '#030712', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <Activity size={32} color="#0ea5e9" className="animate-pulse" />
        <span style={{ fontSize: '1.2rem', fontWeight: '500', color: '#94a3b8' }}>Loading analytics…</span>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ background: '#030712', minHeight: '100vh', padding: '40px', color: '#ef4444', fontFamily: 'monospace' }}>
      <h2>Analytics unavailable</h2>
      <p>{error}</p>
    </div>
  );

  if (!metrics) return null;

  const telemetryStatus = getTelemetryStatus(metrics);

  return (
    <div style={{
      padding: '30px 40px',
      background: '#030712',
      minHeight: '100vh',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '8px 16px',
            borderRadius: '8px',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
          onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
        >
          <ChevronLeft size={16} /> Back
        </button>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: telemetryStatus.color, background: telemetryStatus.background, padding: '6px 12px', borderRadius: '20px', border: `1px solid ${telemetryStatus.border}` }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: telemetryStatus.color }} />
            {telemetryStatus.label}
          </span>
          <div style={{ fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace' }}>
            Updated {new Date(metrics.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '24px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0 0 8px 0', letterSpacing: '-0.02em', color: '#f8fafc' }}>
            Quantora Analytics
          </h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: '0.95rem' }}>Usage, engagement and platform intelligence</p>
        </div>

        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '6px' }}>
          <TabButton
            active={activeTab === 'user'}
            onClick={() => setActiveTab('user')}
            icon={<BarChart3 size={16} />}
            label="Overview"
          />
          <TabButton
            active={activeTab === 'technical'}
            onClick={() => setActiveTab('technical')}
            icon={<Cpu size={16} />}
            label="Technical"
          />
          <TabButton
            active={activeTab === 'feedback'}
            onClick={() => setActiveTab('feedback')}
            icon={<MessageSquareText size={16} />}
            label="Feedback"
          />
        </div>
      </div>

      {activeTab === 'user' ? (
        <UserAnalyticsTab metrics={metrics} />
      ) : activeTab === 'technical' ? (
        <TechnicalPredictiveTab metrics={metrics} />
      ) : (
        <AdminFeedbackPanel />
      )}
    </div>
  );
};

const getTelemetryStatus = (metrics) => {
  const source = metrics?.source;
  const workspaceSource = metrics?.workspaceUse?.source;
  const trafficSource = metrics?.product?.traffic?.source;
  const growthTrafficSource = metrics?.growthTraffic?.source;

  if (source === 'not_configured' || workspaceSource === 'not_configured' || metrics?.isLiveConnected === false) {
    return {
      label: 'NOT CONFIGURED',
      color: '#f59e0b',
      background: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.25)',
    };
  }

  if (source === 'unavailable' || workspaceSource === 'unavailable' || trafficSource === 'unavailable'
    || growthTrafficSource === 'not_configured' || growthTrafficSource === 'unavailable') {
    return {
      label: 'DEGRADED',
      color: '#f59e0b',
      background: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.25)',
    };
  }

  return {
    label: 'CONNECTED',
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.1)',
    border: 'rgba(16, 185, 129, 0.2)',
  };
};

const TabButton = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      borderRadius: '8px',
      border: 'none',
      background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
      color: active ? '#fff' : '#94a3b8',
      fontSize: '0.9rem',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    }}
  >
    {icon} {label}
  </button>
);

import ProductAnalyticsPanel from './ProductAnalyticsPanel';
import TechnicalAnalyticsPanel from './TechnicalAnalyticsPanel';
import TechnicalCommandCenterBoundary from './TechnicalCommandCenterBoundary';
import AdminFeedbackPanel from './AdminFeedbackPanel';

const UserAnalyticsTab = ({ metrics }) => {
  const notConfigured = metrics.source === 'not_configured' || metrics.workspaceUse?.source === 'not_configured';
  const growthTrafficNotConfigured = metrics.growthTraffic?.source === 'not_configured';
  const unavailable = metrics.source === 'unavailable'
    || metrics.workspaceUse?.source === 'unavailable'
    || metrics.product?.traffic?.source === 'unavailable'
    || metrics.growthTraffic?.source === 'unavailable';
  const warning = notConfigured
    ? 'Analytics storage is not configured. Unavailable metrics are shown as — rather than zero.'
    : growthTrafficNotConfigured
      ? 'Vercel Web Analytics API access is not configured. Growth / Traffic metrics are shown as — until its read credentials are added.'
    : unavailable
      ? 'Some analytics queries are unavailable. Missing telemetry is shown as — rather than being reported as zero usage.'
      : '';

  return (
    <div style={{ animation: 'fadeIn 0.35s ease-out' }}>
      {warning && (
        <div style={{ padding: '16px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AlertTriangle size={18} />
          <span>{warning}</span>
        </div>
      )}

      <ProductAnalyticsPanel
        product={metrics.product}
        growth={metrics.growth}
        workspaceUse={metrics.workspaceUse}
        window={metrics.window}
        daily={metrics.daily}
        technical={metrics.technical}
        growthTraffic={metrics.growthTraffic}
        source={metrics.source}
      />
    </div>
  );
};

const TechnicalPredictiveTab = ({ metrics }) => {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <TechnicalCommandCenterBoundary
        technical={metrics.technical}
        turnFailures={metrics.turnFailures}
        isLight={isLight}
      />

      <details style={{
        marginTop: '18px',
        border: isLight ? '1px solid rgba(15,23,42,0.10)' : '1px solid rgba(148,163,184,0.12)',
        borderRadius: '14px',
        background: isLight ? '#fff' : '#09090b',
        overflow: 'hidden',
      }}>
        <summary style={{
          cursor: 'pointer',
          padding: '16px 18px',
          color: isLight ? '#334155' : '#cbd5e1',
          fontSize: '0.78rem',
          fontWeight: 680,
          userSelect: 'none',
        }}>
          Deep diagnostics · raw ledgers, request history, Study renderer coverage and communication decisions
        </summary>
        <div style={{ padding: '0 16px 16px' }}>
          <TechnicalAnalyticsPanel
            technical={metrics.technical}
            studyRepresentationCoverage={metrics.studyRepresentationCoverage}
            window={metrics.window}
            daily={metrics.daily}
            turnPlans={metrics.turnPlans}
            turnFailures={metrics.turnFailures}
            workspaceUse={metrics.workspaceUse}
            isLight={isLight}
          />
        </div>
      </details>
    </div>
  );
};

export default AdminDashboard;
