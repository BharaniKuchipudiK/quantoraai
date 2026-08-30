/**
 * Study syllabus + gap graph — session data and policy, not a textbook.
 *
 * How Bharani grounds the tutor (no committed NCERT/JEE/NEET chapter packs):
 * 1. Overlay chips / inference set depth only (CBSE 10, CBSE 11–12/NCERT,
 *    JEE Main, NEET, O/A-Level, open). They cap teaching tone; they do not
 *    inject chapter titles.
 * 2. Syllabus nodes and subjects arrive from the learner’s words or pasted
 *    “Chapters: …” / “Subjects: …” lists via mergeStudyGraphFromText. Official
 *    TOC ingest is future data — never invent a board TOC from model memory.
 * 3. Competitive design: papers test competencies (recall, apply, multi-concept,
 *    numerical, assertion-reason). Tags stay empty until the session (or ingest)
 *    names them; the board shows dim vocabulary chrome until then.
 * 4. Gap assessment: nodes minus Check passed / plus Check missed this session.
 *    Next beat is predictive from that graph, not a global hardcoded sequence.
 * 5. Motivation and empathy come from observed session signals in the brief,
 *    never from switching on a famous chapter name.
 */

export const STUDY_SYLLABUS_FACT_PREFIX = 'Syllabus overlay:';
export const STUDY_NODE_FACT_PREFIX = 'Syllabus node:';
export const STUDY_SUBJECT_FACT_PREFIX = 'Study subject:';
export const STUDY_COMPETENCY_FACT_PREFIX = 'Competency tag:';
// Legacy browser-graded pass facts are retained as an exported constant only
// so old data can be recognized during migration. They are not mastery proof.
export const STUDY_CHECK_PASSED_PREFIX = 'Check passed:';
export const STUDY_EVIDENCE_VERIFIED_PREFIX = 'Evidence verified:';
export const STUDY_CHECK_MISSED_PREFIX = 'Check missed:';
export const STUDY_FIGURE_URL_PREFIX = 'Figure URL:';
export const STUDY_FOUNDATION_PREFIX = 'Foundation:';
export const STUDY_FLASHCARD_PREFIX = 'Flashcard:';

/** How a paper can test an idea the student already named — not a chapter list. */
export const STUDY_COMPETENCY_TAGS = Object.freeze([
  'recall',
  'apply',
  'multi-concept',
  'numerical',
  'assertion-reason',
]);

export const STUDY_SYLLABUS_CHIPS = Object.freeze([
  {
    id: 'cbse-10',
    label: 'CBSE 10',
    fact: `${STUDY_SYLLABUS_FACT_PREFIX} CBSE Class 10. Cap teaching to this school stage. Do not use Class 11–12 or JEE methods unless the learner asks to bridge.`,
    sendLead: 'Stay at CBSE Class 10 depth only. Do not climb to Class 11–12 or JEE unless I ask to bridge.',
  },
  {
    id: 'cbse-11-12',
    label: 'CBSE 11–12',
    fact: `${STUDY_SYLLABUS_FACT_PREFIX} CBSE Class 11–12 / NCERT senior secondary. Cap to this stage. Do not run a JEE paper unless the learner asked for that exam.`,
    sendLead: 'Stay at CBSE Class 11–12 / NCERT depth. Do not turn this into a JEE paper unless I ask.',
  },
  {
    id: 'jee-main',
    label: 'JEE Main',
    fact: `${STUDY_SYLLABUS_FACT_PREFIX} JEE Main. Teach toward that syllabus. Foundation first. Never invent an All-India rank or “you will get IIT.”`,
    sendLead: 'Aim at JEE Main depth. Repair foundations first. No rank, percentile, or IIT promise.',
  },
  {
    id: 'neet',
    label: 'NEET',
    fact: `${STUDY_SYLLABUS_FACT_PREFIX} NEET. Teach toward that syllabus. Foundation first. Never invent a rank or medical-college promise.`,
    sendLead: 'Aim at NEET depth. Repair foundations first. No rank or college promise.',
  },
  {
    id: 'o-level',
    label: 'O-Level',
    fact: `${STUDY_SYLLABUS_FACT_PREFIX} Singapore GCE O-Level. Cap to O-Level. Name a JEE/A-Level bridge only if they asked to move up.`,
    sendLead: 'Stay at Singapore GCE O-Level. Name a higher-exam bridge only if I ask.',
  },
  {
    id: 'a-level',
    label: 'A-Level',
    fact: `${STUDY_SYLLABUS_FACT_PREFIX} Singapore GCE A-Level / H2. Cap to A-Level. Do not invent a class or board.`,
    sendLead: 'Stay at Singapore GCE A-Level / H2 depth.',
  },
  {
    id: 'open',
    label: 'Just explain',
    fact: `${STUDY_SYLLABUS_FACT_PREFIX} open. Teach the idea clearly. Do not invent a board, class, or exam.`,
    sendLead: 'Teach the idea clearly. Do not invent a board, class, or exam.',
  },
]);

