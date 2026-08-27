import React, { useState, useEffect, useCallback } from 'react';
import LandingPage from './components/LandingPage';
import Header from './components/Header';
import AuroraBackground from './components/AuroraBackground';
import Footer from './components/Footer';
import { createJourneyNode } from './lib/build-journey';
import {
  homeHrefForTab,
  hasOAuthReturnPending,
  isIsolatedStudioPath,
  isolatedStudioHref,
  stashAfterAuthStudio,
  stashStudioPrefill,
  tabFromLocation,
  takeAfterAuthStudio,
  takeStudioPrefill,
  clearOAuthReturnPending,
} from './lib/studio-isolation.js';
import AuthModal from './components/AuthModal';
import { authModalOverlayStyle } from './lib/auth-modal-styles.js';
import {
  clearPasswordResetToken,
  peekPasswordResetToken,
  stashPasswordResetToken,
} from './lib/password-reset.js';

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
/*
 * Deploys replace hashed chunk filenames, so a tab opened BEFORE a deploy can
 * fail to lazy-load a chunk that no longer exists on the CDN
 * ("Failed to fetch dynamically imported module"). Recover by reloading once to
 * pick up the fresh index.html + chunk map. A sessionStorage guard prevents a
 * reload loop if the failure is genuine (e.g. offline).
 */
function lazyWithReload(factory) {
  return React.lazy(() =>
    factory().catch((err) => {
      try {
        if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem('quantora_chunk_reloaded')) {
          sessionStorage.setItem('quantora_chunk_reloaded', '1');
          window.location.reload();
          return new Promise(() => {}); // never resolves; the page is reloading
        }
      } catch (e) { /* ignore */ }
      throw err;
    })
  );
}

