import React from 'react';
import { ShieldCheck, Lock, Server, CheckCircle2, UserCheck, AlertTriangle } from 'lucide-react';
import SessionProviderKeysCard from './SessionProviderKeysCard.jsx';

export default function PrivacyVault({ user, isLight }) {
  const textColor = isLight ? '#0f172a' : '#ffffff';
  const subtextColor = isLight ? '#475569' : '#94a3b8';
  const itemBg = isLight ? '#f8fafc' : 'rgba(255,255,255,0.03)';
  const borderSubtle = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.05)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Banner */}
      <div className="glass-card" style={{ padding: '24px', background: isLight ? 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)' : 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.1) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <ShieldCheck size={24} color="#f472b6" />
              <h2 style={{ fontSize: '1.4rem', margin: 0 }} className="gradient-text-pink">
                Privacy, Trust & Authentication Vault
              </h2>
            </div>
            <p style={{ fontSize: '0.88rem', color: subtextColor, margin: 0 }}>
              Signed sessions, server-side access control, and explicit notes about what is and is not enforced today.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', background: 'rgba(236, 72, 153, 0.15)', border: '1px solid rgba(236, 72, 153, 0.4)', color: '#db2777', padding: '6px 12px', borderRadius: '8px', fontWeight: '600' }}>
              🔒 BYOK keys are memory-only for this tab
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Authentication Status & Security Toggles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Google OAuth & Identity Card */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: `1px solid ${borderSubtle}`, paddingBottom: '12px' }}>
            <UserCheck size={20} color="#0284c7" />
            <h3 style={{ fontSize: '1.1rem', margin: 0, color: textColor }}>Authentication Status</h3>
          </div>

          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: itemBg, padding: '16px', borderRadius: '12px' }}>
                <img src={user.avatar} alt={user.name} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: textColor }}>{user.name}</h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: subtextColor }}>{user.email}</p>
                  <span style={{ fontSize: '0.7rem', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontWeight: '600' }}>
                    <CheckCircle2 size={12} /> {user.authProvider} (Verified)
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '0.8rem', color: subtextColor, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${borderSubtle}`, paddingBottom: '6px' }}>
                  <span>Account Tier</span>
                  <strong style={{ color: '#7c3aed' }}>{user.tier}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${borderSubtle}`, paddingBottom: '6px' }}>
                  <span>Token Format</span>
                  <strong style={{ color: '#0284c7' }}>Signed HttpOnly session cookie</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Session Storage</span>
                  <strong style={{ color: '#059669' }}>Server-issued cookie</strong>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px' }}>
              <p style={{ fontSize: '0.9rem', color: subtextColor, marginBottom: '16px' }}>
                You are currently running in <strong>Guest Sandbox Mode</strong>. Sign in with Google to sync your projects securely across iOS, Android, and Web.
              </p>
            </div>
          )}
        </div>

        {/* Privacy Guardrails */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: `1px solid ${borderSubtle}`, paddingBottom: '12px' }}>
            <Lock size={20} color="#db2777" />
            <h3 style={{ fontSize: '1.1rem', margin: 0, color: textColor }}>Privacy Guardrails</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: itemBg, padding: '14px', borderRadius: '12px' }}>
              <div>
                <span style={{ fontSize: '0.9rem', fontWeight: '600', color: textColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} color="#059669" /> Enforced today
                </span>
                <p style={{ fontSize: '0.75rem', color: subtextColor, margin: '2px 0 0 0' }}>
                  Google sign-in is verified server-side, sessions are signed and HttpOnly, and unapproved candidate models are not supposed to be routed with server-owned keys.
                </p>
              </div>
            </div>

            <div style={{ background: itemBg, padding: '14px', borderRadius: '12px' }}>
              <div>
                <span style={{ fontSize: '0.9rem', fontWeight: '600', color: textColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={16} color="#db2777" /> Important limitation
                </span>
                <p style={{ fontSize: '0.75rem', color: subtextColor, margin: '2px 0 0 0' }}>
                  Quantora does not yet enforce zero-retention provider mode or fully local browser-only model execution. When you send a request, provider traffic follows the selected model and deployment configuration.
                </p>
              </div>
            </div>

            <div style={{ background: itemBg, padding: '14px', borderRadius: '12px' }}>
              <div>
                <span style={{ fontSize: '0.9rem', fontWeight: '600', color: textColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Server size={16} color="#0284c7" /> Bring-your-own-key
                </span>
                <p style={{ fontSize: '0.75rem', color: subtextColor, margin: '2px 0 0 0' }}>
                  Add a <strong>Gemini</strong> or <strong>OpenRouter</strong> key below. Keys stay only in memory for this browser tab, are attached to provider requests through Quantora, and are never written to localStorage.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SessionProviderKeysCard isLight={isLight} />


    </div>
  );
}
