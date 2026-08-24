import { clientIp, isRateLimited } from '../rate-limit.js';
import { isGoldenCanaryRequest } from '../transaction-trace.js';

const CANARY_MODEL = 'deepseek/deepseek-chat';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  if (!isGoldenCanaryRequest(req)) return res.status(404).json({ ok: false });
  if (isRateLimited(`model-route-canary:${clientIp(req)}`, 6, 60_000)) {
    return res.status(429).json({ ok: false, reason: 'rate_limited' });
  }

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return res.status(503).json({ ok: false, reason: 'missing_key' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'https://quantoraai.app',
        'X-Title': 'Quantora AI route canary',
      },
      body: JSON.stringify({
        model: CANARY_MODEL,
        stream: false,
        temperature: 0,
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Return one valid HTML button whose visible label is Calculator. No markdown.' }],
      }),
    });
    const body = await response.json().catch(() => ({}));
    const text = String(body?.choices?.[0]?.message?.content || '');
    const useful = /<button\b/i.test(text) && /calculator/i.test(text);
    return res.status(response.ok && useful ? 200 : 503).json({
      ok: response.ok && useful,
      providerStatus: response.status,
      model: CANARY_MODEL,
      useful,
      sampleLength: text.length,
      upstreamCode: body?.error?.code || null,
    });
  } catch (error: any) {
    return res.status(503).json({ ok: false, error: error?.name || 'provider_failure' });
  } finally {
    clearTimeout(timer);
  }
}
