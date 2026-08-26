import {
  STUDY_CHECK_MISSED_PREFIX,
  assessStudyGaps,
  extractStudyTopicLabel,
  inferStudySyllabus,
  openStudyGaps,
  parseStudyCheckOutcomes,
  parseStudyCompetencyTags,
  parseStudyFigureUrl,
  parseStudyFlashcards,
  parseStudyFoundation,
  parseStudySubjects,
  parseStudySyllabusNodes,
} from './study-syllabus-overlay.js';

function userTexts(messages = []) {
  return (messages || [])
    .filter((message) => message?.sender === 'user' && message.text)
    .map((message) => String(message.text).trim())
    .filter(Boolean);
}

function lastAssistantText(messages = []) {
  const row = [...(messages || [])].reverse().find((message) => message?.sender === 'ai' && message.text);
  return row ? String(row.text) : '';
}

function slugFromLabel(label = '') {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function deriveLabel({ conversationContext = {}, messages = [] } = {}) {
  const users = userTexts(messages);
  for (let index = users.length - 1; index >= 0; index -= 1) {
    const extracted = extractStudyTopicLabel(users[index]);
    if (extracted) return extracted;
  }
  const nodes = parseStudySyllabusNodes(conversationContext.facts);
  if (nodes.length) return nodes[nodes.length - 1];
  const fromGoal = extractStudyTopicLabel(conversationContext.goal || '');
  if (fromGoal) return fromGoal;
  const goal = String(conversationContext.goal || '').replace(/\s+/g, ' ').trim();
  if (goal && goal.length <= 72 && !/\bhttps?:\/\//i.test(goal)) return goal;
  return '';
}

function sessionSignals({ conversationContext = {}, messages = [] } = {}) {
  const users = userTexts(messages);
  const blob = users.join('\n').toLowerCase();
  const struggle = /\b(stuck|wrong|confused|don'?t understand|keep missing|failed|hard for me|i got this wrong)\b/i.test(blob)
    || parseStudyCheckOutcomes(conversationContext.facts).missed.length > 0;
  const last = messages.length ? messages[messages.length - 1] : null;
  const unansweredProbe = last?.sender === 'ai'
    && /write your attempt|i will wait|\?\s*$/i.test(lastAssistantText(messages).slice(-400));
  const continued = users.filter((text) => /\b(i'?m with you|got it|try again|next|another)\b/i.test(text)).length;
  const streak = continued >= 2 && !struggle;
  return { struggle, unansweredProbe, streak };
}

function encouragementFromSignals(signals = {}) {
  if (signals.struggle) {
    return {
      glyph: '💛',
      text: 'Tough beat — that is allowed. One small next move, not a whole chapter.',
    };
  }
  if (signals.unansweredProbe) {
    return {
      glyph: '⏳',
      text: 'A check is waiting. No score until you try.',
    };
  }
  if (signals.streak) {
    return {
      glyph: '⭐',
      text: 'You came back. Keep the next beat small.',
    };
  }
  return {
    glyph: '📗',
    text: 'One idea. Then one check. No fake rank.',
  };
}

function nextBeat({ label, overlay, gaps, signals }) {
  if (!label && !gaps.length) {
    return overlay
      ? 'Name one idea at this syllabus depth — I will not invent a chapter.'
      : 'What should we make stronger — a topic, an exam, or a question you got wrong?';
  }
  if (signals.struggle && gaps.some((row) => row.status === 'missing')) {
    return `Repair the gap you just missed, then one check on ${label || 'this idea'}.`;
  }
  if (gaps.length) {
    const first = gaps[0];
    return `Unverified: ${first.node}. One check, then we decide the next node.`;
  }
  if (signals.unansweredProbe) return 'Mark the attempt that is waiting — then one new check.';
  if (label) return `Check ${label}. If it breaks, we repair the foundation the session already named.`;
  return 'One next action from this thread — not a canned sequence.';
}

/**
 * Board-native check from this session only — flashcards if present, else an
 * honesty probe on the named node. Never a canned famous-chapter bank.
 */
export function deriveSessionCheck({ label = '', foundation = '', flashcards = [] } = {}) {
  const topic = String(label || '').trim();
  if (Array.isArray(flashcards) && flashcards.length) {
    const card = flashcards[0];
    return {
      kind: 'practice',
      prompt: card.front,
      options: [
        { id: 'a', text: card.back, correct: true },
        { id: 'b', text: 'I need to repair the foundation first', correct: false },
        {
          id: 'c',
          text: foundation ? `Only about: ${foundation}` : 'A different idea than this node',
          correct: false,
        },
      ],
      ifRight: 'That check held. Next beat from the gap list — not a rank.',
      ifWrong: 'Gap found. Repair the foundation this session already named.',
    };
  }
  if (!topic) return null;
  return {
    kind: 'self_confidence',
    prompt: `Quick honesty check on ${topic}:`,
    options: [
      { id: 'hold', text: `I can explain ${topic} without looking`, correct: true, selfConfidence: 1 },
      { id: 'gap', text: `I am stuck on ${topic}`, correct: false },
      {
        id: 'foundation',
        text: foundation ? `I need ${foundation} repaired first` : 'I need a foundation repaired first',
        correct: false,
      },
    ],
    ifRight: 'Confidence noted — mastery is still unverified. Prove it with one independent attempt when ready.',
    ifWrong: 'Marked as a gap. Next beat is repair, then one check.',
  };
}

export function deriveStudyTutorBrief(input = {}) {
  const conversationContext = input.conversationContext || {};
  const messages = input.messages || [];
  const overlay = inferStudySyllabus({ conversationContext, messages });
  const nodes = parseStudySyllabusNodes(conversationContext.facts);
  const subjects = parseStudySubjects(conversationContext.facts);
  const competencies = parseStudyCompetencyTags(conversationContext.facts);
  const outcomes = parseStudyCheckOutcomes(conversationContext.facts);
  const label = deriveLabel({ conversationContext, messages });
  const graphNodes = nodes.length ? nodes : (label ? [label] : []);
  const nodeStates = assessStudyGaps({
    nodes: graphNodes,
    passed: outcomes.passed,
    missed: outcomes.missed,
  });
  const gaps = openStudyGaps(nodeStates);
  const signals = sessionSignals({ conversationContext, messages });
  const encouragement = encouragementFromSignals(signals);
  const foundation = parseStudyFoundation(conversationContext.facts);
  const figureUrl = parseStudyFigureUrl(conversationContext.facts);
  const flashcards = parseStudyFlashcards(conversationContext.facts);
  const passedCount = outcomes.passed.length;
  const denom = Math.max(graphNodes.length, label ? 1 : 0);
  const progressRatio = denom ? Math.min(0.9, passedCount / denom) : 0;
  const check = input.check || deriveSessionCheck({ label, foundation, flashcards });

  return {
    conceptId: label ? `session.${slugFromLabel(label)}` : '',
    label,
    foundation,
    next: nextBeat({ label, overlay, gaps, signals }),
    check,
    flashcards,
    overlay,
    subjects,
    nodes: graphNodes,
    nodeStates,
    competencies,
    gaps,
    signals,
    encouragement,
    figureUrl,
    progress: {
      ratio: passedCount ? Math.max(0.18, progressRatio) : (label ? 0.08 : 0),
      caption: passedCount
        ? `${passedCount} checked this session — not an exam rank.`
        : 'No fake score. A filled bar only after a real check.',
    },
    active: Boolean(label || graphNodes.length),
  };
}

export function gradeStudyCheck(check, optionId) {
  if (!check || !optionId) return null;
  const option = (check.options || []).find((item) => item.id === optionId);
  if (!option) return null;
  return {
    correct: option.correct === true,
    verified: false,
    evidence: check.kind === 'self_confidence'
      ? {
          kind: 'self_confidence',
          selfConfidence: option.correct === true ? (option.selfConfidence ?? 1) : 0.25,
        }
      : null,
    message: option.correct
      ? (check.ifRight || 'That check held. Next beat from the gap list — not a rank.')
      : (check.ifWrong || 'Gap found. Repair the foundation this session already named.'),
  };
}

export function studyCheckOutcomeFact(label, correct) {
  const topic = String(label || '').trim();
  if (!topic || correct) return '';
  return `${STUDY_CHECK_MISSED_PREFIX} ${topic}`;
}
