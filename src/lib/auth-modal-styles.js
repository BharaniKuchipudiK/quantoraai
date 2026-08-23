/**
 * Sign-in chrome must not inherit landing filters, blend modes, or z-index wars.
 * Google's iframe also needs a light color-scheme well or the button vanishes.
 */

export const AUTH_MODAL_Z_INDEX = 10000;

export function authModalOverlayStyle() {
  return {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.82)',
    backdropFilter: 'blur(12px)',
    zIndex: AUTH_MODAL_Z_INDEX,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    isolation: 'isolate',
    mixBlendMode: 'normal',
    filter: 'none',
  };
}

export function authModalCardStyle(isLight) {
  const light = Boolean(isLight);
  return {
    background: light ? '#ffffff' : '#111827',
    color: light ? '#0f172a' : '#ffffff',
    borderRadius: '28px',
    maxWidth: '540px',
    width: '100%',
    padding: '64px 40px',
    boxShadow: light
      ? '0 40px 120px rgba(0, 0, 0, 0.15)'
      : '0 40px 120px rgba(0, 0, 0, 0.8)',
    textAlign: 'center',
    position: 'relative',
    isolation: 'isolate',
    mixBlendMode: 'normal',
    filter: 'none',
  };
}

export function authGoogleWellStyle() {
  return {
    background: '#ffffff',
    borderRadius: '999px',
    padding: '10px 14px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    colorScheme: 'light',
  };
}
