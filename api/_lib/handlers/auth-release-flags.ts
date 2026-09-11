import { getSessionUser } from '../session.js';
import { resolveClientReleaseFlags } from '../release-flags.js';

/**
 * Read-only, same-origin release decision route hosted inside the existing auth
 * function so Quantora does not spend another Vercel Function on release
 * plumbing.
 *
 * The browser receives only allow-listed booleans plus a coarse authenticated
 * bit already knowable to it. SDK keys, targeting rules, evaluation metadata
 * and raw identity remain server-side.
 */
export default async function authReleaseFlags(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const sessionUser = getSessionUser(req);
  const flags = await resolveClientReleaseFlags(sessionUser);

  return res.status(200).json({
    flags,
    audience: {
      authenticated: Boolean(sessionUser),
    },
  });
}
