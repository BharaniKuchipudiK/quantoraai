import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const GoogleAuthContext = createContext({ clientId: '', scriptReady: false, scriptError: '' });
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const PREVIEW_HOST = 'quantora-platform-git-travel-provider-gateway-v1-sartho.vercel.app';
const MAIN_VERCEL_HOST = 'quantora-platform-git-main-sartho.vercel.app';

let scriptPromise = null;

function loadGoogleIdentityScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google sign-in requires a browser.'));
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error('Google Identity Services loaded without the OAuth API.'));
    };

    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Identity Services failed to load.')), { once: true });
      setTimeout(() => {
        if (window.google?.accounts?.oauth2) resolve(window.google);
      }, 0);
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = finish;
    script.onerror = () => reject(new Error('Google Identity Services failed to load.'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function GoogleOAuthProvider({ clientId, children }) {
  const normalizedClientId = String(clientId || '').trim();
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState('');

  useEffect(() => {
    let cancelled = false;

    if (!normalizedClientId) {
      setScriptError('Google sign-in is not configured for this deployment.');
      return undefined;
    }

    const host = window.location.hostname.toLowerCase();
    const isVercelPreview = host.endsWith('.vercel.app') && host !== MAIN_VERCEL_HOST;

    // Keep one stable browser origin for Google OAuth. Random Vercel deployment
    // hosts are deliberately canonicalised before the OAuth client is created.
    if (isVercelPreview && host !== PREVIEW_HOST) {
      const canonical = new URL(window.location.href);
      canonical.protocol = 'https:';
      canonical.host = PREVIEW_HOST;
      window.location.replace(canonical.toString());
      return undefined;
    }

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled) return;
        setScriptReady(true);
        setScriptError('');
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Google OAuth bootstrap failed:', error);
        setScriptReady(false);
        setScriptError(error?.message || 'Google sign-in could not be loaded.');
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedClientId]);

  const value = useMemo(
    () => ({ clientId: normalizedClientId, scriptReady, scriptError }),
    [normalizedClientId, scriptReady, scriptError],
  );

  return <GoogleAuthContext.Provider value={value}>{children}</GoogleAuthContext.Provider>;
}

export function GoogleLogin({ onSuccess, onError, theme = 'outline' }) {
  const { clientId, scriptReady, scriptError } = useContext(GoogleAuthContext);
  const [flowError, setFlowError] = useState('');
  const [isOpening, setIsOpening] = useState(false);

  const startGoogleLogin = () => {
    setFlowError('');

    if (!clientId) {
      const message = 'Google sign-in is not configured for this deployment.';
      setFlowError(message);
      onError?.({ type: 'misconfigured' });
      return;
    }

    if (!scriptReady || !window.google?.accounts?.oauth2) {
      const message = scriptError || 'Google sign-in is still loading. Please try again in a moment.';
      setFlowError(message);
      onError?.({ type: 'google_script_not_ready' });
      return;
    }

    setIsOpening(true);

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid email profile',
        callback: (tokenResponse) => {
          setIsOpening(false);

          if (!tokenResponse || tokenResponse.error || !tokenResponse.access_token) {
            const message = tokenResponse?.error_description || tokenResponse?.error || 'Google did not return an access token.';
            setFlowError(message);
            onError?.(tokenResponse || { type: 'missing_access_token' });
            return;
          }

          // App.jsx already sends credentialResponse.credential to the backend.
          // We intentionally put the Google access token in that existing field;
          // api/auth/verify distinguishes an access token from an ID token and
          // validates its audience before issuing a Quantora session.
          onSuccess?.({
            credential: tokenResponse.access_token,
            clientId,
            select_by: 'btn',
          });
        },
        error_callback: (error) => {
          setIsOpening(false);
          const type = error?.type || 'unknown';
          const message = type === 'popup_failed_to_open'
            ? 'Google sign-in popup was blocked by the browser.'
            : type === 'popup_closed'
              ? 'Google sign-in was closed before completion.'
              : `Google sign-in could not start (${type}).`;
          setFlowError(message);
          onError?.(error || { type });
        },
      });

      client.requestAccessToken({ prompt: 'select_account' });
    } catch (error) {
      setIsOpening(false);
      console.error('Google OAuth request failed:', error);
      const message = error?.message || 'Google sign-in could not start.';
      setFlowError(message);
      onError?.({ type: 'request_exception', message });
    }
  };

  const dark = theme === 'filled_black';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
      <button
        type="button"
        onClick={startGoogleLogin}
        disabled={!scriptReady || isOpening}
        aria-label="Continue with Google"
        style={{
          width: '300px',
          maxWidth: '100%',
          height: '42px',
          borderRadius: '999px',
          border: dark ? '1px solid #3f3f46' : '1px solid #d4d4d8',
          background: dark ? '#131316' : '#ffffff',
          color: dark ? '#ffffff' : '#202124',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: !scriptReady || isOpening ? 'not-allowed' : 'pointer',
          opacity: !scriptReady || isOpening ? 0.65 : 1,
        }}
      >
        <span aria-hidden="true" style={{ fontWeight: 800, fontSize: '18px' }}>G</span>
        <span>{isOpening ? 'Opening Google…' : 'Continue with Google'}</span>
      </button>
      {(scriptError || flowError) ? (
        <div role="alert" style={{ color: '#ef4444', fontSize: '0.82rem', maxWidth: '360px', textAlign: 'center' }}>
          {flowError || scriptError}
        </div>
      ) : null}
    </div>
  );
}
