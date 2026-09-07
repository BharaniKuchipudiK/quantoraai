import React, { useState } from 'react';
import { Server } from 'lucide-react';
import { clearClientSecrets, clientSecretStatus, setClientSecret } from '../lib/client-secrets.js';

export default function SessionProviderKeysCard({ isLight }) {
  const [geminiKey, setGeminiKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [status, setStatus] = useState('');
  /*
   * Read on every render, not held in state. The store is module scope and a
   * page reload empties it, so a snapshot taken at mount would be the very lie
   * this display exists to stop telling.
   */
  const active = clientSecretStatus();
  const anyActive = active.gemini || active.openrouter;
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
      <div
        data-quantora-byok-state={anyActive ? 'active' : 'none'}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center',
          padding: '10px 12px', marginBottom: '14px', borderRadius: '10px',
          background: itemBg, border: `1px solid ${border}`,
        }}
      >
        {[
          { provider: 'gemini', label: 'Gemini', on: active.gemini },
          { provider: 'openrouter', label: 'OpenRouter', on: active.openrouter },
        ].map(({ provider, label, on }) => (
          <span
            key={provider}
            data-quantora-byok-provider={provider}
            data-quantora-byok-active={on ? 'true' : 'false'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '0.82rem', color: textColor }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: on ? '#16a34a' : (isLight ? '#cbd5e1' : '#475569'),
              }}
            />
            {label}: <strong style={{ fontWeight: 700 }}>{on ? 'your key is in use' : 'not set'}</strong>
          </span>
        ))}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: subtextColor, maxWidth: '62ch' }}>
        {anyActive
          ? 'Refreshing this page clears these keys, and turns go back to Quantora\u2019s shared allowance until you enter them again.'
          : 'Nothing is stored on our servers or on this device. Keys stay in this page only, so refreshing clears them \u2014 while they are unset, turns use Quantora\u2019s shared allowance.'}
      </p>
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
            setStatus('In use now. Refreshing this page clears them.');
          }}
          disabled={!geminiKey.trim() && !openRouterKey.trim()}
          data-quantora-byok-save
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
            setStatus('Cleared. Turns now use Quantora\u2019s shared allowance.');
          }}
          style={{ padding: '9px 14px', borderRadius: '9px', border: `1px solid ${border}`, background: 'transparent', color: textColor, fontWeight: 700, cursor: 'pointer' }}
        >
          Clear keys
        </button>
        {status ? <span role="status" style={{ fontSize: '0.78rem', color: subtextColor }}>{status}</span> : null}
      </div>
    </div>
  );
}
