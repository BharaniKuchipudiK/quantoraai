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

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              {isVerifyingLogin ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#4b5563', fontSize: '0.9rem', fontWeight: '500' }}>
                  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Cryptographically verifying with Google...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                  {loginError && (
                    <div style={{ color: '#ef4444', fontSize: '0.85rem', background: '#fef2f2', padding: '8px 12px', borderRadius: '8px', marginBottom: '8px' }}>
                      {loginError}
                    </div>
                  )}
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    useOneTap
                    shape="pill"
                    theme="filled_blue"
                    text="continue_with"
                    size="large"
                  />
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.5 }}>
              By continuing, Google will share your profile with Quantora securely.
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
            <QuantoraFullLogoSvg height={24} isDark={!isLight} />
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <span onClick={() => handleTabChange('landing')} style={{ cursor: 'pointer', color: activeTab === 'landing' ? '#f97316' : 'currentColor' }}>Home</span>
            <span onClick={() => handleTabChange('studio')} style={{ cursor: 'pointer', color: activeTab === 'studio' ? '#f97316' : 'currentColor' }}>AI Studio</span>
            <span onClick={() => handleTabChange('canvas')} style={{ cursor: 'pointer', color: activeTab === 'canvas' ? '#f97316' : 'currentColor' }}>Dream-to-Action</span>
            <span onClick={() => handleTabChange('quantum')} style={{ cursor: 'pointer', color: activeTab === 'quantum' ? '#f97316' : 'currentColor' }}>Quantum Playground</span>
            <span onClick={() => handleTabChange('dashboard')} style={{ cursor: 'pointer', color: activeTab === 'dashboard' ? '#f97316' : 'currentColor' }}>Analytics</span>
          </div>
        </div>
      </footer>
    </div>
    </GoogleOAuthProvider>
    </ErrorBoundary>
  );
}
