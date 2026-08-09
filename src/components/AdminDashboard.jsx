import React, { useState, useEffect } from 'react';
import { Activity, Users, Database, ChevronLeft, Cpu, Zap, Network } from 'lucide-react';

/*
 * The admin key is entered by the operator and held in sessionStorage for the
 * tab's lifetime only. It is deliberately NOT hardcoded here: this file is
 * compiled into the public JavaScript bundle, so anything written in it is
 * readable by every visitor.
 */
const ADMIN_KEY_STORAGE = 'quantora_admin_key';

const AdminDashboard = ({ onBack }) => {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) || '');
  const [keyInput, setKeyInput] = useState('');
  const [needsKey, setNeedsKey] = useState(() => !sessionStorage.getItem(ADMIN_KEY_STORAGE));

  useEffect(() => {
    if (!adminKey) {
      setLoading(false);
      setNeedsKey(true);
      return;
    }

    let cancelled = false;

    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/admin/metrics', {
          headers: { 
            Authorization: `Bearer ${adminKey}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });

        if (res.status === 401) {
          // Wrong key — drop it and ask again rather than retrying forever.
          sessionStorage.removeItem(ADMIN_KEY_STORAGE);
          if (!cancelled) {
            setAdminKey('');
            setNeedsKey(true);
            setError('That admin key was rejected.');
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
    const interval = setInterval(fetchMetrics, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [adminKey]);

  const submitKey = (e) => {
    e.preventDefault();
    const value = keyInput.trim();
    if (!value) return;
    sessionStorage.setItem(ADMIN_KEY_STORAGE, value);
    setAdminKey(value);
    setKeyInput('');
    setNeedsKey(false);
    setError('');
    setLoading(true);
  };

  if (needsKey) return (
    <div style={{ background: '#030712', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <form onSubmit={submitKey} style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', maxWidth: '380px' }}>
        <h2 style={{ color: '#fff', fontSize: '1.2rem', margin: 0 }}>Admin access</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
          Enter the deployment's ADMIN_API_KEY. It is kept for this browser tab only and is never
          stored in the application code.
        </p>
        {error ? <div style={{ color: '#ef4444', fontSize: '0.82rem' }}>{error}</div> : null}
        <input
          type="password"
          autoFocus
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="Admin API key"
          style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #1e293b', background: '#0f172a', color: '#fff', fontSize: '0.9rem' }}
        />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Unlock
          </button>
          <button type="button" onClick={onBack} style={{ padding: '12px 18px', borderRadius: '10px', border: '1px solid #1e293b', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
            Back
          </button>
        </div>
      </form>
    </div>
  );

  if (loading) return (
    <div style={{ background: '#030712', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <Activity size={32} color="#0ea5e9" className="animate-pulse" />
        <span style={{ fontSize: '1.2rem', fontWeight: '500', color: '#94a3b8' }}>Establishing Telemetry Link...</span>
      </div>
    </div>
  );
  
  if (error) return (
    <div style={{ background: '#030712', minHeight: '100vh', padding: '40px', color: '#ef4444', fontFamily: 'monospace' }}>
      <h2>CRITICAL SYSTEM FAILURE</h2>
      <p>{error}</p>
    </div>
  );
  
  if (!metrics) return null;

  return (
    <div style={{
      padding: '30px 40px',
      background: '#030712', // Ultra dark background for BI feel
      minHeight: '100vh',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Header */}
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
          <ChevronLeft size={16} /> Exit BI Engine
        </button>
        
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
            {metrics.source === 'measured' ? 'LIVE DATA' : metrics.source === 'unavailable' ? 'DATABASE UNREACHABLE' : 'TELEMETRY NOT CONFIGURED'}
          </span>
          <div style={{ fontSize: '0.85rem', color: '#64748b', fontFamily: 'monospace' }}>
            LAST SYNC: {new Date(metrics.timestamp).toLocaleTimeString()}
            {metrics.notMeasured?.length ? ` · not instrumented: ${metrics.notMeasured.join(', ')}` : ''}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0 0 8px 0', letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            System Telemetry
          </h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: '0.95rem' }}>Genuine Supabase Database Metrics</p>
        </div>
      </div>

      <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
        {/* Core KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          {/*
            * Growth first, because it is the question this dashboard exists to
            * answer. `—` means not measured; it never means zero, and it is
            * never filled in with a plausible-looking guess.
            */}
          <MiniKpi title="Total Users" value={metrics.growth ? metrics.growth.totalUsers.toLocaleString() : '—'} sparklineColor="#0ea5e9" icon={<Users size={16}/>} />
          <MiniKpi title="New Users (7d)" value={metrics.growth ? metrics.growth.newUsers7d.toLocaleString() : '—'} sparklineColor="#8b5cf6" icon={<Users size={16}/>} />
          <MiniKpi title="Active Users (7d)" value={metrics.growth ? metrics.growth.activeUsers7d.toLocaleString() : '—'} sparklineColor="#10b981" icon={<Activity size={16}/>} />
          <MiniKpi title="Requests (14d)" value={metrics.window?.requests != null ? metrics.window.requests.toLocaleString() : '—'} sparklineColor="#0ea5e9" icon={<Database size={16}/>} />
          <MiniKpi title="On Your API Keys (14d)" value={metrics.window?.billableRequests != null ? metrics.window.billableRequests.toLocaleString() : '—'} sparklineColor="#f97316" icon={<Zap size={16}/>} />
          <MiniKpi title="Average Latency" value={metrics.window?.avgLatencyMs != null ? `${metrics.window.avgLatencyMs} ms` : '—'} sparklineColor="#10b981" icon={<Zap size={16}/>} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          {/* Active Sessions */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Network size={18} color="#0ea5e9" /> Live AI Sessions (Supabase Feed)
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(metrics.legacyTelemetry?.activeSessions?.length ?? 0) > 0 ? metrics.legacyTelemetry.activeSessions.map((session, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>{session.id}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Model: {session.model}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.9rem', color: '#e2e8f0' }}>{session.tokens} Tokens</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{session.latency} ms</div>
                  </div>
                </div>
              )) : (
                <div style={{ color: '#64748b', fontSize: '0.9rem' }}>No recent sessions found.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MiniKpi = ({ title, value, sparklineColor, icon, trend }) => (
  <div style={{
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.9rem', fontWeight: '500' }}>
        <span style={{ color: sparklineColor }}>{icon}</span> {title}
      </div>
      {trend && (
        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: trend.startsWith('+') ? '#10b981' : '#64748b', background: trend.startsWith('+') ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '8px' }}>
          {trend}
        </div>
      )}
    </div>
    
    <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f8fafc', letterSpacing: '-0.02em', zIndex: 2 }}>
      {value}
    </div>
    
    {/* Decorative sparkline glow */}
    <div style={{ position: 'absolute', bottom: -20, right: -20, width: '100px', height: '100px', background: sparklineColor, filter: 'blur(50px)', opacity: 0.15, borderRadius: '50%' }}></div>
  </div>
);

export default AdminDashboard;
