import { randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { applyCors, clientIp, isRateLimited } from '../_lib/rate-limit.js';
import { createSessionToken, setSessionCookie, isSessionConfigured } from '../_lib/session.js';
import { isAdminUser, recordSignIn } from '../_lib/store.js';
import { getRequestGeo } from '../_lib/geo.js';

/*
 * The client ID is read strictly from the environment, with no placeholder
 * fallback. Every accepted Google credential is pinned to this application.
 */
const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
const client = CLIENT_ID ? new OAuth2Client(CLIENT_ID) : null;
const PREVIEW_REDIRECT_URI = 'https://quantora-platform-git-travel-provider-gateway-v1-sartho.vercel.app/api/auth/verify';
const OAUTH_STATE_COOKIE = 'quantora_oauth_state';
const OAUTH_NONCE_COOKIE = 'quantora_oauth_nonce';
const OAUTH_FLOW_COOKIE = 'quantora_oauth_flow';

type GoogleIdentity = {
  sub: string;
  email: string;
  name: string;
  picture: string;
  emailVerified: boolean;
};

function parseRequestBody(req: any): Record<string, any> {
  if (req?.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw = typeof req?.body === 'string'
    ? req.body
    : Buffer.isBuffer(req?.body)
      ? req.body.toString('utf8')
      : '';

  if (!raw) return {};

  const contentType = String(req?.headers?.['content-type'] || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function cookieValue(req: any, name: string): string {
  const header = String(req?.headers?.cookie || '');
  for (const piece of header.split(';')) {
    const [rawKey, ...rawValue] = piece.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawValue.join('=') || '');
  }
  return '';
}

function redirectResult(res: any, ok: boolean, code = '') {
  const suffix = ok ? 'auth=success' : `auth=error&reason=${encodeURIComponent(code || 'google_sign_in_failed')}`;
  res.statusCode = 303;
  res.setHeader('Location', `/?${suffix}`);
  return res.end();
}

function temporaryOAuthCookie(name: string, value: string): string {
  // The Preview callback is a top-level GET, so SameSite=Lax is sufficient and
  // allows the state/nonce/flow cookies to survive Google -> Quantora navigation.
  return `${name}=${encodeURIComponent(value)}; Path=/api/auth/verify; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

function expiredOAuthCookie(name: string): string {
  return `${name}=; Path=/api/auth/verify; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function appendSetCookies(res: any, cookies: string[]) {
  const existing = res.getHeader?.('Set-Cookie');
  const values = Array.isArray(existing)
    ? existing.map(String)
    : existing
      ? [String(existing)]
      : [];
  res.setHeader('Set-Cookie', [...values, ...cookies]);
}

function clearPreviewOAuthCookies(res: any) {
  appendSetCookies(res, [
    expiredOAuthCookie(OAUTH_STATE_COOKIE),
    expiredOAuthCookie(OAUTH_NONCE_COOKIE),
    expiredOAuthCookie(OAUTH_FLOW_COOKIE),
  ]);
}

function servePreviewCallback(res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Signing in to Quantora</title>
</head>
<body>
  <main style="font-family:system-ui,-apple-system,sans-serif;padding:32px;color:#111">
    Signing you in to Quantora…
  </main>
  <script>
    (async function () {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const idToken = params.get('id_token') || '';
      const state = params.get('state') || '';
      const error = params.get('error') || '';

      // Remove Google's ID token from the visible URL immediately.
      history.replaceState(null, '', window.location.pathname);

      if (error || !idToken || !state) {
        const reason = encodeURIComponent(error || 'missing_google_callback');
        window.location.replace('/?auth=error&reason=' + reason);
        return;
      }

      try {
        const response = await fetch('/api/auth/verify', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_token: idToken, state, oidc_fragment: true })
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const reason = encodeURIComponent(payload.error || 'google_verification_failed');
          window.location.replace('/?auth=error&reason=' + reason);
          return;
        }

        window.location.replace('/?auth=success');
      } catch (error) {
        window.location.replace('/?auth=error&reason=callback_network_error');
      }
    })();
  </script>
</body>
</html>`);
}

function startPreviewGoogleLogin(req: any, res: any) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return res.status(404).json({ error: 'Preview sign-in route is not available here.' });
  }

  if (!client || !isSessionConfigured()) {
    console.error('Auth misconfigured: GOOGLE_CLIENT_ID and/or SESSION_SECRET missing.');
    return res.status(503).json({ error: 'Sign-in is not configured on this deployment.' });
  }

  if (isRateLimited(`login-start:${clientIp(req)}`, 20, 60_000)) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a minute.' });
  }

  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');

  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.searchParams.set('client_id', CLIENT_ID);
  authorizationUrl.searchParams.set('redirect_uri', PREVIEW_REDIRECT_URI);
  authorizationUrl.searchParams.set('response_type', 'id_token');
  authorizationUrl.searchParams.set('response_mode', 'fragment');
  authorizationUrl.searchParams.set('scope', 'openid email profile');
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('nonce', nonce);
  authorizationUrl.searchParams.set('prompt', 'select_account');

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', [
    temporaryOAuthCookie(OAUTH_STATE_COOKIE, state),
    temporaryOAuthCookie(OAUTH_NONCE_COOKIE, nonce),
    temporaryOAuthCookie(OAUTH_FLOW_COOKIE, '1'),
  ]);
  res.statusCode = 302;
  res.setHeader('Location', authorizationUrl.toString());
  return res.end();
}

async function verifyGoogleCredential(credential: string, expectedNonce = ''): Promise<GoogleIdentity> {
  if (!client) throw new Error('Google OAuth client is not configured.');

  // Sign in with Google and the popup-free Preview OIDC flow both return a JWT
  // ID token. The access-token branch remains for compatibility with any older
  // Preview tab that still completes the direct token-client flow.
  const looksLikeIdToken = credential.split('.').length === 3;

  if (looksLikeIdToken) {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new Error('Invalid Google ID token payload.');
    if (payload.email_verified === false) throw new Error('Google email is not verified.');
    if (expectedNonce && payload.nonce !== expectedNonce) {
      throw new Error('Google ID token nonce mismatch.');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture || '',
      emailVerified: true,
    };
  }

  // Access tokens are opaque. Ask Google's token-info endpoint through the
  // official auth library and reject any token not issued to this client ID.
  const tokenInfo = await client.getTokenInfo(credential);
  if (!tokenInfo?.aud || tokenInfo.aud !== CLIENT_ID) {
    throw new Error('Google access token audience does not match this application.');
  }

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${credential}` },
  });
  if (!profileResponse.ok) {
    throw new Error(`Google userinfo request failed (${profileResponse.status}).`);
  }

  const profile = await profileResponse.json() as Record<string, any>;
  if (!profile?.sub || !profile.email) throw new Error('Google userinfo response is missing identity fields.');
  if (profile.email_verified === false) throw new Error('Google email is not verified.');

  return {
    sub: String(profile.sub),
    email: String(profile.email),
    name: String(profile.name || String(profile.email).split('@')[0]),
    picture: String(profile.picture || ''),
    emailVerified: profile.email_verified !== false,
  };
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // First GET starts Google. The top-level GET coming back from Google carries
    // the short-lived flow cookie and serves a tiny fragment-to-POST bridge.
    if (cookieValue(req, OAUTH_FLOW_COOKIE) === '1') {
      return servePreviewCallback(res);
    }
    return startPreviewGoogleLogin(req, res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use GET or POST.' });
  }

  const contentType = String(req?.headers?.['content-type'] || '').toLowerCase();
  const redirectSubmission = contentType.includes('application/x-www-form-urlencoded');
  const body = parseRequestBody(req);

  if (isRateLimited(`login:${clientIp(req)}`, 10, 60_000)) {
    if (redirectSubmission) return redirectResult(res, false, 'rate_limited');
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a minute.' });
  }

  if (!client || !isSessionConfigured()) {
    console.error('Auth misconfigured: GOOGLE_CLIENT_ID and/or SESSION_SECRET missing.');
    if (redirectSubmission) return redirectResult(res, false, 'misconfigured');
    return res.status(503).json({ error: 'Sign-in is not configured on this deployment.' });
  }

  try {
    const oidcFragment = body.oidc_fragment === true && typeof body.id_token === 'string';
    const oidcFormPost = redirectSubmission && typeof body.id_token === 'string';
    const credential = String(body.id_token || body.credential || '').trim();
    if (!credential) {
      if (redirectSubmission) return redirectResult(res, false, 'missing_credential');
      return res.status(400).json({ error: 'Missing credential token' });
    }

    let expectedNonce = '';

    if (oidcFragment || oidcFormPost) {
      const bodyState = String(body.state || '');
      const cookieState = cookieValue(req, OAUTH_STATE_COOKIE);
      expectedNonce = cookieValue(req, OAUTH_NONCE_COOKIE);

      if (!bodyState || !cookieState || bodyState !== cookieState || !expectedNonce) {
        console.warn('Google OIDC sign-in rejected: state/nonce cookie mismatch.');
        clearPreviewOAuthCookies(res);
        if (redirectSubmission) return redirectResult(res, false, 'csrf');
        return res.status(401).json({ error: 'Google sign-in state validation failed.' });
      }
    } else if (redirectSubmission) {
      // Compatibility with the previous GIS redirect experiment.
      const bodyCsrf = String(body.g_csrf_token || '');
      const cookieCsrf = cookieValue(req, 'g_csrf_token');
      if (!bodyCsrf || !cookieCsrf || bodyCsrf !== cookieCsrf) {
        console.warn('Google redirect sign-in rejected: CSRF token mismatch.');
        return redirectResult(res, false, 'csrf');
      }
    }

    const identity = await verifyGoogleCredential(credential, expectedNonce);

    const stored = await recordSignIn({
      sub: identity.sub,
      email: identity.email,
      name: identity.name,
      picture: identity.picture,
      geo: getRequestGeo(req),
    });

    if (stored?.blocked_at) {
      console.warn('Blocked account attempted sign-in:', identity.sub);
      clearPreviewOAuthCookies(res);
      if (redirectSubmission) return redirectResult(res, false, 'blocked');
      return res.status(403).json({
        error: stored.blocked_reason || 'This account has been suspended.',
      });
    }

    const token = createSessionToken({
      sub: identity.sub,
      email: identity.email,
      name: identity.name,
      picture: identity.picture,
    });
    if (!token) {
      clearPreviewOAuthCookies(res);
      if (redirectSubmission) return redirectResult(res, false, 'session_unavailable');
      return res.status(503).json({ error: 'Sign-in is not configured on this deployment.' });
    }

    setSessionCookie(res, token);
    clearPreviewOAuthCookies(res);

    if (redirectSubmission) {
      console.info('Google redirect sign-in completed successfully.');
      return redirectResult(res, true);
    }

    const isAdmin = await isAdminUser(identity.sub);
    const verifiedUser = {
      name: identity.name || 'Creator',
      email: identity.email || 'user@quantora.app',
      avatar: identity.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(identity.name || 'Creator')}&background=f97316&color=ffffff&bold=true`,
      authProvider: 'Google OAuth 2.0 (Verified)',
      tier: 'Indie Creator ($0 / mo)',
      joinedDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      isAdmin: isAdmin === true,
    };

    console.info('Google Preview sign-in completed successfully.');
    return res.status(200).json(verifiedUser);
  } catch (error: any) {
    console.error('Google credential verification failed:', error.message || error);
    clearPreviewOAuthCookies(res);
    if (redirectSubmission) return redirectResult(res, false, 'token_verification');
    return res.status(401).json({ error: 'Authentication failed or token expired.' });
  }
}
