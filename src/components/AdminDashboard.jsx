import React, { useState, useEffect } from 'react';
import { Activity, Users, Clock, Database, ChevronLeft, Cpu, HardDrive, Zap, Network, Server, Globe2, AlertTriangle, CheckCircle, BarChart3, TrendingUp, Fingerprint, MapPin, Gauge } from 'lucide-react';

/*
 * The admin key is entered by the operator and held in sessionStorage for the
 * tab's lifetime only. It is deliberately NOT hardcoded here: this file is
 * compiled into the public JavaScript bundle, so anything written in it is
 * readable by every visitor. The previous version embedded the password
 * directly, which meant the endpoint had no real protection at all.
 *
 * sessionStorage rather than localStorage so the key does not outlive the tab.
 */
const ADMIN_KEY_STORAGE = 'quantora_admin_key';

const AdminDashboard = ({ onBack }) => {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('user'); // 'user' | 'technical'
  
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
          headers: { Authorization: `Bearer ${adminKey}` }
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
            LIVE {metrics.systemUptime} UPTIME
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
          <p style={{ color: '#64748b', margin: 0, fontSize: '0.95rem' }}>Enterprise Analytics & Predictive Monitoring</p>
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
            label="Technical & Predictive"
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

const UserAnalyticsTab = ({ metrics }) => (
  <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
    {/* User KPIs */}
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '20px',
      marginBottom: '20px'
    }}>
      <MiniKpi title="Active Users (Live)" value={metrics.activeConnections} sparklineColor="#10b981" icon={<Users size={16}/>} trend="+12%" />
      <MiniKpi title="Peak Concurrent" value={metrics.peakConcurrentCustomers} sparklineColor="#f59e0b" icon={<TrendingUp size={16}/>} trend="All-Time High" />
      <MiniKpi title="Total Interactions" value={(metrics.totalClicks).toLocaleString()} sparklineColor="#0ea5e9" icon={<Fingerprint size={16}/>} trend="+4.2%" />
      <MiniKpi title="Avg Session Duration" value={metrics.sessionDurations.average} sparklineColor="#8b5cf6" icon={<Clock size={16}/>} trend="+45s" />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      
      {/* Geo Distribution Table */}
      <div className="panel" style={{ background: '#09090b', border: '1px solid #1f2937', borderRadius: '12px', padding: '24px' }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '600', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={18} color="#0ea5e9" /> Global Geo-Distribution
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1f2937', color: '#64748b', textAlign: 'left' }}>
              <th style={{ padding: '0 0 12px 0', fontWeight: '500' }}>Region</th>
              <th style={{ padding: '0 0 12px 0', fontWeight: '500' }}>Active Users</th>
              <th style={{ padding: '0 0 12px 0', fontWeight: '500' }}>Distribution</th>
            </tr>
          </thead>
          <tbody>
            {metrics.geoDistribution.map((geo, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '16px 0', color: '#f1f5f9', fontWeight: '500' }}>
                  <span style={{ marginRight: '8px', fontSize: '1.1rem' }}>{geo.flag}</span>
                  {geo.country}
                </td>
                <td style={{ padding: '16px 0', color: '#cbd5e1', fontFamily: 'monospace' }}>
                  {geo.users.toLocaleString()}
                </td>
                <td style={{ padding: '16px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, height: '6px', background: '#1f2937', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${geo.percent}%`, height: '100%', background: '#0ea5e9', borderRadius: '3px' }}></div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', width: '35px', textAlign: 'right' }}>{geo.percent}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Session Insights */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="panel" style={{ background: '#09090b', border: '1px solid #1f2937', borderRadius: '12px', padding: '24px', flex: 1 }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '600', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe2 size={18} color="#8b5cf6" /> Live Traces
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {metrics.activeSessions.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                <div>
                  <div style={{ color: '#f1f5f9', fontSize: '0.9rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8b5cf6', boxShadow: '0 0 8px #8b5cf6' }}></div>
                    {s.location}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px' }}>Model: {s.model}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#cbd5e1', fontSize: '0.85rem', fontFamily: 'monospace' }}>{s.tokens} tk</div>
                  <div style={{ color: '#10b981', fontSize: '0.75rem', marginTop: '4px', fontWeight: '500' }}>{s.duration}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ background: 'linear-gradient(145deg, #09090b, #111827)', border: '1px solid #1f2937', borderRadius: '12px', padding: '24px' }}>
           <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '600', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <Clock size={18} color="#f59e0b" /> Engagement Extremes
           </h3>
           <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Longest Session</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>{metrics.sessionDurations.longest}</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shortest Session</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ef4444' }}>{metrics.sessionDurations.shortest}</div>
              </div>
           </div>
        </div>
      </div>
    </div>
  </div>
);