function chipById(id) {
  return STUDY_SYLLABUS_CHIPS.find((item) => item.id === id) || null;
}

function clipLabel(text, max = 80) {
  const value = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.?!,:;]+$/g, '');
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function studySyllabusHaystack({ conversationContext = {}, messages = [], extra = '' } = {}) {
  const facts = conversationContext.facts || [];
  const users = (messages || [])
    .filter((message) => message?.sender === 'user' && message.text)
    .map((message) => String(message.text));
  return [conversationContext.goal, conversationContext.understanding, ...facts, ...users, extra]
    .filter(Boolean)
    .join('\n');
}

function overlayFromFact(facts = []) {
  const line = (facts || []).find((fact) => String(fact).startsWith(STUDY_SYLLABUS_FACT_PREFIX));
  if (!line) return null;
  if (/targeting a competitive exam/i.test(line)) {
    return {
      id: 'cbse-10-bridge',
      label: 'CBSE 10 → exam',
      fact: line,
      sendLead: 'Stay at CBSE Class 10 first. Name the exam bridge; do not jump unless I ask.',
    };
  }
  if (/\bCBSE Class 10\b/i.test(line)) return chipById('cbse-10');
  if (/Class 11–12|Class 11-12/i.test(line)) return chipById('cbse-11-12');
  if (/\bJEE Main\b/i.test(line)) return chipById('jee-main');
  if (/\bNEET\b/i.test(line)) return chipById('neet');
  if (/\bO-Level\b/i.test(line)) return chipById('o-level');
  if (/\bA-Level\b/i.test(line)) return chipById('a-level');
  if (/\bopen\b/i.test(line)) return chipById('open');
  return { id: 'stored', label: 'Syllabus', fact: line, sendLead: line };
}

export function inferStudySyllabus(input = {}) {
  const stored = overlayFromFact(input.conversationContext?.facts);
  if (stored) return stored;

  const hay = studySyllabusHaystack(input).toLowerCase();
  if (!hay.trim()) return null;

  const wantsJee = /\bjee(\s*main)?\b|\biit\s*jee\b/.test(hay);
  const wantsNeet = /\bneet\b/.test(hay);
  const class10 = /\b(class|grade|std|standard)\s*(10|x)\b|\b10th\b|\bcbse\s*10\b/.test(hay);
  const classSenior = /\b(class|grade|std|standard)\s*(11|12|xi|xii)\b|\bncert\s*(11|12)\b|\bcbse\s*(11|12)\b/.test(hay);

  if (/\ba-?levels?\b|\bh2\s*(physics|math|mathematics|chemistry|biology)\b/.test(hay)) return chipById('a-level');
  if (/\bo-?levels?\b|\b4049\b|\b6091\b/.test(hay)) return chipById('o-level');
  if (class10 && (wantsJee || wantsNeet)) {
    return {
      id: 'cbse-10-bridge',
      label: 'CBSE 10 → exam',
      fact: `${STUDY_SYLLABUS_FACT_PREFIX} CBSE Class 10, targeting a competitive exam. Teach Class 10 first. Name the bridge; do not jump to exam depth unless they ask.`,
      sendLead: 'Stay at CBSE Class 10 first. Name the exam bridge; do not jump unless I ask.',
    };
  }
  if (wantsJee) return chipById('jee-main');
  if (wantsNeet) return chipById('neet');
  if (classSenior) return chipById('cbse-11-12');
  if (class10) return chipById('cbse-10');
  return null;
}

