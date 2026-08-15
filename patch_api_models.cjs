const fs = require('fs');
let code = fs.readFileSync('api/models.js', 'utf8');

const targetList = `  {
    "id": "openai/gpt-4o-mini",
    "name": "GPT-4o Mini",
    "description": "General Assistant & Fast Queries",
    "pricing": {
      "prompt": "0.00000015",
      "completion": "0.0000006"
    },
    "context_length": 128000,
    "architecture": {
      "modality": "text+image-\u003Etext",
      "tokenizer": "o200k_base",
      "instruct_type": null
    },
    "top_provider": {
      "context_length": 128000,
      "max_completion_tokens": 16384,
      "is_moderated": true
    },
    "per_request_limits": null
  }`;

const newList = targetList + `,
  {
    "id": "anthropic/claude-3.5-sonnet",
    "name": "Claude 3.5 Sonnet",
    "description": "Ultra-fast coding via OpenRouter integration.",
    "pricing": { "prompt": "0.000003", "completion": "0.000015" },
    "context_length": 200000
  },
  {
    "id": "meta-llama/llama-3-70b-instruct",
    "name": "Llama 3 70B",
    "description": "Open-source powerhouse with zero filters.",
    "pricing": { "prompt": "0.0000004", "completion": "0.0000004" },
    "context_length": 8192
  }`;

code = code.replace(targetList, newList);
fs.writeFileSync('api/models.js', code);
console.log("Patched api/models.js with missing models");
