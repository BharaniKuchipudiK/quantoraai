import { applyCors } from '../rate-limit.js';
import { requireActiveSession } from '../authz.js';
import { normalizeYoutubeVideoId, verifyYoutubeResource } from '../youtube-resource.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<typeof verifyYoutubeResource>> }>();

function cached(id: string) {
  const entry = cache.get(id);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(id);
    return null;
  }
  return entry.value;
}

function remember(id: string, value: Awaited<ReturnType<typeof verifyYoutubeResource>>) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(id, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;

  const id = normalizeYoutubeVideoId(req.query?.id);
  if (!id) return res.status(400).json({ valid: false, reason: 'invalid_video_id' });

  const existing = cached(id);
  if (existing) {
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json(existing);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const result = await verifyYoutubeResource(id, fetch, controller.signal);
    remember(id, result);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json(result);
  } finally {
    clearTimeout(timeout);
  }
}
