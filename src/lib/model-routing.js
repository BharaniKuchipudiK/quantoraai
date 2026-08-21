import { applyArenaPreferenceBoost } from './arena-preferences.js';

const FREE_KINDS = new Set(['free', 'free-tier']);

const TASK_PATTERNS = [
  ['coding', /\b(code|coding|debug|bug|error|stack trace|react|javascript|typescript|python|html|css|api|database|sql|component|function|repository|refactor|deploy|build (?:an?|the)|app|website)\b/i],
  ['vision', /\b(image|photo|screenshot|diagram|visual|picture|ocr|logo|design review)\b/i],
  ['research', /\b(research|analyse|analyze|compare|investigate|evidence|sources?|architecture|strategy|theory|explain deeply)\b/i],
  ['writing', /\b(write|rewrite|email|story|article|blog|copy|tone|grammar|summarise|summarize|translate)\b/i],
  ['quick', /\b(quick|brief|short|simple|fast|one line|tl;?dr)\b/i],
];

export function classifyTask(message = '') {
  const text = String(message).trim();
  for (const [category, pattern] of TASK_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return 'general';
}

export function isFreeReadyModel(model) {
  return Boolean(model && model.available !== false && FREE_KINDS.has(model.pricingKind));
}

function modelScore(model, task, arenaPrefs) {
  const haystack = `${model.id || ''} ${model.name || ''} ${model.specialty || ''}`.toLowerCase();
  let score = model.pricingKind === 'free' ? 30 : 25;
  if (model.quality?.sampleSize >= 5 && Number.isFinite(model.quality?.score)) {
    score += Math.max(0, Math.min(10, model.quality.score / 10));
  }
  if (arenaPrefs) {
    score = applyArenaPreferenceBoost(score, model.id, task, arenaPrefs);
  }

  if (task === 'coding') {
    if (/nemotron|gpt-oss|coder|qwen|deepseek/.test(haystack)) score += 24;
    if (/gemini|flash/.test(haystack)) score += 10;
  } else if (task === 'research') {
    if (/nemotron|gpt-oss|reason|deepseek/.test(haystack)) score += 22;
    if (/gemini/.test(haystack)) score += 12;
  } else if (task === 'vision') {
    if (/gemini|vision|multimodal/.test(haystack)) score += 28;
  } else if (task === 'writing') {
    if (/gemini|llama|creative/.test(haystack)) score += 22;
    if (/nemotron/.test(haystack)) score += 8;
  } else if (task === 'quick') {
    if (/flash|gemini|mini|fast/.test(haystack)) score += 26;
  } else {
    if (/gemini|flash/.test(haystack)) score += 8;
    if (/nemotron|gpt-oss/.test(haystack)) score += 20;
  }

  return score;
}

export function rankFreeModels(models = [], message = '', arenaPrefs = null) {
  const task = classifyTask(message);
  return models
    .filter(isFreeReadyModel)
    .map((model, index) => ({ model, index, score: modelScore(model, task, arenaPrefs) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ model }) => model);
}

// Presentations need the strongest available writer of rich, self-contained
// HTML/CSS/SVG — not the fastest free model. Rank ALL ready models (paid
// included) toward flagship design/reasoning quality.
const DESIGN_STRONG = /(claude|opus|sonnet|gpt-?4|gpt-?5|o[13]\b|gemini[^a-z]*(2\.5|2\.0|1\.5)?[^a-z]*pro|deepseek|nemotron|llama[^a-z]*3\.[13][^a-z]*70|qwen[^a-z]*(72|max)|mistral[^a-z]*large|grok)/i;
const DESIGN_WEAK = /(flash|mini|nano|lite|haiku|8b|7b|3b|1b|tiny|small)/i;

export function chooseBestDeckModel(models = []) {
  const ready = (Array.isArray(models) ? models : []).filter((m) => m && m.available !== false);
  if (!ready.length) return null;
  const scored = ready.map((model, index) => {
    const hay = `${model.id || ''} ${model.name || ''} ${model.specialty || ''}`.toLowerCase();
    let score = 0;
    if (DESIGN_STRONG.test(hay)) score += 40;
    if (DESIGN_WEAK.test(hay)) score -= 18;
    if (model.pricingKind && !FREE_KINDS.has(model.pricingKind)) score += 8; // paid tiers are usually stronger
    if (model.quality?.sampleSize >= 5 && Number.isFinite(model.quality?.score)) {
      score += Math.max(0, Math.min(15, model.quality.score / 6.5));
    }
    return { model, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0].model;
}

export function chooseBestFreeModel(models = [], message = '', arenaPrefs = null) {
  const task = classifyTask(message);
  const model = rankFreeModels(models, message, arenaPrefs)[0] || null;
  if (!model) return { model: null, task, reason: 'No free model is currently ready.' };

  const reasons = {
    coding: 'it is the strongest ready free option for coding and technical problem-solving',
    research: 'it is the strongest ready free option for deeper analysis',
    vision: 'it is the best ready free option for visual context',
    writing: 'it is the best ready free option for natural writing',
    quick: 'it is the fastest ready free option for a short request',
    general: 'it is the best balanced free option currently ready',
  };

  let reason = reasons[task];
  if (arenaPrefs && model.id) {
    const wins = arenaPrefs?.byTask?.[task]?.[model.id];
    if (wins >= 2) {
      reason = `you preferred ${model.name} for ${task} questions in Arena (${wins} wins)`;
    }
  }

  return { model, task, reason };
}
