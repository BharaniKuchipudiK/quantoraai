import { compilePreviewVfs } from './_lib/preview-compiler.js';
import { applyCors, clientIp, isRateLimited } from './_lib/rate-limit.js';

export default async function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (isRateLimited(`preview-compile:${clientIp(req)}`, 40, 60_000)) {
    return res.status(429).json({ error: 'Too many preview compilations. Please wait a moment.' });
  }

  try {
    const result = await compilePreviewVfs(req.body?.vfs || {});
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (error) {
    const message = String(error?.errors?.[0]?.text || error?.message || 'Preview compilation failed.').slice(0, 500);
    return res.status(422).json({ error: message });
  }
}
