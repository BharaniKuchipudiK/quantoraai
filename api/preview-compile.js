import { compilePreviewVfs } from './_lib/preview-compiler.js';
import { applyCors, clientIp, isRateLimited } from './_lib/rate-limit.js';
import { attachCorrelationId, correlationIdForRequest, traceBoundary } from './_lib/transaction-trace.js';

export default async function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const correlationId = correlationIdForRequest(req);
  attachCorrelationId(res, correlationId);
  const transaction = typeof req.body?.goldenTransaction === 'string' ? req.body.goldenTransaction.slice(0, 80) : null;
  const startedAt = Date.now();
  traceBoundary({
    correlationId,
    boundary: 'preview.compiler',
    state: 'started',
    transaction,
    route: '/api/preview-compile',
    fileCount: req.body?.vfs && typeof req.body.vfs === 'object' ? Object.keys(req.body.vfs).length : 0,
  });

  if (isRateLimited(`preview-compile:${clientIp(req)}`, 40, 60_000)) {
    return res.status(429).json({ error: 'Too many preview compilations. Please wait a moment.' });
  }

  try {
    const result = await compilePreviewVfs(req.body?.vfs || {}, { correlationId });
    res.setHeader('Cache-Control', 'no-store');
    traceBoundary({
      correlationId,
      boundary: 'preview.compiler',
      state: 'compiled',
      transaction,
      route: '/api/preview-compile',
      durationMs: Date.now() - startedAt,
      fileCount: Object.keys(req.body?.vfs || {}).length,
    });
    return res.status(200).json(result);
  } catch (error) {
    const message = String(error?.errors?.[0]?.text || error?.message || 'Preview compilation failed.').slice(0, 500);
    traceBoundary({
      correlationId,
      boundary: 'preview.compiler',
      state: 'failed',
      transaction,
      route: '/api/preview-compile',
      durationMs: Date.now() - startedAt,
      detailCode: 'compile-contract-failed',
    });
    return res.status(422).json({ error: message });
  }
}
