import { OAuth2Client } from 'google-auth-library';
import { applyCors } from '../_lib/rate-limit.js';

// Initialize the Google OAuth Client using the Client ID from env vars
// Note: Fallback matches the frontend fallback to prevent crashing during local dev if unset
const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "731238912-mock.apps.googleusercontent.com";
const client = new OAuth2Client(CLIENT_ID);

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
    
    if (!payload) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // 7. Format the verified user object
    const verifiedUser = {
      name: payload.name || 'Creator',
      email: payload.email || 'user@quantora.app',
      avatar: payload.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(payload.name || 'Creator')}&background=f97316&color=ffffff&bold=true`,
      authProvider: "Google OAuth 2.0 (Verified)",
      tier: "Indie Creator ($0 / mo)",
      joinedDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };

    // 8. Return the secure user payload back to the frontend
    return res.status(200).json(verifiedUser);
    
  } catch (error: any) {
    console.error("Token verification failed:", error.message || error);
    // Return 401 Unauthorized for any token validation failure (e.g. signature mismatch)
    return res.status(401).json({ error: 'Authentication failed or token expired.' });
  }
}
