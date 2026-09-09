import { getSessionUser } from './_lib/session.js';
import { resolveClientReleaseFlags } from './_lib/release-flags.js';

/**
 * Read-only, same-origin release decision endpoint.
 *
 * The Vercel Flags SDK key remains server-side. The browser receives only the
 * allow-listed boolean decisions it can act on plus a coarse authenticated bit
 * already knowable to that browser. Never return flag rules, SDK metadata,
 * provider errors, raw user identity or targeting attributes from this route.
 */
export default async function handler(req: any, res: any) {
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