const AiStudio = lazyWithReload(() => import('./components/AiStudio'));
const DreamActionCanvas = lazyWithReload(() => import('./components/DreamActionCanvas'));
const QuantumPlayground = lazyWithReload(() => import('./components/QuantumPlayground'));
const PrivacyVault = lazyWithReload(() => import('./components/PrivacyVault'));
const AdminDashboard = lazyWithReload(() => import('./components/AdminDashboard'));
const ModelDashboard = lazyWithReload(() => import('./components/ModelDashboard'));
const WelcomeHub = lazyWithReload(() => import('./components/WelcomeHub'));
import { UserCheck, ShieldCheck, UserPlus, ArrowRight } from 'lucide-react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { CODING_DESK_AUTO_MODEL, isCodingDeskAutoSelection } from './lib/coding-desk-auto-model.js';
// import { Analytics } from '@vercel/analytics/react';
// import { SpeedInsights } from '@vercel/speed-insights/react';
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error) {
    // Stale-deploy chunk error that surfaced here instead of at the lazy
    // boundary — reload once (same guard) to recover to the current build.
    const msg = String(error?.message || error || '');
    if (/dynamically imported module|Failed to fetch|Importing a module script failed/i.test(msg)) {
      try {
        if (!sessionStorage.getItem('quantora_chunk_reloaded')) {
          sessionStorage.setItem('quantora_chunk_reloaded', '1');
          window.location.reload();
        }
      } catch (e) { /* ignore */ }
    }
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
  const [sessionReady, setSessionReady] = useState(false);
  const [activeTab, setActiveTab] = useState(() => (
    typeof window === 'undefined'
      ? 'landing'
      : tabFromLocation(window.location.pathname, window.location.search)
  ));
  const [showAuthModal, setShowAuthModal] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('signin') || params.has('reset') || Boolean(peekPasswordResetToken());
  });
  const [authResetToken, setAuthResetToken] = useState(() => {
    if (typeof window === 'undefined') return '';
    const fromUrl = new URLSearchParams(window.location.search).get('reset') || '';
    if (fromUrl) {
      stashPasswordResetToken(fromUrl);
      return fromUrl;
    }
    return peekPasswordResetToken();
  });
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' && window.localStorage.getItem('quantora_theme_mode');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch (e) { /* ignore */ }
    return 'dark';
  }); // 'light' | 'dark' | 'system'

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
      document.documentElement.style.colorScheme = effectiveTheme;
      document.body.style.background = isLight ? '#ffffff' : '#070913';
      document.body.style.color = isLight ? '#0f172a' : '#ffffff';
    } catch (e) {
      console.error(e);
    }
  }, [effectiveTheme, isLight]);

  useEffect(() => {
    try {
      window.localStorage.setItem('quantora_theme_mode', themeMode);
    } catch (e) { /* ignore */ }
  }, [themeMode]);

  const [isVerifyingLogin, setIsVerifyingLogin] = useState(false);
  const [authFinishing, setAuthFinishing] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') return true;
    return hasOAuthReturnPending();
  });
  const [loginError, setLoginError] = useState('');
  const buildGoogleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const [authProviders, setAuthProviders] = useState({
    google: Boolean(buildGoogleClientId),
    github: false,
    email: false,
    passwordReset: true,
    googleClientId: buildGoogleClientId || null,
  });
  const [providersLoaded, setProvidersLoaded] = useState(Boolean(buildGoogleClientId));
  const googleClientId = (authProviders.googleClientId || buildGoogleClientId || '').trim();

  const clearAuthQueryParams = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    ['signin', 'reset', 'auth', 'message', 'next'].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const finishAuth = useCallback((newUser) => {
    const next = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('next')
      : '';
    const resumeStudio = takeAfterAuthStudio();
    clearOAuthReturnPending();
    clearPasswordResetToken();
    setAuthResetToken('');
    setUser(newUser);
    setShowAuthModal(false);
    setAuthFinishing(false);
    clearAuthQueryParams();
    if (next === isolatedStudioHref() || resumeStudio) {
      setAuthFinishing(true);
      window.location.assign(isolatedStudioHref());
      return;
    }
    setActiveTab('hub');
  }, [clearAuthQueryParams]);

  const mapSessionUser = useCallback((data) => {
    if (!data?.user) return null;
    return {
      name: data.user.name || 'Creator',
      email: data.user.email,
      avatar: data.user.picture
        || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.user.name || 'Creator')}&background=f97316&color=ffffff&bold=true`,
      authProvider: data.user.authProvider || 'Signed in',
      tier: 'Indie Creator ($0 / mo)',
      joinedDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      isAdmin: data.user.isAdmin === true,
    };
  }, []);

  /*
   * Restore an existing session by asking the server, not by trusting a cached
   * object. A stale or edited localStorage entry cannot produce a session here:
   * if the cookie is missing, expired or tampered with, the server says null
   * and the app treats the visitor as signed out.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('reset')) return;
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/providers', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setAuthProviders((prev) => ({
            ...prev,
            github: prev.github,
            email: prev.email || true,
          }));
          return;
        }
        setAuthProviders({
          google: data.google === true || Boolean(buildGoogleClientId),
          github: data.github === true,
          email: data.email === true,
          passwordReset: data.passwordReset !== false,
          googleClientId: data.googleClientId || buildGoogleClientId || null,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProvidersLoaded(true);
      });
    return () => { cancelled = true; };
  }, [buildGoogleClientId]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const oauthReturn = params.get('auth') === 'success';
    const oauthError = params.get('auth') === 'error';

    if (oauthReturn) {
      setAuthFinishing(true);
      setShowAuthModal(false);
      clearOAuthReturnPending();
      clearAuthQueryParams();
    } else if (oauthError) {
      clearOAuthReturnPending();
      setLoginError(decodeURIComponent(params.get('message') || 'Sign-in failed.'));
      setShowAuthModal(true);
      clearAuthQueryParams();
    }

    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => {
        if (cancelled) return;
        const mapped = mapSessionUser(data);
        if (mapped) {
          if (oauthReturn) {
            finishAuth(mapped);
            return;
          }
          setUser(mapped);
          return;
        }
        if (oauthReturn) {
          setLoginError('GitHub sign-in could not be completed. Try again.');
          setShowAuthModal(true);
          setAuthFinishing(false);
          return;
        }
        try { localStorage.removeItem('quantora_user'); } catch (e) {}
      })
      .catch(() => {
        if (!cancelled && oauthReturn) {
          setLoginError('GitHub sign-in could not be completed. Try again.');
          setShowAuthModal(true);
          setAuthFinishing(false);
        }
      })
      .finally(() => {
        if (!cancelled) setSessionReady(true);
      });
    return () => { cancelled = true; };
  }, [clearAuthQueryParams, finishAuth, mapSessionUser]);

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setIsVerifyingLogin(true);
      setLoginError('');

      // Send the raw credential token to our secure backend for verification
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Authentication failed on server');
      }

      // Backend cryptographically verified the token and returned the secure profile
      const newUser = await res.json();
      finishAuth(newUser);
    } catch (error) {
      console.error("Error during secure login:", error);
      setLoginError(error.message || 'Failed to verify account securely.');
    } finally {
      setIsVerifyingLogin(false);
    }
  };

  const handleTabChange = (tabName) => {
    if (!user && tabName !== 'landing') {
      if (typeof window !== 'undefined' && isIsolatedStudioPath(window.location.pathname)) {
        window.location.assign(`/?signin=1&next=${encodeURIComponent(isolatedStudioHref())}`);
        return;
      }
      setShowAuthModal(true);
      return;
    }
    if (typeof window !== 'undefined') {
      const onDesk = isIsolatedStudioPath(window.location.pathname);
      if (tabName === 'studio' && !onDesk) {
        window.location.assign(isolatedStudioHref());
        return;
      }
      if (tabName !== 'studio' && onDesk) {
        window.location.assign(homeHrefForTab(tabName));
        return;
      }
    }
    setActiveTab(tabName);
  };

  // Start a real build from the landing hero: prefill the studio prompt, then
  // drop the visitor straight into the Studio (or the auth gate if signed out).
  // No simulation — the same box that runs every real build.
  const handleStartBuild = (prompt) => {
    if (typeof prompt === 'string' && prompt.trim()) {
      setStudioPrefill({ id: Date.now(), text: prompt.trim() });
      stashStudioPrefill(prompt.trim());
    }
    if (!user) stashAfterAuthStudio();
    handleTabChange('studio');
  };

  // Offline-safe defaults used until /api/models resolves (and if it fails).
  // Every OpenRouter id here MUST be a valid `vendor/model` slug — a bare id
  // like "deepseek-coder-v2" gets a 400 Bad Request from OpenRouter. Keep this
  // in sync with api/models.js so the app behaves identically whether or not
  // the registry endpoint responds.
  const fallbackModels = [
    { id: 'gemini-flash-latest', name: 'Gemini Flash', specialty: 'Primary Quantora route — Google, independent of OpenRouter', badge: 'Recommended', provider: 'Google', available: true, pricingKind: 'free-tier' },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B', specialty: 'Complex Planning, Analysis & Coding', badge: 'OpenRouter Free', provider: 'NVIDIA', available: true, pricingKind: 'free' },
    { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B', specialty: 'Open-weight reasoning and coding fallback', badge: 'Free Fallback', provider: 'OpenAI', available: true, pricingKind: 'free' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', specialty: 'Logic, Math & Quantum Algorithms', badge: 'Logic Master', provider: 'DeepSeek', available: true, pricingKind: 'paid' },
    { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', specialty: 'Code Synthesis & UI Generation', badge: 'Best for Coding', provider: 'Qwen', available: true, pricingKind: 'paid' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', specialty: 'Creative Writing & General Knowledge', badge: 'Open Source', provider: 'Meta', available: true, pricingKind: 'paid' },
    { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', specialty: 'Fast Reasoning & Spec Planning', badge: 'Ultra Fast', provider: 'Google', available: true, pricingKind: 'paid' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', specialty: 'General Assistant & Fast Queries', badge: 'Fast', provider: 'OpenAI', available: true, pricingKind: 'paid' },
    // No hardcoded Anthropic entry: the id moves (claude-3.5-sonnet ->
    // claude-sonnet-5 ...), and a stale one listed here as available:true is a
    // model the picker offers but the provider no longer serves. Anthropic routes
    // are discovered from the live catalogue and arrive via /api/models.
    { id: 'meta-llama/llama-3-70b-instruct', name: 'Llama 3 70B', specialty: 'Open-source powerhouse with zero filters.', badge: 'UPDATED', provider: 'Meta', available: true, pricingKind: 'free' }
  ];

  const [availableModels, setAvailableModels] = useState(fallbackModels);
  const [selectedModel, setSelectedModel] = useState(CODING_DESK_AUTO_MODEL);
  const [modelDashboard, setModelDashboard] = useState(null);

  const applyModelRegistry = useCallback((data) => {
    if (!data?.models?.length) return;
    const mapped = data.models.map((m) => ({
      id: m.id,
      name: m.name,
      specialty: m.description,
      badge: m.tag || (m.available ? 'Online' : m.unavailableReason || 'Offline'),
      provider: m.provider,
      available: m.available,
      pricingKind: m.pricingKind,
      quality: m.quality || null,
    }));
    const dynamicModels = mapped.filter(
      (m) => typeof m.id === 'string' && (m.id.includes('/') || m.id.startsWith('gemini') || m.id.startsWith('gemma'))
    );
    if (dynamicModels.length === 0) return;
    setAvailableModels(dynamicModels);
    if (data.dashboard) setModelDashboard(data.dashboard);
    setSelectedModel((current) => {
      if (isCodingDeskAutoSelection(current)) return CODING_DESK_AUTO_MODEL;
      const stillExists = dynamicModels.find((d) => d.id === current?.id);
      if (stillExists) return stillExists;
      return CODING_DESK_AUTO_MODEL;
    });
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      applyModelRegistry(data);
    } catch (err) {
      console.error('Failed to refresh model registry:', err);
    }
  }, [applyModelRegistry]);

  useEffect(() => {
    fetch('/api/models')
      .then((res) => res.json())
      .then((data) => applyModelRegistry(data))
      .catch((err) => console.error('Failed to fetch dynamic model registry:', err));
  }, [applyModelRegistry]);
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
  const [studioPrefill, setStudioPrefill] = useState(() => takeStudioPrefill());

  useEffect(() => {
    if (!sessionReady || typeof window === 'undefined') return;
    if (!isIsolatedStudioPath(window.location.pathname)) return;
    if (!user) {
      window.location.replace(`/?signin=1&next=${encodeURIComponent(isolatedStudioHref())}`);
    }
  }, [sessionReady, user]);

  const openAuth = () => {
    if (typeof window !== 'undefined' && isIsolatedStudioPath(window.location.pathname)) {
      window.location.assign(`/?signin=1&next=${encodeURIComponent(isolatedStudioHref())}`);
      return;
    }
    const storedReset = peekPasswordResetToken();
    if (storedReset) setAuthResetToken(storedReset);
    setShowAuthModal(true);
  };

  const handleSendToCanvas = (payload) => {
    const node = createJourneyNode(
      typeof payload === 'string'
        ? { brief: payload, studioPrompt: payload, title: payload.split('\n')[0]?.slice(0, 80) }
        : payload,
    );
    setDreamNodes((prev) => [node, ...prev]);
    handleTabChange('canvas');
  };

  const handleContinueInStudio = (node) => {
    const prompt = node?.studioPrompt || node?.brief || node?.title || '';
    if (prompt) {
      setStudioPrefill({ id: Date.now(), text: prompt });
      stashStudioPrefill(prompt);
    }
    handleTabChange('studio');
  };

  const isStudioShell = activeTab === 'studio';
  const isWorkspaceShell = ['studio', 'canvas', 'quantum'].includes(activeTab);
  const isFramedShell = !isStudioShell && activeTab !== 'landing';
  const shouldLoadVercelTelemetry = typeof window !== 'undefined'
    && !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  const appShell = (
    <div
      className={`app-shell${isStudioShell ? ' app-shell--studio' : ''}${isFramedShell ? ' app-shell--framed' : ''}${isWorkspaceShell ? ' app-shell--workspace' : ''}`}
      data-quantora-isolated-desk={typeof window !== 'undefined' && isIsolatedStudioPath(window.location.pathname) ? 'true' : 'false'}
      style={{
      minHeight: '100dvh',
      height: isStudioShell || isFramedShell ? '100dvh' : 'auto',
      overflow: isStudioShell || isFramedShell ? 'hidden' : 'visible',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      background: activeTab === 'landing' ? (isLight ? '#ffffff' : '#0a0a0a') : 'transparent',
      color: isLight ? '#0f172a' : '#ffffff',
      transition: 'background 0.3s ease, color 0.3s ease'
    }}>
      {/* Aurora only inside the app — landing is flat black/white */}
      {activeTab !== 'landing' && <AuroraBackground theme={effectiveTheme} />}

      {/* Main View Router */}
      {activeTab === 'landing' ? (
        <LandingPage
          onLaunchStudio={() => handleTabChange('studio')}
          onStartBuild={handleStartBuild}
          onOpenAuth={openAuth}
          user={user}
          availableModels={availableModels}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          isLight={isLight}
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
            onOpenAuth={openAuth}
            themeMode={themeMode}
            setThemeMode={setThemeMode}
            isLight={isLight}
            compact={isWorkspaceShell}
            autoHide={isWorkspaceShell}
          />

          <main className={isStudioShell ? 'app-main app-main--studio' : 'app-main'} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            maxWidth: isStudioShell ? '1800px' : '1400px',
            width: '100%',
            margin: '0 auto',
            padding: isStudioShell
              ? 'clamp(6px, 0.8vw, 12px) clamp(8px, 1.2vw, 20px)'
              : isFramedShell
                ? 'clamp(12px, 2vh, 20px) clamp(16px, 2vw, 24px)'
                : '24px',
            overflow: isStudioShell ? 'hidden' : undefined,
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
                onNavigate={handleTabChange}
                isLight={isLight}
              />
            )}

            {activeTab === 'studio' && (
              <AiStudio
                onOpenAuth={openAuth}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                availableModels={availableModels}
                modelDashboard={modelDashboard}
                onPushToCanvas={handleSendToCanvas}
                onSendToCanvas={handleSendToCanvas}
                user={user}
                isAdmin={user?.isAdmin === true}
                onModelsRefresh={refreshModels}
                isLight={isLight}
                dreamNodes={dreamNodes}
                setDreamNodes={setDreamNodes}
                setActiveTab={handleTabChange}
                prefillPrompt={studioPrefill}
              />
            )}

            {activeTab === 'canvas' && (
              <DreamActionCanvas
                isLight={isLight}
                dreamNodes={dreamNodes}
                setDreamNodes={setDreamNodes}
                onContinueInStudio={handleContinueInStudio}
                user={user}
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

            {activeTab === 'model_dashboard' && (
              <ModelDashboard
                data={modelDashboard}
                availableModels={availableModels}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
                autoSelectEnabled={false}
                onToggleAutoSelect={() => {}}
                isLight={isLight}
                isAdmin={user?.isAdmin === true}
                onModelsRefresh={refreshModels}
              />
            )}
            </React.Suspense>
          </main>
        </>
      )}

      {/* Signing-in overlay — GitHub return and Google verify */}
      {(authFinishing || isVerifyingLogin) && (
        <div
          data-quantora-auth-modal="true"
          style={authModalOverlayStyle()}
          role="status"
          aria-live="polite"
          aria-label="Signing in"
        >
          <p style={{ color: '#ffffff', fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
            Signing you in…
          </p>
        </div>
      )}

      {/* Google OAuth Modal — isolated so landing filters cannot hide the iframe */}
      {showAuthModal && (
        <AuthModal
          isLight={isLight}
          onClose={() => {
            setShowAuthModal(false);
            setLoginError('');
            clearAuthQueryParams();
          }}
          onGoogleSuccess={handleGoogleSuccess}
          onSuccess={finishAuth}
          resetToken={authResetToken}
          externalError={loginError}
          googleEnabled={authProviders.google && Boolean(googleClientId)}
          githubEnabled={authProviders.github}
          oauthReady={providersLoaded}
          passwordResetEnabled={authProviders.passwordReset !== false}
          isolatedDesk={typeof window !== 'undefined' && isIsolatedStudioPath(window.location.pathname)}
        />
      )}

      {/* Global Footer — hidden in Studio for maximum conversation real estate (Cursor-style) */}
      {!isStudioShell && (
        <Footer isLight={isLight} />
      )}
      {/* {shouldLoadVercelTelemetry && <Analytics />} */}
      {/* {shouldLoadVercelTelemetry && <SpeedInsights />} */}
    </div>
  );

  return (
    <ErrorBoundary>
      {googleClientId ? (
        <GoogleOAuthProvider clientId={googleClientId}>{appShell}</GoogleOAuthProvider>
      ) : (
        appShell
      )}
    </ErrorBoundary>
  );
}
