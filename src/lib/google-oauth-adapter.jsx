import React, { createContext, useContext, useEffect } from 'react';

const GoogleAuthContext = createContext({ clientId: '' });
const PREVIEW_HOST = 'quantora-platform-git-travel-provider-gateway-v1-sartho.vercel.app';
const MAIN_VERCEL_HOST = 'quantora-platform-git-main-sartho.vercel.app';

export function GoogleOAuthProvider({ clientId, children }) {
  const normalizedClientId = String(clientId || '').trim();

  useEffect(() => {
    const host = window.location.hostname.toLowerCase();
    const isVercelPreview = host.endsWith('.vercel.app') && host !== MAIN_VERCEL_HOST;

    // OAuth configuration is registered against one stable Preview origin.
    // Never let a random Vercel deployment hostname enter the auth flow.
    if (isVercelPreview && host !== PREVIEW_HOST) {
      const canonical = new URL(window.location.href);
      canonical.protocol = 'https:';
      canonical.host = PREVIEW_HOST;
      window.location.replace(canonical.toString());
    }
  }, []);

  return (
    <GoogleAuthContext.Provider value={{ clientId: normalizedClientId }}>
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function GoogleLogin({ onError, theme = 'outline' }) {
  const { clientId } = useContext(GoogleAuthContext);

  const startGoogleLogin = () => {
    if (!clientId) {
      onError?.({ type: 'misconfigured' });
      return;
    }

    // Preview intentionally uses a top-level navigation instead of a popup.
    // Safari/browser popup settings therefore cannot block authentication.
    window.location.assign('/api/auth/verify');
  };

  const dark = theme === 'filled_black';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
      <button
        type="button"
        onClick={startGoogleLogin}
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
          cursor: 'pointer',
        }}
      >
        <span aria-hidden="true" style={{ fontWeight: 800, fontSize: '18px' }}>G</span>
        <span>Continue with Google</span>
      </button>
    </div>
  );
}
