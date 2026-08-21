#!/usr/bin/env node

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error('REAL_PROVIDER_CANARY_FAIL: OPENROUTER_API_KEY is not available in the Vercel preview build environment.');
  process.exit(1);
}

const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
const model = 'openrouter/free';

async function generate(label, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': 'https://quantoraai.app',
        'X-Title': 'Quantora Real Provider Canary',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Generate runnable web code. Follow the request exactly.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1800,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${label}: OpenRouter ${response.status}: ${data?.error?.message || 'request failed'}`);
    const text = String(data?.choices?.[0]?.message?.content || '');
    if (!text.trim()) throw new Error(`${label}: empty model response`);
    return { text, providerModel: data?.model || model };
  } finally {
    clearTimeout(timer);
  }
}

function cleanSnippet(text) {
  return String(text || '').replace(/\s+/g, ' ').slice(0, 1200);
}

const calculator = await generate(
  'calculator',
  'Create a complete self-contained HTML calculator with a visible display; buttons 0-9, +, -, multiply, divide, equals and clear; and working JavaScript interactions. Return HTML only.'
);
const calculatorOk = /<button\b/i.test(calculator.text)
  && /(?:calculator|display)/i.test(calculator.text)
  && /(?:addEventListener|onclick|function\s*\(|=>|<script\b)/i.test(calculator.text);
if (!calculatorOk) {
  console.error(`REAL_PROVIDER_CANARY_CALCULATOR_SHAPE model=${calculator.providerModel} bytes=${calculator.text.length} snippet=${cleanSnippet(calculator.text)}`);
  throw new Error('calculator: generated output failed runnable-code assertions');
}
console.log(`REAL_PROVIDER_CANARY_OK calculator model=${calculator.providerModel} bytes=${calculator.text.length}`);

const website = await generate(
  'website',
  'Create a complete self-contained HTML landing page for a modern AI startup with a polished hero, three feature cards, and a clear call-to-action button. Return HTML only.'
);
const websiteOk = /<(?:html|main|section)\b/i.test(website.text)
  && /(?:hero|feature)/i.test(website.text)
  && /(?:<button\b|call.to.action|cta|<a\b)/i.test(website.text);
if (!websiteOk) {
  console.error(`REAL_PROVIDER_CANARY_WEBSITE_SHAPE model=${website.providerModel} bytes=${website.text.length} snippet=${cleanSnippet(website.text)}`);
  throw new Error('website: generated output failed design assertions');
}
console.log(`REAL_PROVIDER_CANARY_OK website model=${website.providerModel} bytes=${website.text.length}`);
console.log('REAL_PROVIDER_CANARY_PASS calculator+website');
