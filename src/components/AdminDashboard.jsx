import React, { useState, useEffect } from 'react';
import { Activity, Users, Clock, Database, ChevronLeft } from 'lucide-react';

const AdminDashboard = ({ onBack }) => {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/admin/metrics?admin=quantora2026');
        if (!res.ok) throw new Error('Unauthorized or Server Error');
        const data = await res.json();
        setMetrics(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div style={{ color: '#fff', padding: '40px' }}>Loading Telemetry...</div>;
  if (error) return <div style={{ color: '#ef4444', padding: '40px' }}>Error: {error}</div>;
  if (!metrics) return null;

  return (
    <div style={{
      padding: '40px',
      background: '#0d1127',
      minHeight: '100vh',
      color: '#fff',
      fontFamily: 'Inter, sans-serif'
    }}>
      <button 
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'transparent',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          marginBottom: '30px',
          fontSize: '1rem'
        }}
      >
        <ChevronLeft size={20} />
        Back to App
      </button>

      <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Quantora Telemetry Command Center
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '40px' }}>Real-time monitoring of AI traffic, active SSE connections, and API latency.</p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '24px',
        marginBottom: '40px'
      }}>
        {/* KPI Cards */}
        <KpiCard title="Active Streams (Live)" value={metrics.activeConnections} icon={<Activity size={24} color="#10b981" />} />
        <KpiCard title="Total AI Chats" value={metrics.totalRequests} icon={<Database size={24} color="#3b82f6" />} />
        <KpiCard title="Avg Latency" value={`${metrics.avgLatency}ms`} icon={<Clock size={24} color="#f59e0b" />} />
        <KpiCard title="Peak Connections" value={metrics.peakConcurrentConnections} icon={<Users size={24} color="#8b5cf6" />} />
      </div>

      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '30px'
      }}>
        <h3 style={{ marginBottom: '20px', color: '#e2e8f0' }}>Hourly Traffic Volume</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '200px', marginTop: '20px' }}>
          {metrics.hourlyTraffic.map((count, i) => {
            const max = Math.max(...metrics.hourlyTraffic, 1);
            const heightPct = (count / max) * 100;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  minHeight: '4px',
                  background: 'linear-gradient(to top, rgba(56, 189, 248, 0.2), rgba(56, 189, 248, 0.8))',
                  borderRadius: '4px'
                }}></div>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{i}h</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const KpiCard = ({ title, value, icon }) => (
  <div style={{
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '20px'
  }}>
    <div style={{
      width: '56px',
      height: '56px',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.05)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff' }}>{value}</div>
    </div>
  </div>
);

export default AdminDashboard;
