import { fetchApiGatewayKey } from './autocomplete.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openrouter/free';

async function runPrompt(key, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': process.env.APP_URL || 'https://quantoraai.app',
        'X-Title': 'Quantora Provider Canary',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a code generator. Follow the user request exactly and return runnable output.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1800,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error?.message || `OpenRouter returned ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const text = String(body?.choices?.[0]?.message?.content || '');
    return {
      text,
      providerModel: body?.model || MODEL,
      length: text.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  // This endpoint exists only to prove real provider behavior on protected Vercel previews.
  // It is deliberately unavailable in production and will be removed before merge.
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.OPENROUTER_API_KEY || await fetchApiGatewayKey('OPENROUTER');
  if (!key) return res.status(503).json({ ok: false, error: 'OpenRouter key unavailable in preview environment' });

  try {
    const calculator = await runPrompt(key,
      'Create a complete self-contained HTML calculator. It must visibly render a numeric display, buttons 0 through 9, +, -, multiply, divide, equals and clear, and working JavaScript interactions. Return HTML only.');
    const website = await runPrompt(key,
      'Create a complete self-contained HTML landing page for a modern AI startup. It must visibly render a hero section, three feature cards and a clear call-to-action button with polished CSS. Return HTML only.');

    const calculatorPassed = /<button\b/i.test(calculator.text)
      && /(?:calculator|display)/i.test(calculator.text)
      && /(?:addEventListener|onclick|function\s*\(|=>)/i.test(calculator.text);
    const websitePassed = /<(?:html|main|section)\b/i.test(website.text)
      && /(?:hero|feature)/i.test(website.text)
      && /<button\b|call.to.action|cta/i.test(website.text);

    return res.status(calculatorPassed && websitePassed ? 200 : 422).json({
      ok: calculatorPassed && websitePassed,
      route: MODEL,
      calculator: { passed: calculatorPassed, providerModel: calculator.providerModel, length: calculator.length },
      website: { passed: websitePassed, providerModel: website.providerModel, length: website.length },
    });
  } catch (error) {
    console.error('Provider canary failed:', error);
    return res.status(503).json({
      ok: false,
      route: MODEL,
      error: 'Real provider canary failed',
      status: Number(error?.status) || 503,
    });
  }
}
