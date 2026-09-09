import React, { useState, useEffect, useCallback } from 'react';
import LandingPage from './components/LandingPage';
import Header from './components/Header';
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
import {
  buildDesktopGrantPath,
  clearDesktopAuthHandoff,
  peekDesktopAuthHandoff,
  readDesktopAuthHandoff,
  stashDesktopAuthHandoff,
  stripDesktopAuthParams,
} from './lib/desktop-auth-handoff.js';
import { CODING_DESK_AUTO_MODEL, isCodingDeskAutoSelection } from './lib/coding-desk-auto-model.js';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
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
        <div style={{ padding: '40px', color: '#ef4444', background: '#0a0a0a', minHeight: '100vh', fontFamily: 'monospace' }}>
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
      document.body.style.background = isLight ? '#ffffff' : '#0a0a0a';
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

  /*
   * Desktop sign-in handoff (docs/architecture/desktop-client-v1.md §4).
   * The grant endpoint bounces here when the browser has no session. Stash
   * the challenge/state, sign in as usual, and once a session exists send the
   * browser back to the grant so it can hand the code to the desktop app.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handoff = readDesktopAuthHandoff(window.location.search);
    if (!handoff) return;
    stashDesktopAuthHandoff(handoff);
    window.history.replaceState({}, '', stripDesktopAuthParams(window.location.href));
    setShowAuthModal(true);
  }, []);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const handoff = peekDesktopAuthHandoff();
    if (!handoff) return;
    clearDesktopAuthHandoff();
    window.location.assign(buildDesktopGrantPath(handoff));
  }, [user]);

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
  /*
   * The offline fallback, and nothing more.
   *
   * This carried eight ids marked `available: true` that nobody had verified —
   * gpt-4o-mini, gemma-2-9b-it, llama-3.3-70b-instruct, qwen-2.5-coder-32b,
   * deepseek-chat — all a generation or two behind and none of them served by
   * the registry this file's own comment says to stay in sync with. It said
   * "keep this in sync with api/models.js"; the server listed two, this listed
   * eight, and the difference was presented to people as a menu of working
   * models.
   *
   * It is now exactly the routes the server vouches for. A model missing from a
   * fallback list costs somebody one refresh. A model that is listed and dead
   * costs them a build and tells them nothing about why.
   */
  const fallbackModels = [
    { id: 'gemini-flash-latest', name: 'Gemini Flash', specialty: 'Primary Quantora route — Google, independent of OpenRouter', badge: 'Recommended', provider: 'Google', available: true, pricingKind: 'free-tier' },
    { id: 'deepseek/deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash', specialty: 'Fast, very low cost, long context — the everyday build route', badge: 'Best value', provider: 'DeepSeek', available: true, pricingKind: 'paid' },
    { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', specialty: 'Low cost with vision and long context', badge: 'Low cost', provider: 'Z.ai', available: true, pricingKind: 'paid' },
    { id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna', specialty: 'Stronger reasoning when a cheaper route falls short', badge: 'Step up', provider: 'OpenAI', available: true, pricingKind: 'paid' },
    { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash', specialty: 'Long context and vision via OpenRouter', badge: 'Vision', provider: 'Google', available: true, pricingKind: 'paid' },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B', specialty: 'Free reasoning and coding route', badge: 'Free', provider: 'NVIDIA', available: true, pricingKind: 'free' },
    { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B', specialty: 'Open-weight free fallback', badge: 'Free', provider: 'OpenAI', available: true, pricingKind: 'free' },
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
    /*
     * A degraded listing must not silently un-pin the user's model. Anthropic
     * flagships are discovered from the live provider catalogue, so a 4s fetch
     * timeout returns a list without them (source: 'fallback') — and resetting on
     * that would drop a pinned Claude back to Auto for a transient network blip,
     * which reads exactly like "the model disappeared from the list again".
     * Only reset when the listing is authoritative and the model is genuinely gone.
     */
    const listingIsAuthoritative = data.source !== 'fallback';
    setSelectedModel((current) => {
      if (isCodingDeskAutoSelection(current)) return CODING_DESK_AUTO_MODEL;
      const stillExists = dynamicModels.find((d) => d.id === current?.id);
      if (stillExists) return stillExists;
      return listingIsAuthoritative ? CODING_DESK_AUTO_MODEL : current;
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

  /*
   * Stable for the life of the app, deliberately.
   *
   * onOpenAuth={openAuth} reaches AiStudio and is a dependency of the
   * renderedChatFeed memo — the one thing keeping the conversation from
   * re-rendering all of its messages. As a plain arrow this was rebuilt on
   * every App render, so any App-level state change silently invalidated that
   * memo and re-rendered the whole thread. It closes over nothing but state
   * setters and module-level helpers, so [] is the honest dependency list.
   */
  const openAuth = useCallback(() => {
    if (typeof window !== 'undefined' && isIsolatedStudioPath(window.location.pathname)) {
      window.location.assign(`/?signin=1&next=${encodeURIComponent(isolatedStudioHref())}`);
      return;
    }
    const storedReset = peekPasswordResetToken();
    if (storedReset) setAuthResetToken(storedReset);
    setShowAuthModal(true);
  }, []);

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
      // Flat surfaces everywhere, matching the marketing homepage: white or
      // near-black, no ambient gradient behind the app.
      background: isLight ? '#ffffff' : '#0a0a0a',
      color: isLight ? '#0f172a' : '#ffffff',
      transition: 'background 0.3s ease, color 0.3s ease'
    }}>


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
            /* The Studio sidebar shows the account control; every other tab
             * has no sidebar, so the header keeps showing it there. */
            profileInShell={isStudioShell}
          />

          <main className={isStudioShell ? 'app-main app-main--studio' : 'app-main'} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            /* The shell must not be the thing that limits width. Measured on
             * 2026-09-09 with scripts/shell-width-browser-gate.mjs: at a 2000px
             * viewport the studio rendered 1800px (200px unused) and every other
             * tab 1400px (600px unused, 30% of the screen); at 2560px the studio
             * wasted 760px and the rest 1160px. The admin dashboard is the worst
             * case and the one the user reported — its own grid is already fluid
             * (auto-fit, minmax(200px, 1fr)), so it was the shell holding it in.
             *
             * Widening here is safe for reading: running text caps itself further
             * down (.markdown-prose at 860px, chat bubbles at 640-720px), so a
             * wider shell buys room for panels and grids, never a 2000px line of
             * prose. The studio is an application shell like an editor, and takes
             * the viewport; other tabs keep a ceiling so a single-column surface
             * cannot stretch absurdly on an ultrawide.
             *
             * Width belongs to each surface, not to the shell. That is not a
             * hypothetical: the hub already caps itself (.welcome-hub, 1120px) and the
             * dashboard grid already reflows, so the only thing the shell cap achieved
             * was overriding both. A first attempt kept a 2200px ceiling here for
             * non-studio tabs; the gate measured it wasting 14.1% at 2560px and it was
             * the same bandaid one size larger (.quantorarules rule 5). A surface that
             * needs a narrower measure states it on itself, where it can be read.
             *
             * scripts/shell-width-browser-gate.mjs holds both halves: at least 98% of
             * the viewport used, and no sideways scroll — so 'use the width' cannot be
             * satisfied by letting content escape instead. */
            maxWidth: 'none',
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
              />
            )}

            {activeTab === 'studio' && (
              <AiStudio
                key={`studio-account-${user?.sub || user?.email || 'signed-out'}`}
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
      {/*
        * Visitors and page views, which nothing else here can answer: the
        * usage table only ever sees a signed-in account making an AI turn, so
        * "how many people reached the site" had no source at all. Both
        * packages have been dependencies since #429 with the guard written and
        * the components left commented — planned in docs/roadmap/pipeline.md
        * and never finished.
        *
        * The guard is load-bearing, not caution: browser gates drive the app
        * on 127.0.0.1, and a third-party script loading there would add
        * network noise to every one of them.
        */}
      {shouldLoadVercelTelemetry && <Analytics />}
      {shouldLoadVercelTelemetry && <SpeedInsights />}
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