const TechnicalPredictiveTab = ({ metrics }) => (
  <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
    {/* Technical KPIs */}
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '20px',
      marginBottom: '20px'
    }}>
      <MiniKpi title="Total Inference Reqs" value={(metrics.totalRequests).toLocaleString()} sparklineColor="#0ea5e9" icon={<Database size={16}/>} trend="+5.2%" />
      <MiniKpi title="Global Avg Latency" value={`${metrics.avgLatency}ms`} sparklineColor="#f59e0b" icon={<Gauge size={16}/>} trend="-14ms" trendGood={true} />
      <MiniKpi title="Tokens Generated" value={(metrics.tokensGenerated).toLocaleString()} sparklineColor="#8b5cf6" icon={<Zap size={16}/>} trend="+240k" />
      <MiniKpi title="Cache Hit Ratio" value={`${metrics.cacheHitRatio}%`} sparklineColor="#14b8a6" icon={<HardDrive size={16}/>} trend="+0.4%" />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
      
      {/* Left Column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Network Ingress Chart */}
        <div className="panel" style={{ background: '#09090b', border: '1px solid #1f2937', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: '600', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Network size={18} color="#0ea5e9" /> 24-Hour Network Ingress Volume
          </h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '240px', width: '100%' }}>
            {metrics.hourlyTraffic.map((count, i) => {
              const max = Math.max(...metrics.hourlyTraffic, 1);
              const heightPct = (count / max) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', position: 'relative', group: 'true' }}>
                  <div style={{
                    width: '100%',
                    height: `${Math.max(heightPct, 2)}%`,
                    background: i >= 9 && i <= 15 ? 'linear-gradient(to top, rgba(14, 165, 233, 0.2), #0ea5e9)' : 'linear-gradient(to top, rgba(56, 189, 248, 0.1), rgba(56, 189, 248, 0.4))',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.5s ease-out'
                  }}></div>
                  <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{i}h</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Predictive Intelligence: API Exhaustion */}
        <div className="panel" style={{ background: 'linear-gradient(to right, #09090b, #1e1b4b)', border: '1px solid #312e81', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '600', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} color="#818cf8" /> Predictive Intelligence: Quota Projections
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {metrics.apiKeyExhaustion.map((api, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ color: '#f1f5f9', fontWeight: '500' }}>{api.provider}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Limit: {api.limit}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ flex: 1, height: '8px', background: '#1f2937', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${api.usagePercent}%`, height: '100%', background: api.usagePercent > 80 ? '#ef4444' : '#818cf8', borderRadius: '4px' }}></div>
                  </div>
                  <span style={{ fontSize: '0.9rem', color: api.usagePercent > 80 ? '#ef4444' : '#cbd5e1', fontWeight: '600' }}>
                    {api.usagePercent}%
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {api.usagePercent > 80 ? <AlertTriangle size={14} color="#ef4444" /> : <CheckCircle size={14} color="#10b981" />}
                  Exhaustion: <strong style={{ color: api.usagePercent > 80 ? '#ef4444' : '#10b981' }}>{api.timeToExhaustion}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Right Column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Hardware Usage & Vercel Compute Limits */}
        <div className="panel" style={{ background: '#09090b', border: '1px solid #1f2937', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '600', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={18} color="#ec4899" /> Edge Compute (Vercel)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Live CPU */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                <span>Vercel Edge CPU Load</span>
                <span>{metrics.cpuUsage}%</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: '#1f2937', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${metrics.cpuUsage}%`, height: '100%', background: '#ec4899', transition: 'width 1s' }}></div>
              </div>
            </div>

            {/* Vercel Compute Projection */}
            <div style={{ background: 'rgba(236, 72, 153, 0.05)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(236, 72, 153, 0.1)' }}>
              <div style={{ fontSize: '0.8rem', color: '#f472b6', marginBottom: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Compute Hours Exhaustion Projection
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontSize: '1.8rem', fontWeight: '700', color: '#fdf2f8' }}>{metrics.vercelCompute.used}</span>
                  <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}> / {metrics.vercelCompute.limit} hrs</span>
                </div>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ width: `${metrics.vercelCompute.usagePercent}%`, height: '100%', background: '#ec4899' }}></div>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <AlertTriangle size={14} color="#f59e0b" />
                Projected Exhaustion: <strong>{metrics.vercelCompute.daysToExhaustion} Days</strong>
              </div>
            </div>

          </div>
        </div>

        {/* Infrastructure Health */}
        <div className="panel" style={{ background: '#09090b', border: '1px solid #1f2937', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '600', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={18} color="#10b981" /> Endpoint & Node Health
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1f2937', color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '0 0 12px 0', fontWeight: '500' }}>Node / Model</th>
                <th style={{ padding: '0 0 12px 0', fontWeight: '500' }}>Status</th>
                <th style={{ padding: '0 0 12px 0', fontWeight: '500', textAlign: 'right' }}>Load</th>
              </tr>
            </thead>
            <tbody>
              {metrics.endpoints.map((ep, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '16px 0', color: '#f1f5f9', fontWeight: '500' }}>
                    {ep.name}
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px', fontFamily: 'monospace' }}>{ep.latency}ms</div>
                  </td>
                  <td style={{ padding: '16px 0' }}>
                    <span style={{ background: ep.status === 'Healthy' || ep.status === 'Optimal' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: ep.status === 'Healthy' || ep.status === 'Optimal' ? '#10b981' : '#f59e0b', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600' }}>
                      {ep.status}
                    </span>
                  </td>
                  <td style={{ padding: '16px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                      <div style={{ width: '40px', height: '4px', background: '#1f2937', borderRadius: '2px' }}>
                        <div style={{ width: `${ep.load}%`, height: '100%', background: ep.load > 70 ? '#ef4444' : '#0ea5e9', borderRadius: '2px' }}></div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', width: '25px', textAlign: 'right' }}>{ep.load}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </div>
);

const MiniKpi = ({ title, value, icon, sparklineColor, trend, trendGood = true }) => (
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
      <span style={{ fontSize: '0.75rem', fontWeight: '600', color: trendGood ? '#10b981' : '#ef4444', background: trendGood ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
        {trend}
      </span>
    </div>
    <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc', letterSpacing: '-0.02em' }}>
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
