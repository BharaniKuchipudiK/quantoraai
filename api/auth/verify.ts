import { OAuth2Client } from 'google-auth-library';
import { applyCors, clientIp, isRateLimited } from '../_lib/rate-limit.js';
import { createSessionToken, setSessionCookie, isSessionConfigured } from '../_lib/session.js';
import { isAdminUser, recordSignIn } from '../_lib/store.js';

/*
 * The client ID is read strictly from the environment, with no placeholder
 * fallback.
 *
 * A hardcoded default here is worse than a crash: `audience` is what pins a
 * Google token to THIS application, and a deployment silently running with a
 * mock audience rejects every real login while looking correctly configured.
 * Missing configuration should say so plainly.
 */
const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const client = CLIENT_ID ? new OAuth2Client(CLIENT_ID) : null;

export default async function handler(req: any, res: any) {
  // 1. Enable CORS for cross-origin requests
  applyCors(req, res, "POST,OPTIONS");

  // 2. Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. Enforce POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  // Credential-checking endpoint, so limited harder than ordinary traffic.
  if (isRateLimited(`login:${clientIp(req)}`, 10, 60_000)) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a minute.' });
  }

  if (!client || !isSessionConfigured()) {
    console.error('Auth misconfigured: GOOGLE_CLIENT_ID and/or SESSION_SECRET missing.');
    return res.status(503).json({ error: 'Sign-in is not configured on this deployment.' });
  }

  try {
    // 4. Extract the token from the request body
    const { credential } = req.body;
    
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential token' });
    }

    // 5. Cryptographically verify the token with Google
    // This throws an error if the token is forged, expired, or intended for a different audience
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID, 
    });

    // 6. Extract the verified payload
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
     * Verification alone is not a login.
     *
     * Checking the token proves who this person is *at this moment*. It says
     * nothing about the next request. Without a server-issued session the
     * browser is handed a user object and trusted to report it back honestly
     * — which means an attacker never has to pass this check at all: they can
     * write the stored profile directly and skip straight past it.
     *
     * So the server issues its own signed, HttpOnly session cookie here. That
     * cookie, not the browser's word, is what every later request is judged on.
     */
    /*
     * Record the sign-in, and honour a block if one is set.
     *
     * Deliberately fails soft: recordSignIn returns null when the store is
     * unconfigured or unreachable, and that is treated as "carry on". Losing a
     * bookkeeping row is a nuisance; refusing someone entry because analytics
     * is down is not a trade worth making. A block is only enforced when the
     * database actually answered and actually said so.
     */
    const stored = await recordSignIn({
      sub: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture || '',
    });

    if (stored?.blocked_at) {
      console.warn('Blocked account attempted sign-in:', payload.sub);
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
      return res.status(503).json({ error: 'Sign-in is not configured on this deployment.' });
    }
    setSessionCookie(res, token);

    const isAdmin = await isAdminUser(payload.sub);

    // 7. Format the verified user object
    const verifiedUser = {
      name: payload.name || 'Creator',
      email: payload.email || 'user@quantora.app',
      avatar: payload.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(payload.name || 'Creator')}&background=f97316&color=ffffff&bold=true`,
      authProvider: "Google OAuth 2.0 (Verified)",
      tier: "Indie Creator ($0 / mo)",
      joinedDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      isAdmin: isAdmin === true,
    };

    // 8. Return the secure user payload back to the frontend
    return res.status(200).json(verifiedUser);
    
  } catch (error: any) {
    console.error("Token verification failed:", error.message || error);
    // Return 401 Unauthorized for any token validation failure (e.g. signature mismatch)
    return res.status(401).json({ error: 'Authentication failed or token expired.' });
  }
}