export function shouldShowStudySyllabusChips({ studioDomain, conversationContext, messages, extra, dismissed } = {}) {
  if (studioDomain !== 'education' || dismissed) return false;
  return !inferStudySyllabus({ conversationContext, messages, extra });
}

export function applyStudySyllabusOverlay(context, chipId) {
  const chip = chipById(chipId);
  if (!chip) return context || {};
  const facts = (context?.facts || []).filter((fact) => !String(fact).startsWith(STUDY_SYLLABUS_FACT_PREFIX));
  return {
    ...(context?.goal ? { goal: context.goal } : {}),
    ...(context?.understanding ? { understanding: context.understanding } : {}),
    facts: [...facts, chip.fact],
  };
}

const TOPIC_LEAD = /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:teach(?:\s+me)?|explain|let(?:'|’)?s\s+learn|help me (?:to\s+)?(?:learn|with)|i(?:'m| am) (?:stuck on|struggling with)|i keep missing|quiz me on|test me on|revise|review)\s+/i;
const WHAT_IS = /^what is\s+/i;
const STOP_AFTER_AND = /\s+and\s+(?:give|show|make|find|with|then|also|one)\b/i;
const EMBEDDED_TEACH = /(?:teach(?:\s+me)?|explain|help me (?:to\s+)?(?:learn|with)|quiz me on|test me on)\s+(.{2,72}?)(?=\s+and\s+(?:give|show|make|find|with|then|also|one)\b|[.?!]|$)/i;

function cleanTopicRest(rest = '') {
  let value = String(rest || '').split(STOP_AFTER_AND)[0];
  value = value.replace(/\b(?:for|on)\s+(?:jee|neet|cbse|ncert|class|grade)\b[\s\S]*$/i, '');
  value = value.replace(/\s+like a real tutor[.!]?$/i, '');
  return clipLabel(value, 72);
}

export function extractStudyTopicLabel(text = '') {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const first = raw.split(/[?!\n]/)[0] || raw;
  if (TOPIC_LEAD.test(first)) return cleanTopicRest(first.replace(TOPIC_LEAD, ''));
  if (WHAT_IS.test(first)) return cleanTopicRest(first.replace(WHAT_IS, ''));
  const embedded = raw.match(EMBEDDED_TEACH);
  if (embedded) return cleanTopicRest(embedded[1]);
  return '';
}

