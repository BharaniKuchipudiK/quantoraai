import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Header from './components/Header';
import AuroraBackground from './components/AuroraBackground';

/*
 * The heavy surfaces load on demand.
 *
 * Everything used to be imported eagerly, so a first-time visitor landing on
 * the marketing page downloaded the entire studio before they could read the
 * headline — including react-syntax-highlighter, which is the single largest
 * thing in the tree and is needed only once a code block exists to render.
 *
 * These are route-level boundaries: a person sees exactly one of them at a
 * time, and switching costs one small network request on a warm connection.
 * Kept eager above: the landing page, the header and the background, which are
 * needed for the first paint and would only add a flash of nothing.
 */
const AiStudio = React.lazy(() => import('./components/AiStudio'));
const DreamActionCanvas = React.lazy(() => import('./components/DreamActionCanvas'));
const QuantumPlayground = React.lazy(() => import('./components/QuantumPlayground'));
const PrivacyVault = React.lazy(() => import('./components/PrivacyVault'));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const WelcomeHub = React.lazy(() => import('./components/WelcomeHub'));
import { QuantoraFullLogoSvg } from './components/QuantoraLogoSvg';
import { UserCheck, ShieldCheck, UserPlus, ArrowRight } from 'lucide-react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', color: '#ef4444', background: '#070913', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2>React Crash (ErrorBoundary)</h2>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState(null);
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
      document.body.style.background = isLight ? '#fdfbf7' : '#070913';
      document.body.style.color = isLight ? '#0f172a' : '#ffffff';
    } catch (e) {
      console.error(e);
    }
  }, [effectiveTheme, isLight]);

  const [isVerifyingLogin, setIsVerifyingLogin] = useState(false);
  const [loginError, setLoginError] = useState('');

  /*
   * Restore an existing session by asking the server, not by trusting a cached
   * object. A stale or edited localStorage entry cannot produce a session here:
   * if the cookie is missing, expired or tampered with, the server says null
   * and the app treats the visitor as signed out.
   */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => {
        if (cancelled) return;
        if (data?.user) {
          setUser({
            name: data.user.name || 'Creator',
            email: data.user.email,
            avatar: data.user.picture
              || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.user.name || 'Creator')}&background=f97316&color=ffffff&bold=true`,
            authProvider: 'Google OAuth 2.0 (Verified)',
            tier: 'Indie Creator ($0 / mo)',
            joinedDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          });
        } else {
          // No valid server session — clear any leftover local profile.
          try { localStorage.removeItem('quantora_user'); } catch (e) {}
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setIsVerifyingLogin(true);
      setLoginError('');

      // Send the raw credential token to our secure backend for verification
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Authentication failed on server');
      }

      // Backend cryptographically verified the token and returned the secure profile
      const newUser = await res.json();

      /*
       * The server has verified the token and set an HttpOnly session cookie.
       * The profile below is display data only — it is deliberately NOT the
       * proof of identity. Storing it in localStorage is fine for showing a
       * name and avatar; what matters is that no server route trusts it.
       */
      setUser(newUser);
      setShowAuthModal(false);
      setActiveTab('hub');
    } catch (error) {
      console.error("Error during secure login:", error);
      setLoginError(error.message || 'Failed to verify account securely.');
    } finally {
      setIsVerifyingLogin(false);
    }
  };

  const handleGoogleError = () => {
    console.log('Google Login Failed');
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
    { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', specialty: 'Code Synthesis & UI Generation', badge: 'Best for Coding', provider: 'OpenRouter' },
    { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B (Google)', specialty: 'Fast Reasoning & Spec Planning', badge: 'Ultra Fast', provider: 'OpenRouter' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', specialty: 'Logic, Math & Quantum Algorithms', badge: 'Logic Master', provider: 'OpenRouter' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', specialty: 'Creative Writing & General Knowledge', badge: 'Open Source King', provider: 'OpenRouter' },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nvidia Nemotron 3 Ultra', specialty: 'High-Fidelity Reward & Alignment', badge: 'Nvidia SOTA', provider: 'OpenRouter' },
    { id: 'openai/gpt-4o-mini', name: 'ChatGPT 4o-Mini', specialty: 'General Assistant & Fast Queries', badge: 'OpenAI Baseline', provider: 'OpenRouter' }
  ];

  const [selectedModel, setSelectedModel] = useState(availableModels[0]);
  const [activeCanvasNode, setActiveCanvasNode] = useState(null);
  const [dreamNodes, setDreamNodes] = useState(() => {
    try {
      const saved = localStorage.getItem('quantora_canvas_nodes');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('quantora_canvas_nodes', JSON.stringify(dreamNodes));
  }, [dreamNodes]);
  const [studioInputText, setStudioInputText] = useState('');

  const handleSendToCanvas = (messageData) => {
    setActiveCanvasNode(messageData);
    handleTabChange('canvas');
  };

  return (
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || "731238912-mock.apps.googleusercontent.com"}>
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: 'transparent',
      color: isLight ? '#0f172a' : '#ffffff',
      transition: 'background 0.3s ease, color 0.3s ease'
    }}>
      {/* Ambient background — see AuroraBackground for why this replaced the canvas */}
      <AuroraBackground theme={effectiveTheme} />

      {/* Main View Router */}
      {activeTab === 'landing' ? (
        <LandingPage
          onLaunchStudio={() => handleTabChange('studio')}
          onOpenAuth={() => setShowAuthModal(true)}
          user={user}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
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
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            maxWidth: '1400px',
            width: '100%',
            margin: '0 auto',
            padding: '24px',
            position: 'relative',
            zIndex: 10
          }}>
            {/*
              * Shown only while a route chunk is in flight — typically a few hundred
              * milliseconds on a cold connection, nothing on a warm one. Deliberately
              * plain: a spinner that appears and vanishes in 80ms reads as a flicker,
              * which is worse than a moment of quiet.
              */}
            <React.Suspense fallback={
              <div style={{ padding: '48px 24px', textAlign: 'center', color: isLight ? '#94a3b8' : '#64748b', fontSize: '0.9rem' }}>
                Loading…
              </div>
            }>
            {activeTab === 'hub' && (
              <WelcomeHub
                user={user}
                onNavigate={setActiveTab}
                isLight={isLight}
              />
            )}

            {activeTab === 'studio' && (
              <AiStudio
                onOpenAuth={() => setShowAuthModal(true)}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                availableModels={availableModels}
                onPushToCanvas={handleSendToCanvas}
                onSendToCanvas={handleSendToCanvas}
                user={user}
                isLight={isLight}
                dreamNodes={dreamNodes}
                setDreamNodes={setDreamNodes}
                setActiveTab={setActiveTab}
                inputText={studioInputText}
                setInputText={setStudioInputText}
              />
            )}

            {activeTab === 'canvas' && (
              <DreamActionCanvas
                activeCanvasNode={activeCanvasNode}
                setActiveCanvasNode={setActiveCanvasNode}
                isLight={isLight}
                dreamNodes={dreamNodes}
                setDreamNodes={setDreamNodes}
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

            {activeTab === 'dashboard' && (
              <AdminDashboard
                onBack={() => handleTabChange('studio')}
              />
            )}
            </React.Suspense>
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
            background: isLight ? '#ffffff' : '#1a1a1d', // Adapts to theme
            color: isLight ? '#0f172a' : '#ffffff',
            borderRadius: '48px', // Extremely rounded pill-like corners
            maxWidth: '540px',
            width: '100%',
            padding: '64px 40px',
            boxShadow: isLight ? '0 40px 120px rgba(0, 0, 0, 0.15)' : '0 40px 120px rgba(0, 0, 0, 0.8)',
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
                top: '24px',
                right: '24px',
                background: isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '1.2rem',
                color: isLight ? '#64748b' : '#a1a1aa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)'}
              onMouseLeave={e => e.currentTarget.style.background = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.1)'}
            >
              ✕
            </button>

            <p style={{ fontSize: '1.1rem', color: isLight ? '#64748b' : '#a1a1aa', margin: '0 0 16px 0', fontWeight: '400' }}>
              Welcome to
            </p>
            <h2 style={{ fontSize: '3.2rem', fontWeight: '700', margin: '0 0 24px 0', color: isLight ? '#0f172a' : '#ffffff', letterSpacing: '-0.04em', lineHeight: '1.1' }}>
              quantora/ai
            </h2>
            <p style={{ fontSize: '1.1rem', color: isLight ? '#475569' : '#d4d4d8', margin: '0 0 40px 0' }}>
              Sign in with Google
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              {isVerifyingLogin ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#a1a1aa', fontSize: '1rem', fontWeight: '500' }}>
                  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Cryptographically verifying with Google...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                  {loginError && (
                    <div style={{ color: '#ef4444', fontSize: '0.9rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 16px', borderRadius: '12px', marginBottom: '16px' }}>
                      {loginError}
                    </div>
                  )}
                  {/* Google Login Component using a dynamic pill button matching the aesthetic */}
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    useOneTap
                    shape="pill"
                    theme={isLight ? "outline" : "filled_black"}
                    text="signin"
                    size="large"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Footer */}
      <footer style={{
        borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
        background: isLight ? '#ffffff' : '#05070f',
        padding: '30px 24px',
        textAlign: 'center',
        fontSize: '0.85rem',
        color: isLight ? '#64748b' : 'var(--text-secondary)',
        position: 'relative',
        zIndex: 10,
        transition: 'background 0.3s ease, border-color 0.3s ease'
      }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <QuantoraFullLogoSvg height={22} isDark={!isLight} tagline="" />
            <span style={{ marginLeft: '4px' }}>• © 2026 Quantora AI. All rights reserved.</span>
          </div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontWeight: '500' }}>
            <span onClick={() => handleTabChange('landing')} style={{ cursor: 'pointer', color: activeTab === 'landing' ? '#f97316' : 'currentColor' }} className="hover:text-amber-500 transition-colors">Home</span>
            <span onClick={() => handleTabChange('studio')} style={{ cursor: 'pointer', color: activeTab === 'studio' ? '#f97316' : 'currentColor' }} className="hover:text-amber-500 transition-colors">AI Studio</span>
            <span onClick={() => handleTabChange('canvas')} style={{ cursor: 'pointer', color: activeTab === 'canvas' ? '#f97316' : 'currentColor' }} className="hover:text-amber-500 transition-colors">Dream Canvas</span>
            <span onClick={() => handleTabChange('quantum')} style={{ cursor: 'pointer', color: activeTab === 'quantum' ? '#f97316' : 'currentColor' }} className="hover:text-amber-500 transition-colors">Quantum</span>
            <span style={{ cursor: 'pointer', opacity: 0.6 }} className="hover:opacity-100 transition-opacity">Privacy</span>
            <span style={{ cursor: 'pointer', opacity: 0.6 }} className="hover:opacity-100 transition-opacity">Terms</span>
          </div>
        </div>
      </footer>
    </div>
    </GoogleOAuthProvider>
    </ErrorBoundary>
  );
}
