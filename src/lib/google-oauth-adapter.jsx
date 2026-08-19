import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const GoogleAuthContext = createContext({ clientId: '' });
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const PREVIEW_HOST = 'quantora-platform-git-travel-provider-gateway-v1-sartho.vercel.app';
const MAIN_VERCEL_HOST = 'quantora-platform-git-main-sartho.vercel.app';

let scriptPromise = null;

function loadGoogleIdentityScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google sign-in requires a browser.'));
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.google?.accounts?.id) resolve(window.google);
      else reject(new Error('Google Identity Services loaded without the expected API.'));
    };

    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Identity Services failed to load.')), { once: true });
      setTimeout(() => {
        if (window.google?.accounts?.id) resolve(window.google);
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
  return (
    <GoogleAuthContext.Provider value={{ clientId: String(clientId || '').trim() }}>
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function GoogleLogin({
  onSuccess,
  onError,
  shape = 'pill',
  theme = 'outline',
  text = 'signin_with',
  size = 'large',
}) {
  const { clientId } = useContext(GoogleAuthContext);
  const buttonRef = useRef(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    if (!clientId) {
      const message = 'Google sign-in is not configured for this deployment.';
      setLoadError(message);
      onError?.();
      return undefined;
    }

    const host = window.location.hostname.toLowerCase();
    const isVercelPreview = host.endsWith('.vercel.app') && host !== MAIN_VERCEL_HOST;

    /*
     * Google popup mode only requires the page origin to be authorized; it does
     * not depend on an Authorized Redirect URI. Vercel creates random deployment
     * hosts, so canonicalise Preview traffic to the stable branch alias before
     * Google initializes. Production remains on its existing hostname.
     */
    if (isVercelPreview && host !== PREVIEW_HOST) {
      const canonical = new URL(window.location.href);
      canonical.protocol = 'https:';
      canonical.host = PREVIEW_HOST;
      window.location.replace(canonical.toString());
      return undefined;
    }

    loadGoogleIdentityScript()
      .then((google) => {
        if (cancelled || !buttonRef.current) return;

        buttonRef.current.replaceChildren();

        google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: (credentialResponse) => onSuccess?.(credentialResponse),
          auto_select: false,
        });

        google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          shape,
          theme,
          text,
          size,
        });
        setLoadError('');
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Google sign-in bootstrap failed:', error);
        setLoadError(error?.message || 'Google sign-in could not be loaded.');
        onError?.();
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, onError, onSuccess, shape, size, text, theme]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div ref={buttonRef} />
      {loadError ? (
        <div role="alert" style={{ color: '#ef4444', fontSize: '0.82rem', maxWidth: '360px' }}>
          {loadError}
        </div>
      ) : null}
    </div>
  );
}