function uniqueLabels(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const label = clipLabel(value, 72);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function parsePrefixedFacts(facts = [], prefix) {
  return (facts || [])
    .filter((fact) => String(fact).startsWith(prefix))
    .map((fact) => String(fact).slice(prefix.length).trim())
    .filter(Boolean);
}

export function parseStudySyllabusNodes(facts = []) {
  return uniqueLabels(parsePrefixedFacts(facts, STUDY_NODE_FACT_PREFIX));
}

export function parseStudySubjects(facts = []) {
  return uniqueLabels(parsePrefixedFacts(facts, STUDY_SUBJECT_FACT_PREFIX));
}

export function parseStudyCompetencyTags(facts = []) {
  const rows = [];
  for (const raw of parsePrefixedFacts(facts, STUDY_COMPETENCY_FACT_PREFIX)) {
    const [tagPart, nodePart] = String(raw).split('@').map((part) => part.trim());
    const tag = STUDY_COMPETENCY_TAGS.find((item) => item === String(tagPart || '').toLowerCase());
    if (!tag) continue;
    rows.push({ tag, node: clipLabel(nodePart, 72) });
  }
  return rows;
}

export function parseStudyFigureUrl(facts = []) {
  for (const raw of parsePrefixedFacts(facts, STUDY_FIGURE_URL_PREFIX)) {
    if (/^https:\/\//i.test(raw) && !/javascript:/i.test(raw)) return raw.split(/\s/)[0];
  }
  return '';
}

export function parseStudyFoundation(facts = []) {
  return parsePrefixedFacts(facts, STUDY_FOUNDATION_PREFIX)[0] || '';
}

export function parseStudyFlashcards(facts = []) {
  return parsePrefixedFacts(facts, STUDY_FLASHCARD_PREFIX)
    .map((line) => {
      const [front, back] = String(line).split('|').map((part) => part.trim());
      if (!front || !back) return null;
      return { front: clipLabel(front, 120), back: clipLabel(back, 120) };
    })
    .filter(Boolean);
}

export function parseStudyCheckOutcomes(facts = []) {
  return {
    passed: uniqueLabels(parsePrefixedFacts(facts, STUDY_EVIDENCE_VERIFIED_PREFIX)),
    missed: uniqueLabels(parsePrefixedFacts(facts, STUDY_CHECK_MISSED_PREFIX)),
  };
}

function listAfterLabel(text, pattern) {
  const match = String(text || '').match(pattern);
  if (!match) return [];
  let rest = String(match[1]);
  // Stop before the next structured field on the same line
  // (e.g. Subjects: A, B. Chapters: …).
  rest = rest.replace(
    /[.;]?\s*(?:Chapters?|Topics?|Units?|Subjects?|Competenc(?:y|ies))\s*:[\s\S]*$/i,
    '',
  );
  rest = rest.replace(/\.\s*$/, '');
  return uniqueLabels(rest.split(/[,;/•]+/));
}

function extractSubjects(text = '') {
  const hay = String(text || '');
  const listed = listAfterLabel(hay, /\bsubjects?\s*:\s*([^\n]+)/i);
  if (listed.length) return listed;
  const found = [];
  const named = hay.match(/\b(physics|chemistry|biology|mathematics|maths|math)\b/gi) || [];
  const grounded = /\b(class|cbse|ncert|jee|neet|board|grade|std)\b/i.test(hay)
    || /\bstudying\b/i.test(hay);
  if (!grounded) return [];
  for (const word of named) found.push(word);
  return uniqueLabels(found);
}

function extractCompetencyMentions(text = '', node = '') {
  const hay = String(text || '').toLowerCase();
  const tagged = [];
  const explicitList = listAfterLabel(text, /\bcompetenc(?:y|ies)\s*:\s*([^\n]+)/i);
  for (const item of explicitList) {
    const tag = STUDY_COMPETENCY_TAGS.find((name) => name === item.toLowerCase() || (name === 'assertion-reason' && /assertion/.test(item)));
    if (tag) tagged.push({ tag, node });
  }
  const distinctive = [
    ['assertion-reason', /assertion[-\s]?reason/],
    ['multi-concept', /multi[-\s]?concept/],
  ];
  for (const [tag, pattern] of distinctive) {
    if (pattern.test(hay)) tagged.push({ tag, node });
  }
  if (/\b(jee|neet|paper|mcq)\b/.test(hay)) {
    if (/\bnumerical\b/.test(hay)) tagged.push({ tag: 'numerical', node });
    if (/\brecall\b/.test(hay)) tagged.push({ tag: 'recall', node });
    if (/\bapply\b/.test(hay)) tagged.push({ tag: 'apply', node });
  }
  return tagged;
}

function withFact(facts, prefix, value) {
  const label = clipLabel(value, 72);
  if (!label) return facts;
  const line = `${prefix} ${label}`;
  if (facts.some((fact) => String(fact).toLowerCase() === line.toLowerCase())) return facts;
  return [...facts, line];
}

export function mergeStudyGraphFromText(context = {}, text = '') {
  const facts = [...(context?.facts || [])];
  let nextFacts = facts;
  const topic = extractStudyTopicLabel(text);
  const listedNodes = listAfterLabel(text, /\b(?:chapters?|topics?|units?)\s*:\s*([^\n]+)/i);
  const nodes = uniqueLabels([topic, ...listedNodes]);
  for (const node of nodes) nextFacts = withFact(nextFacts, STUDY_NODE_FACT_PREFIX, node);
  for (const subject of extractSubjects(text)) {
    nextFacts = withFact(nextFacts, STUDY_SUBJECT_FACT_PREFIX, subject);
  }
  const currentNode = nodes[0] || parseStudySyllabusNodes(nextFacts)[0] || '';
  for (const row of extractCompetencyMentions(text, currentNode)) {
    const value = row.node ? `${row.tag} @ ${row.node}` : row.tag;
    nextFacts = withFact(nextFacts, STUDY_COMPETENCY_FACT_PREFIX, value);
  }
  if (nextFacts === facts) return context || {};
  return {
    ...(context?.goal ? { goal: context.goal } : {}),
    ...(context?.understanding ? { understanding: context.understanding } : {}),
    facts: nextFacts,
  };
}

export function mergeStudySyllabusFromText(context, text, studioDomain) {
  if (studioDomain !== 'education') return context || {};
  let next = context || {};
  if (!inferStudySyllabus({ conversationContext: next })) {
    const inferred = inferStudySyllabus({ extra: text });
    if (inferred?.fact) {
      const facts = (next.facts || []).filter((fact) => !String(fact).startsWith(STUDY_SYLLABUS_FACT_PREFIX));
      next = {
        ...(next.goal ? { goal: next.goal } : {}),
        ...(next.understanding ? { understanding: next.understanding } : {}),
        facts: [...facts, inferred.fact],
      };
    }
  }
  return mergeStudyGraphFromText(next, text);
}

export function studySyllabusSendText(chip, topic = '') {
  const label = String(topic || '').trim();
  const lead = chip?.sendLead || 'Teach at the depth already on this thread.';
  if (chip?.id === 'open') {
    return label
      ? `${lead} Continue ${label} with one idea, a picture tag, then wait.`
      : `${lead} Ask what we should learn — one short question.`;
  }
  return label
    ? `${lead} Continue ${label} at this depth. One idea, a picture tag, then wait.`
    : `${lead} Ask what we should learn — one short question. Do not invent a topic.`;
}

export function studySyllabusContinueSet(topic = '') {
  return {
    prompt: 'Which syllabus?',
    items: STUDY_SYLLABUS_CHIPS.map((chip) => ({
      id: chip.id,
      label: chip.label,
      value: studySyllabusSendText(chip, topic),
    })),
  };
}

export function withStudySyllabusAsk(ask, overlay) {
  const directive = overlay?.sendLead || overlay?.fact;
  if (!directive) return ask;
  return `${ask} ${directive}`;
}

export function assessStudyGaps({ nodes = [], passed = [], missed = [] } = {}) {
  const passedSet = new Set(passed.map((item) => item.toLowerCase()));
  const missedSet = new Set(missed.map((item) => item.toLowerCase()));
  return (nodes || []).map((node) => {
    const key = String(node).toLowerCase();
    if (missedSet.has(key) && !passedSet.has(key)) {
      return { node, status: 'missing' };
    }
    if (passedSet.has(key)) {
      return { node, status: 'checked' };
    }
    return { node, status: 'unverified' };
  });
}

export function openStudyGaps(rows = []) {
  return (rows || []).filter((row) => row.status && row.status !== 'checked');
}
