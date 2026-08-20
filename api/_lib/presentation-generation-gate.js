import { validatePresentationSpec } from './presentation-v2.js';
import { verifyPresentationCommunicationQuality } from './office-artifact.js';

function text(value) {
  return String(value ?? '').trim();
}

function wordCount(value) {
  const clean = text(value);
  return clean ? clean.split(/\s+/).filter(Boolean).length : 0;
}

function normalizeComparable(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushIfLong(issues, value, { words, chars, label }) {
  const clean = text(value);
  if (!clean) return;
  if ((words && wordCount(clean) > words) || (chars && clean.length > chars)) {
    issues.push(`${label} is too dense for reliable 16:9 presentation layout; shorten the copy rather than shrinking it further.`);
  }
}

function repeatedVisibleCopy(slide = {}) {
  const candidates = [
    ['subtitle', slide.subtitle],
    ['insight', slide.insight],
    ['recommendation', slide.recommendation],
    ...(Array.isArray(slide.bullets) ? slide.bullets.map((value, index) => [`bullet ${index + 1}`, value]) : []),
  ]
    .map(([label, value]) => ({ label, value: text(value), normalized: normalizeComparable(value) }))
    .filter((entry) => wordCount(entry.value) >= 8);

  const seen = new Map();
  const duplicates = [];
  for (const entry of candidates) {
    if (!entry.normalized) continue;
    const prior = seen.get(entry.normalized);
    if (prior) duplicates.push(`${prior} and ${entry.label}`);
    else seen.set(entry.normalized, entry.label);
  }
  return duplicates;
}

function surfaceWordCount(slide = {}) {
  const values = [slide.title, slide.subtitle, slide.insight, slide.recommendation, ...(slide.bullets || [])];
  for (const option of slide.options || []) values.push(option.name, option.summary, ...(option.pros || []), ...(option.cons || []));
  for (const risk of slide.risks || []) values.push(risk.risk, risk.mitigation, risk.owner);
  for (const action of slide.actions || []) values.push(action.title, action.detail, action.owner, action.timing);
  for (const item of slide.framework || []) values.push(item.heading, item.detail, item.metric);
  for (const column of slide.columns || []) values.push(column.heading, ...(column.bullets || []));
  for (const item of slide.timeline || []) values.push(item.date, item.label, item.detail);
  for (const item of slide.statuses || []) values.push(item.label, item.metric, item.detail);
  return values.reduce((total, value) => total + wordCount(value), 0);
}

/**
 * Deterministic readability/layout budget for AI-generated presentations.
 * Blocks repeatable pre-render failure modes: overlong headlines, verbose
 * semantic cards, repeated copy and slide-level text density that would force
 * unreadable font shrinking.
 */
export function verifyPresentationReadability(spec = {}) {
  const issues = [];
  const slides = Array.isArray(spec.slides) ? spec.slides : [];

  slides.forEach((slide, index) => {
    const number = index + 1;
    const type = text(slide?.type).toLowerCase();
    const prefix = `Slide ${number}`;

    if (type !== 'cover') {
      pushIfLong(issues, slide.title, { words: 16, chars: 125, label: `${prefix} headline` });
      pushIfLong(issues, slide.subtitle, { words: 24, chars: 180, label: `${prefix} subtitle` });
    }
    pushIfLong(issues, slide.insight, { words: 34, chars: 270, label: `${prefix} governing insight` });
    pushIfLong(issues, slide.recommendation, { words: 28, chars: 225, label: `${prefix} recommendation` });

    const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
    const bulletLimit = type === 'executive_summary' ? 4 : 5;
    const bulletWordLimit = type === 'executive_summary' ? 24 : 28;
    const bulletTotalLimit = type === 'executive_summary' ? 78 : 100;
    if (bullets.length > bulletLimit) {
      issues.push(`${prefix} has ${bullets.length} bullets; keep this ${type || 'body'} composition to at most ${bulletLimit} visible bullets.`);
    }
    const totalBulletWords = bullets.reduce((total, value) => total + wordCount(value), 0);
    if (totalBulletWords > bulletTotalLimit) {
      issues.push(`${prefix} bullet region is too dense (${totalBulletWords} words); reduce it below ${bulletTotalLimit} words.`);
    }
    bullets.forEach((bullet, bulletIndex) => {
      if (wordCount(bullet) > bulletWordLimit) {
        issues.push(`${prefix} bullet ${bulletIndex + 1} is too long for executive scanning; shorten it below ${bulletWordLimit} words.`);
      }
    });

    (slide.options || []).forEach((option, optionIndex) => {
      pushIfLong(issues, option.summary, { words: 24, chars: 175, label: `${prefix} option ${optionIndex + 1} summary` });
      [...(option.pros || []), ...(option.cons || [])].forEach((item, itemIndex) => {
        if (wordCount(item) > 18) issues.push(`${prefix} option ${optionIndex + 1} trade-off ${itemIndex + 1} is too verbose; compress it below 18 words.`);
      });
    });

    if ((slide.risks || []).length > 6) issues.push(`${prefix} risk matrix contains more than six visible risks; prioritize the highest-impact risks.`);
    (slide.risks || []).forEach((risk, riskIndex) => {
      pushIfLong(issues, risk.risk, { words: 16, chars: 125, label: `${prefix} risk ${riskIndex + 1} label` });
      pushIfLong(issues, risk.mitigation, { words: 22, chars: 170, label: `${prefix} risk ${riskIndex + 1} mitigation` });
    });

    if ((slide.actions || []).length > 5) issues.push(`${prefix} roadmap contains more than five visible actions; consolidate the plan into fewer management milestones.`);
    (slide.actions || []).forEach((action, actionIndex) => {
      pushIfLong(issues, action.title, { words: 16, chars: 120, label: `${prefix} roadmap action ${actionIndex + 1} title` });
      pushIfLong(issues, action.detail, { words: 24, chars: 180, label: `${prefix} roadmap action ${actionIndex + 1} detail` });
    });

    (slide.framework || []).forEach((item, itemIndex) => {
      pushIfLong(issues, item.detail, { words: 24, chars: 180, label: `${prefix} framework item ${itemIndex + 1}` });
    });
    (slide.columns || []).forEach((column, columnIndex) => {
      const words = (column.bullets || []).reduce((total, value) => total + wordCount(value), 0);
      if (words > 70) issues.push(`${prefix} column ${columnIndex + 1} is too dense (${words} words); reduce it below 70 words.`);
    });

    const duplicates = repeatedVisibleCopy(slide);
    duplicates.forEach((duplicate) => {
      issues.push(`${prefix} repeats the same visible message in ${duplicate}; keep one instance and use the freed space for hierarchy or evidence.`);
    });

    const densityBudget = {
      executive_summary: 135,
      comparison: 210,
      risk_matrix: 190,
      roadmap: 175,
      framework: 175,
      two_column: 180,
      bullets: 150,
    }[type] || 190;
    const surfaceWords = surfaceWordCount(slide);
    if (type !== 'cover' && type !== 'section' && surfaceWords > densityBudget) {
      issues.push(`${prefix} carries ${surfaceWords} visible words, above the ${densityBudget}-word layout budget for ${type || 'this composition'}; simplify the slide before rendering.`);
    }
  });

  return { passed: issues.length === 0, issues: [...new Set(issues)] };
}

/**
 * Generation-time gate for new/refined PowerPoint candidates. Structural,
 * executive-communication and readability quality must all pass before a deck
 * is considered fit for compilation.
 */
export function validateGeneratedPresentationSpec(input = {}) {
  const structural = validatePresentationSpec(input || {});
  if (!structural.valid) return structural;

  const communication = verifyPresentationCommunicationQuality(structural.spec || {});
  const readability = verifyPresentationReadability(structural.spec || {});
  if (communication.passed && readability.passed) return structural;

  return {
    ...structural,
    valid: false,
    issues: [...new Set([
      ...(structural.issues || []),
      ...(communication.issues || []),
      ...(readability.issues || []),
    ])],
  };
}
