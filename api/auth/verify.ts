import { OAuth2Client } from 'google-auth-library';
import { applyCors, clientIp, isRateLimited } from '../_lib/rate-limit.js';
import { createSessionToken, setSessionCookie, isSessionConfigured } from '../_lib/session.js';
import { isAdminUser, recordSignIn } from '../_lib/store.js';
import { getRequestGeo } from '../_lib/geo.js';

/*
 * The client ID is read strictly from the environment, with no placeholder
 * fallback. `audience` pins every accepted Google token to this application.
 */
const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
const client = CLIENT_ID ? new OAuth2Client(CLIENT_ID) : null;

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

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
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
    const credential = String(body.credential || '').trim();
    if (!credential) {
      if (redirectSubmission) return redirectResult(res, false, 'missing_credential');
      return res.status(400).json({ error: 'Missing credential token' });
    }

    /*
     * Google GIS redirect mode uses the double-submit-cookie CSRF pattern.
     * Require the cookie/body values to match before trusting the posted ID
     * token. JSON popup submissions do not contain this GIS redirect token.
     */
    if (redirectSubmission) {
      const bodyCsrf = String(body.g_csrf_token || '');
      const cookieCsrf = cookieValue(req, 'g_csrf_token');
      if (!bodyCsrf || !cookieCsrf || bodyCsrf !== cookieCsrf) {
        console.warn('Google redirect sign-in rejected: CSRF token mismatch.');
        return redirectResult(res, false, 'csrf');
      }
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      if (redirectSubmission) return redirectResult(res, false, 'invalid_payload');
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    if (!payload.email || payload.email_verified === false) {
      if (redirectSubmission) return redirectResult(res, false, 'unverified_email');
      return res.status(401).json({ error: 'This Google account has no verified email address.' });
    }

    const stored = await recordSignIn({
      sub: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture || '',
      geo: getRequestGeo(req),
    });

    if (stored?.blocked_at) {
      console.warn('Blocked account attempted sign-in:', payload.sub);
      if (redirectSubmission) return redirectResult(res, false, 'blocked');
      return res.status(403).json({
        error: stored.blocked_reason || 'This account has been suspended.',
      });
    }

    const token = createSessionToken({
      sub: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture || '',
    });
    if (!token) {
      if (redirectSubmission) return redirectResult(res, false, 'session_unavailable');
      return res.status(503).json({ error: 'Sign-in is not configured on this deployment.' });
    }

    setSessionCookie(res, token);

    if (redirectSubmission) {
      console.info('Google redirect sign-in completed successfully.');
      return redirectResult(res, true);
    }

    const isAdmin = await isAdminUser(payload.sub);
    const verifiedUser = {
      name: payload.name || 'Creator',
      email: payload.email || 'user@quantora.app',
      avatar: payload.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(payload.name || 'Creator')}&background=f97316&color=ffffff&bold=true`,
      authProvider: 'Google OAuth 2.0 (Verified)',
      tier: 'Indie Creator ($0 / mo)',
      joinedDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      isAdmin: isAdmin === true,
    };

    return res.status(200).json(verifiedUser);
  } catch (error: any) {
    console.error('Token verification failed:', error.message || error);
    if (redirectSubmission) return redirectResult(res, false, 'token_verification');
    return res.status(401).json({ error: 'Authentication failed or token expired.' });
  }
}
