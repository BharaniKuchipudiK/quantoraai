/**
 * The coding desk must know the job, or heal will "fix" a calculator into a landing page.
 * Purpose + must-work is stored with the files. Chat is not the source of truth.
 */

const NAMED_JOBS = [
  { re: /\bcalculator|\bcalc\b/i, purpose: 'A working calculator', mustWork: ['Number buttons still change the display', 'Keep this a calculator, not a different app'] },
  { re: /\btodo(?:s| list)?|\bto-do list\b/i, purpose: 'A to-do list', mustWork: ['Items can still be added', 'Keep this a to-do list'] },
  { re: /\btimer\b|\bstopwatch\b|\bpomodoro\b/i, purpose: 'A timer', mustWork: ['Start and time still work', 'Keep this a timer'] },
  { re: /\bquiz\b|\bflash ?cards?\b/i, purpose: 'A quiz', mustWork: ['Questions can still be answered', 'Keep this a quiz'] },
  { re: /\b(boutique|saree|sari|e-?commerce|storefront|online shop)\b/i, purpose: 'A shop website', mustWork: ['Catalog and bag still work', 'Product images are real photos, not empty frames', 'Keep this a shop, not a different app'] },
];

export function normalizeStudioJobCard(job) {
  if (!job || typeof job !== 'object') return null;
  const purpose = String(job.purpose || '').trim().slice(0, 120);
  if (!purpose) return null;
  const mustWork = Array.isArray(job.mustWork)
    ? job.mustWork.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
    : [];
  return { purpose, mustWork };
}

function purposeFromVfs(vfs = {}) {
  const files = Object.values(vfs || {});
  for (const file of files) {
    const html = typeof file?.content === 'string' ? file.content : '';
    const title = html.match(/<title>([^<]{2,80})<\/title>/i)?.[1];
    if (title && !/quantora/i.test(title)) return title.trim();
    const heading = html.match(/<h1[^>]*>([^<]{2,80})<\/h1>/i)?.[1];
    if (heading) return heading.trim();
  }
  return '';
}

function looksLikeNewJob(brief, existing) {
  if (!existing?.purpose) return true;
  const text = String(brief || '').trim();
  if (!text) return false;
  for (const named of NAMED_JOBS) {
    if (named.re.test(text) && named.purpose !== existing.purpose) return true;
  }
  if (/\b(build|create|make)\b/i.test(text) && /\b(app|page|site|tool|game)\b/i.test(text) && text.length > 40) {
    return !namedPurposeMatch(text, existing.purpose);
  }
  return false;
}

function namedPurposeMatch(text, purpose) {
  return NAMED_JOBS.some((named) => named.purpose === purpose && named.re.test(text));
}

export function buildStudioJobCard({ brief = '', vfs = {}, existing = null } = {}) {
  const prev = normalizeStudioJobCard(existing);
  const text = String(brief || '').trim();
  if (prev && !looksLikeNewJob(text, prev)) return prev;

  for (const named of NAMED_JOBS) {
    if (named.re.test(text)) return { purpose: named.purpose, mustWork: named.mustWork };
  }

  const fromFiles = purposeFromVfs(vfs);
  if (fromFiles) {
    return {
      purpose: fromFiles.slice(0, 120),
      mustWork: ['Interactive controls still work', 'Do not replace this with a different product'],
    };
  }

  if (prev) return prev;
  if (!text) return null;

  const clipped = text.replace(/^(please |can you |could you )/i, '').slice(0, 80).trim();
  const purpose = clipped.charAt(0).toUpperCase() + clipped.slice(1);
  return {
    purpose,
    mustWork: ['The page still runs', 'Do not replace this with a different product'],
  };
}

export function studioJobCardLabel(job) {
  return normalizeStudioJobCard(job)?.purpose || '';
}

export function jobNeedsProductPhotos(job) {
  const card = normalizeStudioJobCard(job);
  if (!card) return false;
  return /\b(shop|boutique|catalog|photo)/i.test([card.purpose, ...card.mustWork].join(' '));
}

export function formatJobCardForRepair(job) {
  const card = normalizeStudioJobCard(job);
  if (!card) return '';
  const must = card.mustWork.length
    ? `\nMust still work:\n${card.mustWork.map((item) => `- ${item}`).join('\n')}`
    : '';
  return `JOB (do not abandon this product):\nPurpose: ${card.purpose}${must}\nIf a change would turn this into a different product, return the current code unchanged.`;
}

export function formatJobCardForVerify(job, brief = '') {
  const card = normalizeStudioJobCard(job);
  const text = String(brief || '').trim();
  if (!card) return text;
  const extra = [card.purpose, ...card.mustWork].filter(Boolean).join('. ');
  return [text, extra].filter(Boolean).join('\n');
}
