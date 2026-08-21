export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
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
        model: 'poolside/laguna-s-2.1:free',
        stream: false,
        temperature: 0,
        max_tokens: 80,
        messages: [{ role: 'user', content: 'Return one valid HTML button whose visible label is Calculator. No markdown.' }],
      }),
    });
    const body = await response.json().catch(() => ({}));
    const text = String(body?.choices?.[0]?.message?.content || '');
    const useful = /<button\b/i.test(text) && /calculator/i.test(text);
    return res.status(response.ok && useful ? 200 : 503).json({
      ok: response.ok && useful,
      providerStatus: response.status,
      model: 'poolside/laguna-s-2.1:free',
      useful,
      sampleLength: text.length,
    });
  } catch (error: any) {
    return res.status(503).json({ ok: false, error: error?.name || 'provider_failure' });
  } finally {
    clearTimeout(timer);
  }
}
