import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const GoogleAuthContext = createContext({ clientId: '' });
const GIS_SRC = 'https://accounts.google.com/gsi/client';

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
      // The script may already have completed before the listeners were attached.
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

    loadGoogleIdentityScript()
      .then((google) => {
        if (cancelled || !buttonRef.current) return;

        const host = window.location.hostname.toLowerCase();
        const isVercelPreview = host.endsWith('.vercel.app') && host !== 'quantora-platform-git-main-sartho.vercel.app';

        buttonRef.current.replaceChildren();

        if (isVercelPreview) {
          // Preview uses a full-page redirect instead of a popup. This avoids
          // popup/FedCM/ITP communication failures and guarantees Google posts
          // the credential to an observable server endpoint.
          google.accounts.id.initialize({
            client_id: clientId,
            ux_mode: 'redirect',
            login_uri: `${window.location.origin}/api/auth/verify`,
            auto_select: false,
          });
        } else {
          // Preserve the existing production behaviour until Preview proves the
          // redirect flow end-to-end.
          google.accounts.id.initialize({
            client_id: clientId,
            ux_mode: 'popup',
            callback: (credentialResponse) => onSuccess?.(credentialResponse),
            auto_select: false,
          });
        }

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
