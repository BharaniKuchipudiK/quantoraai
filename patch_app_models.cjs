const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const targetList = `    { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', specialty: 'Fast Reasoning & Spec Planning', badge: 'Ultra Fast', provider: 'Google', available: true, pricingKind: 'paid' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', specialty: 'General Assistant & Fast Queries', badge: 'Fast', provider: 'OpenAI', available: true, pricingKind: 'paid' }
  ];`;
const newList = `    { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B', specialty: 'Fast Reasoning & Spec Planning', badge: 'Ultra Fast', provider: 'Google', available: true, pricingKind: 'paid' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', specialty: 'General Assistant & Fast Queries', badge: 'Fast', provider: 'OpenAI', available: true, pricingKind: 'paid' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', specialty: 'Ultra-fast coding via OpenRouter integration.', badge: 'HOT', provider: 'Anthropic', available: true, pricingKind: 'paid' },
    { id: 'meta-llama/llama-3-70b-instruct', name: 'Llama 3 70B', specialty: 'Open-source powerhouse with zero filters.', badge: 'UPDATED', provider: 'Meta', available: true, pricingKind: 'free' }
  ];`;

code = code.replace(targetList, newList);
fs.writeFileSync('src/App.jsx', code);
console.log("Patched App.jsx with missing models");
