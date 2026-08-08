import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Header from './components/Header';
import AiStudio from './components/AiStudio';
import DreamActionCanvas from './components/DreamActionCanvas';
import QuantumPlayground from './components/QuantumPlayground';
import PrivacyVault from './components/PrivacyVault';
import BeeSwarmCanvas from './components/BeeSwarmCanvas';
import { UserCheck, ShieldCheck, UserPlus, ArrowRight } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('quantora_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState('landing');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [themeMode, setThemeMode] = useState('light'); // 'light' | 'dark' | 'system'

  const [showCustomAccountInput, setShowCustomAccountInput] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');

  // Compute effective theme (Light / Dark / System OS match)
  const getEffectiveTheme = () => {
    if (themeMode === 'system') {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    return themeMode || 'light';
  };

  const effectiveTheme = getEffectiveTheme();
  const isLight = effectiveTheme === 'light';

  // Synchronize HTML data-theme attribute globally
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', effectiveTheme);
      document.body.style.background = isLight ? '#ffffff' : '#070913';
      document.body.style.color = isLight ? '#0f172a' : '#ffffff';
    } catch (e) {
      console.error(e);
    }
  }, [effectiveTheme, isLight]);

  const handleGoogleLogin = (name = 'Creator', email = 'user@quantora.app') => {
    const validName = (name && typeof name === 'string' && name.trim()) ? name.trim() : 'Creator';
    const validEmail = (email && typeof email === 'string' && email.trim()) ? email.trim() : 'user@quantora.app';

    const newUser = {
      name: validName,
      email: validEmail,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(validName)}&background=f97316&color=ffffff&bold=true`,
      authProvider: "Google OAuth 2.0",
      tier: "Indie Creator ($0 / mo)",
      joinedDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };

    setUser(newUser);
    try {
      localStorage.setItem('quantora_user', JSON.stringify(newUser));
    } catch (e) {
      console.error(e);
    }

    setShowAuthModal(false);
    setShowCustomAccountInput(false);
    setCustomName('');
    setCustomEmail('');
    setActiveTab('studio');
  };

  const handleCustomAccountSubmit = (e) => {
    e.preventDefault();
    if (!customEmail || !customEmail.trim()) return;
    const formattedName = (customName && customName.trim()) ? customName.trim() : customEmail.split('@')[0];
    handleGoogleLogin(formattedName, customEmail.trim());
  };

  const handleTabChange = (tabName) => {
    if (!user && tabName !== 'landing') {
      setShowAuthModal(true);
      return;
    }
    setActiveTab(tabName);
  };

  const availableModels = [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', specialty: 'Fast Responses & Real-time Chat', badge: 'Ultra Fast', provider: 'Google AI' },
    { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B', specialty: 'Fast Reasoning & Spec Planning', badge: 'Google Open', provider: 'OpenRouter' },
    { id: 'poolside/laguna-s-2.1:free', name: 'Poolside Laguna 2.1', specialty: 'Code Synthesis & UI Generation', badge: 'Best for Coding', provider: 'OpenRouter' },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nvidia Nemotron 3 Ultra', specialty: 'High-Fidelity Reward & Alignment', badge: 'Nvidia SOTA', provider: 'OpenRouter' },
    { id: 'openai/gpt-oss-20b:free', name: 'OpenAI OSS 20B', specialty: 'General Assistant & Fast Queries', badge: 'OpenAI Baseline', provider: 'OpenRouter' },
    { id: 'cohere/north-mini-code:free', name: 'Cohere North Mini', specialty: 'Logic, Math & Quantum Algorithms', badge: 'Logic Master', provider: 'OpenRouter' }
  ];

  const [selectedModel, setSelectedModel] = useState(availableModels[0]);
  const [activeCanvasNode, setActiveCanvasNode] = useState(null);

  const handleSendToCanvas = (messageData) => {
    setActiveCanvasNode(messageData);
    handleTabChange('canvas');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: isLight ? '#ffffff' : '#070913',
      color: isLight ? '#0f172a' : '#ffffff',
      transition: 'background 0.3s ease, color 0.3s ease'
    }}>
      {/* Background Particle Engine */}
      <BeeSwarmCanvas theme={effectiveTheme} />

      {/* Main View Router */}
      {activeTab === 'landing' ? (
        <LandingPage
          onLaunchStudio={() => handleTabChange('studio')}
          onOpenAuth={() => setShowAuthModal(true)}
          user={user}
        />
      ) : (
        <>
          <Header
            activeTab={activeTab}
            setActiveTab={handleTabChange}
            user={user}
            setUser={setUser}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            availableModels={availableModels}
            onOpenAuth={() => setShowAuthModal(true)}
            themeMode={themeMode}
            setThemeMode={setThemeMode}
            isLight={isLight}
          />

          <main style={{
            flex: 1,
            maxWidth: '1400px',
            width: '100%',
            margin: '0 auto',
            padding: '24px',
            position: 'relative',
            zIndex: 10
          }}>
            {activeTab === 'studio' && (
              <AiStudio
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                availableModels={availableModels}
                onPushToCanvas={handleSendToCanvas}
                onSendToCanvas={handleSendToCanvas}
                user={user}
                isLight={isLight}
              />
            )}

            {activeTab === 'canvas' && (
              <DreamActionCanvas
                activeCanvasNode={activeCanvasNode}
                setActiveCanvasNode={setActiveCanvasNode}
                isLight={isLight}
              />
            )}

            {activeTab === 'quantum' && (
              <QuantumPlayground
                selectedModel={selectedModel}
                isLight={isLight}
              />
            )}

            {activeTab === 'vault' && (
              <PrivacyVault
                user={user}
                isLight={isLight}
              />
            )}
          </main>
        </>
      )}

      {/* Google OAuth Modal */}
      {showAuthModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(12px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            color: '#1f2937',
            borderRadius: '24px',
            maxWidth: '440px',
            width: '100%',
            padding: '36px 32px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
            textAlign: 'center',
            position: 'relative'
          }}>
            <button
              onClick={() => {
                setShowAuthModal(false);
                setShowCustomAccountInput(false);
              }}
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: '#f3f4f6',
                border: 'none',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '1.1rem',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            </div>

            <h2 style={{ fontSize: '1.4rem', fontWeight: '700', margin: '0 0 6px 0', color: '#111827' }}>
              Sign in with Google
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#6b7280', margin: '0 0 20px 0' }}>
              to access the <strong style={{ color: '#111827' }}>Quantora AI Platform</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left', marginBottom: '20px' }}>
              {/* If user is already logged in, allow 1-click continuation */}
              {user && (
                <div
                  onClick={() => handleGoogleLogin(user.name, user.email)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1.5px solid #2563eb',
                    cursor: 'pointer',
                    background: '#eff6ff',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #f97316 0%, #8b5cf6 100%)',
                    color: '#ffffff',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem'
                  }}>
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.94rem', fontWeight: '700', color: '#1e3a8a' }}>Continue as {user.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#3b82f6' }}>{user.email}</div>
                  </div>
                </div>
              )}

              {/* Form to enter custom Google Account */}
              <form onSubmit={handleCustomAccountSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Google Account / Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="Enter your Gmail or Workspace email"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Full Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Enter your name"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '10px',
                    fontWeight: '700',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '4px',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                  }}
                >
                  <span>Continue with Google</span>
                  <ArrowRight size={16} />
                </button>
              </form>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>OR</span>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
              </div>

              {/* Quick Guest Creator option */}
              <button
                type="button"
                onClick={() => handleGoogleLogin('Creator Guest', 'guest@quantora.app')}
                style={{
                  background: '#f8fafc',
                  color: '#475569',
                  border: '1px dashed #cbd5e1',
                  padding: '10px',
                  borderRadius: '10px',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}
              >
                <UserPlus size={16} />
                <span>Instant Demo Sign In (Guest Creator)</span>
              </button>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.5 }}>
              To continue, Google will share your name, email address, and profile picture with Quantora.
            </div>
          </div>
        </div>
      )}

      {/* Global Footer */}
      <footer style={{
        borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(249, 115, 22, 0.15)',
        background: isLight ? '#f8fafc' : 'rgba(7, 9, 19, 0.95)',
        padding: '20px 24px',
        textAlign: 'center',
        fontSize: '0.82rem',
        color: isLight ? '#64748b' : 'var(--text-secondary)',
        position: 'relative',
        zIndex: 10,
        transition: 'background 0.3s ease, border-color 0.3s ease'
      }}>
        <div style={{ maxWidth: '1300px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/quantora-logo.png" alt="QUANTORA Logo" style={{ height: '24px', objectFit: 'contain' }} />
            <span style={{ color: isLight ? '#0f172a' : '#ffffff', fontWeight: '700' }}>QUANTORA</span> • PROMPT TO ACTION
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <span onClick={() => handleTabChange('landing')} style={{ cursor: 'pointer', color: activeTab === 'landing' ? '#f97316' : 'currentColor' }}>Home</span>
            <span onClick={() => handleTabChange('studio')} style={{ cursor: 'pointer', color: activeTab === 'studio' ? '#f97316' : 'currentColor' }}>AI Studio</span>
            <span onClick={() => handleTabChange('canvas')} style={{ cursor: 'pointer', color: activeTab === 'canvas' ? '#f97316' : 'currentColor' }}>Dream-to-Action</span>
            <span onClick={() => handleTabChange('quantum')} style={{ cursor: 'pointer', color: activeTab === 'quantum' ? '#f97316' : 'currentColor' }}>Quantum Playground</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
