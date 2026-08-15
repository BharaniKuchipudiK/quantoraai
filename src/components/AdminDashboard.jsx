import React, { useState, useEffect } from 'react';
import { Activity, Users, ChevronLeft, Cpu, BarChart3, Fingerprint, AlertTriangle } from 'lucide-react';

const AdminDashboard = ({ onBack }) => {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('user'); // 'user' | 'technical'

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
          /*
           * Not an admin. There is nothing for the visitor to type, so this
           * explains the situation instead of demanding a credential they do
           * not have. The previous password prompt could not distinguish "you
           * are not an admin" from "your key has a stray space", and offered
           * the same useless box for both.
           */
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
      background: '#030712', 
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
            LIVE CONNECTION
          </span>
          <div style={{ fontSize: '0.85rem', color: '#64748b', fontFamily: 'monospace' }}>
            LAST SYNC: {new Date(metrics.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: '800', margin: '0 0 8px 0', letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Quantora Intelligence
          </h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: '0.95rem' }}>Authentic Database Analytics & Telemetry</p>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '6px' }}>
          <TabButton 
            active={activeTab === 'user'} 
            onClick={() => setActiveTab('user')}
            icon={<BarChart3 size={16} />}
            label="User Analytics"
          />
          <TabButton 
            active={activeTab === 'technical'} 
            onClick={() => setActiveTab('technical')}
            icon={<Cpu size={16} />}
            label="Technical & Telemetry"
          />
        </div>
      </div>

      {activeTab === 'user' ? (
        <UserAnalyticsTab metrics={metrics} />
      ) : (
        <TechnicalPredictiveTab metrics={metrics} />
      )}
    </div>
  );
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
      transition: 'all 0.3s ease',
      boxShadow: active ? '0 4px 12px rgba(0,0,0,0.1)' : 'none'
    }}
  >
    {icon} {label}
  </button>
);

import ProductAnalyticsPanel from './ProductAnalyticsPanel';
import TechnicalAnalyticsPanel from './TechnicalAnalyticsPanel';

const UserAnalyticsTab = ({ metrics }) => {
  const g = metrics.growth || {};
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  
  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      {metrics.source === 'not_configured' && (
        <div style={{ padding: '16px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AlertTriangle size={18} />
          <span>User Analytics requires configuring Supabase Service Role Key. Displaying zeros.</span>
        </div>
      )}

      {/* User KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '20px'
      }}>
        <MiniKpi title="Total Registered Users" value={(g.totalUsers || 0).toLocaleString()} sparklineColor="#10b981" icon={<Users size={16}/>} />
        <MiniKpi title="New Users (7d)" value={(g.newUsers7d || 0).toLocaleString()} sparklineColor="#0ea5e9" icon={<Users size={16}/>} />
        <MiniKpi title="Active Users (7d)" value={(g.activeUsers7d || 0).toLocaleString()} sparklineColor="#f59e0b" icon={<Activity size={16}/>} />
        <MiniKpi title="Billable Requests (7d)" value={(g.billableRequests7d || 0).toLocaleString()} sparklineColor="#8b5cf6" icon={<Fingerprint size={16}/>} />
      </div>
      
      <ProductAnalyticsPanel product={metrics.product} growth={metrics.growth} isLight={isLight} />
      <div style={{ marginBottom: '24px' }}></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
        <div className="panel" style={{ background: '#09090b', border: '1px solid #1f2937', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: '600', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} color="#0ea5e9" /> 14-Day Growth History (Authentic)
          </h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '240px', width: '100%' }}>
            {(() => {
              const growthDays = metrics.daily?.growth || [];
              const maxSignups = growthDays.length
                ? Math.max(...growthDays.map((d) => Number(d.signups) || 0))
                : 0;
              if (!growthDays.length) {
                return (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '0 24px' }}>
                    No signup history yet. Bars appear as new users register via Google sign-in.
                  </div>
                );
              }
              if (maxSignups === 0) {
                return (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '0 24px', gap: '8px' }}>
                    <span>0 new signups in the last 14 days — chart is connected but empty.</span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>Use Product Engagement above for prompt volume until registrations grow.</span>
                  </div>
                );
              }
              return growthDays.slice().reverse().map((day, i) => {
                const heightPct = (Number(day.signups) / maxSignups) * 100;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', position: 'relative' }}>
                    <div style={{
                      width: '100%',
                      height: `${Math.max(heightPct, 8)}%`,
                      background: 'linear-gradient(to top, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.6))',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.5s ease-out',
                    }} />
                    <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{new Date(day.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

const TechnicalPredictiveTab = ({ metrics }) => {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <TechnicalAnalyticsPanel
        technical={metrics.technical}
        window={metrics.window}
        daily={metrics.daily}
        isLight={isLight}
      />
    </div>
  );
};

const MiniKpi = ({ title, value, icon, sparklineColor }) => (
  <div style={{
    background: '#09090b',
    border: '1px solid #1f2937',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#94a3b8', fontWeight: '500' }}>
        {icon} {title}
      </span>
    </div>
    <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc', letterSpacing: '-0.02em', zIndex: 2 }}>
      {value}
    </div>
    
    {/* Abstract Sparkline Background Graphic */}
    <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '40px', opacity: 0.15 }} preserveAspectRatio="none" viewBox="0 0 100 100">
      <path d="M0,100 L0,50 Q25,80 50,40 T100,20 L100,100 Z" fill={sparklineColor} />
      <path d="M0,50 Q25,80 50,40 T100,20" fill="none" stroke={sparklineColor} strokeWidth="4" />
    </svg>
  </div>
);

export default AdminDashboard;
