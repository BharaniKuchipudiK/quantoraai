export const STUDY_SYLLABUS_FACT_PREFIX = 'Syllabus overlay:';

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

export function mergeStudySyllabusFromText(context, text, studioDomain) {
  if (studioDomain !== 'education') return context || {};
  if (inferStudySyllabus({ conversationContext: context })) return context || {};
  const inferred = inferStudySyllabus({ extra: text });
  if (!inferred?.fact) return context || {};
  const facts = (context?.facts || []).filter((fact) => !String(fact).startsWith(STUDY_SYLLABUS_FACT_PREFIX));
  return {
    ...(context?.goal ? { goal: context.goal } : {}),
    ...(context?.understanding ? { understanding: context.understanding } : {}),
    facts: [...facts, inferred.fact],
  };
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
