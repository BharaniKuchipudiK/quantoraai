import { OAuth2Client } from 'google-auth-library';
import { applyCors, clientIp, isRateLimited } from '../rate-limit.js';
import { isSessionConfigured } from '../session.js';
import { issueSessionResponse } from '../auth-response.js';
import { getRequestGeo } from '../geo.js';
import { normalizeAuthEmail } from '../auth-privacy.js';
import { resolveGoogleClientId } from '../auth-env.js';

/*
 * The client ID is read strictly from the environment, with no placeholder
 * fallback.
 *
 * A hardcoded default here is worse than a crash: `audience` is what pins a
 * Google token to THIS application, and a deployment silently running with a
 * mock audience rejects every real login while looking correctly configured.
 * Missing configuration should say so plainly.
 */
const CLIENT_ID = resolveGoogleClientId();
const client = CLIENT_ID ? new OAuth2Client(CLIENT_ID) : null;

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  if (isRateLimited(`login:${clientIp(req)}`, 10, 60_000)) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a minute.' });
  }

  if (!client || !isSessionConfigured()) {
    console.error('Auth misconfigured: GOOGLE_CLIENT_ID and/or SESSION_SECRET missing.');
    return res.status(503).json({ error: 'Sign-in is not configured on this deployment.' });
  }

  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Missing credential token' });
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    /*
     * An unverified address means Google has not confirmed it belongs to this
     * person. Accepting one allows signing up as somebody else's email.
     */
    if (!payload.email || payload.email_verified === false) {
      return res.status(401).json({ error: 'This Google account has no verified email address.' });
    }

    /*
     * Same session issuer as GitHub and email. That blocks an OAuth login from
     * silently opening a second account on an email that already belongs to
     * another provider, and keeps the cookie as the only identity the API trusts.
     * The Google ID token is verified and discarded — it is never stored.
     */
    const session = await issueSessionResponse(res, {
      sub: payload.sub,
      email: normalizeAuthEmail(payload.email),
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture || '',
      authProvider: 'Google',
      // Rejected above unless Google confirmed the address.
      emailVerified: true,
      geo: getRequestGeo(req),
    });
    if (session.ok === false) {
      return res.status(session.status).json({ error: session.error });
    }
    return res.status(200).json(session.body);
  } catch (error: any) {
    console.error("Token verification failed:", error.message || error);
    return res.status(401).json({ error: 'Authentication failed or token expired.' });
  }
}
