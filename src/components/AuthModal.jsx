import React, { useEffect, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { authGoogleWellStyle, authModalCardStyle, authModalOverlayStyle } from '../lib/auth-modal-styles.js';
import { isIsolatedStudioPath, stashOAuthReturnPending } from '../lib/studio-isolation.js';
import { clearPasswordResetToken } from '../lib/password-reset.js';
import './AuthModal.css';

const MODES = {
  LOGIN: 'login',
  SIGNUP: 'signup',
  RESET_REQUEST: 'reset-request',
  RESET_CONFIRM: 'reset-confirm',
};

export default function AuthModal({
  isLight,
  onClose,
  onSuccess,
  onGoogleSuccess,
  initialMode = MODES.LOGIN,
  resetToken = '',
  isolatedDesk = false,
  externalError = '',
  googleEnabled = true,
  githubEnabled = true,
  oauthReady = true,
  passwordResetEnabled = true,
}) {
  const [mode, setMode] = useState(resetToken ? MODES.RESET_CONFIRM : initialMode);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (resetToken) setMode(MODES.RESET_CONFIRM);
  }, [resetToken]);

  const clearMessages = () => {
    setError('');
    setNotice('');
  };

  const handleEmailAuth = async (event) => {
    event.preventDefault();
    clearMessages();
    if (mode === MODES.SIGNUP && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const endpoint = mode === MODES.SIGNUP ? '/api/auth/signup' : '/api/auth/login';
      const body = mode === MODES.SIGNUP
        ? { email, password, name }
        : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Authentication failed.');
      onSuccess(data);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetRequest = async (event) => {
    event.preventDefault();
    clearMessages();
    setBusy(true);
    try {
      const res = await fetch('/api/auth/password-reset-request', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send reset link.');
      setNotice(data.message || 'If an account exists for that email, we sent a reset link.');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetConfirm = async (event) => {
    event.preventDefault();
    clearMessages();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/password-reset-confirm', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not reset password.');
      clearPasswordResetToken();
      if (data?.email) {
        onSuccess(data);
        return;
      }
      setNotice(data.message || 'Password updated. Sign in with your new password.');
      setMode(MODES.LOGIN);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const title = {
    [MODES.LOGIN]: 'Welcome back',
    [MODES.SIGNUP]: 'Create your account',
    [MODES.RESET_REQUEST]: 'Reset password',
    [MODES.RESET_CONFIRM]: 'Choose a new password',
  }[mode];

  return (
    <div data-quantora-auth-modal="true" style={authModalOverlayStyle()}>
      <div className={`auth-modal${isLight ? ' is-light' : ' is-dark'}`} style={authModalCardStyle(isLight)}>
        <button type="button" className="auth-modal__close" onClick={onClose} aria-label="Close">✕</button>

        <p className="auth-modal__eyebrow">Quantora</p>
        <h2 className="auth-modal__title">{title}</h2>
        <p className="auth-modal__privacy">
          Google and GitHub tokens are verified and discarded. Email passwords are hashed on the server. Sessions live in an HttpOnly cookie — never in the page.
        </p>

        {externalError && !error && <div className="auth-modal__alert is-error">{externalError}</div>}
        {error && <div className="auth-modal__alert is-error">{error}</div>}
        {notice && <div className="auth-modal__alert is-notice">{notice}</div>}

        {mode !== MODES.RESET_REQUEST && mode !== MODES.RESET_CONFIRM && !isolatedDesk && oauthReady && (googleEnabled || githubEnabled) && (
          <div className="auth-modal__oauth">
            {googleEnabled && (
              <div style={authGoogleWellStyle()}>
                <GoogleLogin
                  onSuccess={(cred) => {
                    if (onGoogleSuccess) onGoogleSuccess(cred);
                    else if (cred?.credential) onSuccess({ credential: cred.credential, provider: 'google' });
                  }}
                  onError={() => setError('Google sign-in failed. Check pop-up blockers and try again.')}
                  shape="pill"
                  theme="outline"
                  text={mode === MODES.SIGNUP ? 'signup_with' : 'signin_with'}
                  size="large"
                />
              </div>
            )}
            {githubEnabled && (
              <button
                type="button"
                className="auth-modal__github"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  stashOAuthReturnPending();
                  window.location.href = '/api/auth/github';
                }}
              >
                {busy ? 'Redirecting to GitHub…' : 'Continue with GitHub'}
              </button>
            )}
          </div>
        )}

        {mode !== MODES.RESET_REQUEST && mode !== MODES.RESET_CONFIRM && !isolatedDesk && !oauthReady && (
          <p className="auth-modal__hint">Loading sign-in options…</p>
        )}

        {mode !== MODES.RESET_REQUEST && mode !== MODES.RESET_CONFIRM && !isolatedDesk && oauthReady && !googleEnabled && !githubEnabled && (
          <p className="auth-modal__hint">Social sign-in is not configured on this deployment. Use email below.</p>
        )}

        {isolatedDesk && mode !== MODES.RESET_REQUEST && mode !== MODES.RESET_CONFIRM && (
          <p className="auth-modal__hint">Sign in from the home page for Google or GitHub.</p>
        )}

        {mode !== MODES.RESET_REQUEST && mode !== MODES.RESET_CONFIRM && !isolatedDesk && oauthReady && (googleEnabled || githubEnabled) && (
          <div className="auth-modal__divider"><span>or email</span></div>
        )}

        {mode === MODES.LOGIN && (
          <form className="auth-modal__form" onSubmit={handleEmailAuth}>
            <label>
              <span>Email</span>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              <span>Password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button type="button" className="auth-modal__link" onClick={() => {
              clearMessages();
              if (!passwordResetEnabled) {
                setError('Password reset is not available right now. Sign in with Google or GitHub, or try again later.');
                return;
              }
              setMode(MODES.RESET_REQUEST);
            }}>
              Forgot password?
            </button>
            <button type="submit" className="auth-modal__submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="auth-modal__switch">
              New here?{' '}
              <button type="button" className="auth-modal__link" onClick={() => { clearMessages(); setMode(MODES.SIGNUP); }}>
                Create account
              </button>
            </p>
          </form>
        )}

        {mode === MODES.SIGNUP && (
          <form className="auth-modal__form" onSubmit={handleEmailAuth}>
            <label>
              <span>Name</span>
              <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
            </label>
            <label>
              <span>Email</span>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              <span>Password</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </label>
            <label>
              <span>Confirm password</span>
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
            </label>
            <button type="submit" className="auth-modal__submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
            <p className="auth-modal__switch">
              Already have an account?{' '}
              <button type="button" className="auth-modal__link" onClick={() => { clearMessages(); setMode(MODES.LOGIN); }}>
                Sign in
              </button>
            </p>
          </form>
        )}

        {mode === MODES.RESET_REQUEST && (
          <form className="auth-modal__form" onSubmit={handleResetRequest}>
            <p className="auth-modal__hint">Enter your email. If an account exists, we&apos;ll send a reset link.</p>
            <label>
              <span>Email</span>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <button type="submit" className="auth-modal__submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <button type="button" className="auth-modal__link" onClick={() => { clearMessages(); setMode(MODES.LOGIN); }}>
              Back to sign in
            </button>
          </form>
        )}

        {mode === MODES.RESET_CONFIRM && (
          <form className="auth-modal__form" onSubmit={handleResetConfirm}>
            <label>
              <span>New password</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </label>
            <label>
              <span>Confirm password</span>
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
            </label>
            <button type="submit" className="auth-modal__submit" disabled={busy}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
            <button type="button" className="auth-modal__link" onClick={() => { clearMessages(); setMode(MODES.LOGIN); }}>
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
