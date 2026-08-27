import React, { useState } from 'react';
import { Server } from 'lucide-react';
import { clearClientSecrets, setClientSecret } from '../lib/client-secrets.js';

export default function SessionProviderKeysCard({ isLight }) {
  const [geminiKey, setGeminiKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [status, setStatus] = useState('');
  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#475569' : '#94a3b8';
  const itemBg = isLight ? '#f8fafc' : 'rgba(255,255,255,0.03)';
  const border = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.05)';
  const inputStyle = {
    padding: '11px 12px', borderRadius: '10px', border: `1px solid ${border}`,
    background: itemBg, color: textColor,
  };

  return (
    <div className="glass-card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <Server size={20} color="#0284c7" />
        <h3 style={{ fontSize: '1.1rem', margin: 0, color: textColor }}>Session-only provider keys</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        <input
          type="password"
          autoComplete="off"
          aria-label="Gemini API key"
          value={geminiKey}
          onChange={(event) => setGeminiKey(event.target.value)}
          placeholder="Gemini API key"
          style={inputStyle}
        />
        <input
          type="password"
          autoComplete="off"
          aria-label="OpenRouter API key"
          value={openRouterKey}
          onChange={(event) => setOpenRouterKey(event.target.value)}
          placeholder="OpenRouter API key"
          style={inputStyle}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
        <button
          type="button"
          onClick={() => {
            setClientSecret('gemini', geminiKey);
            setClientSecret('openrouter', openRouterKey);
            setGeminiKey('');
            setOpenRouterKey('');
            setStatus('Keys are active for this tab only.');
          }}
          disabled={!geminiKey.trim() && !openRouterKey.trim()}
          style={{ padding: '9px 14px', borderRadius: '9px', border: 0, background: '#0284c7', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          Use for this tab
        </button>
        <button
          type="button"
          onClick={() => {
            clearClientSecrets();
            setGeminiKey('');
            setOpenRouterKey('');
            setStatus('Session keys cleared.');
          }}
          style={{ padding: '9px 14px', borderRadius: '9px', border: `1px solid ${border}`, background: 'transparent', color: textColor, fontWeight: 700, cursor: 'pointer' }}
        >
          Clear session keys
        </button>
        {status ? <span role="status" style={{ fontSize: '0.78rem', color: subtextColor }}>{status}</span> : null}
      </div>
    </div>
  );
}
