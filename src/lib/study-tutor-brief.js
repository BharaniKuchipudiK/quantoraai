import {
  assessStudyGaps,
  extractStudyTopicLabel,
  inferStudySyllabus,
  openStudyGaps,
  parseStudyCheckOutcomes,
  parseStudyCompetencyTags,
  parseStudySubjects,
  parseStudySyllabusNodes,
} from './study-syllabus-overlay.js';
import { isPrivateStudyInstruction } from './study-private-instructions.js';

function userTexts(messages = []) {
  return (messages || [])
    .filter((message) => message?.sender === 'user' && message.text)
    .map((message) => String(message.text).trim())
    .filter((text) => !isPrivateStudyInstruction(text))
    .filter(Boolean);
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
  const rawGoal = isPrivateStudyInstruction(conversationContext.goal || '')
    ? ''
    : String(conversationContext.goal || '');
  const fromGoal = extractStudyTopicLabel(rawGoal);
  if (fromGoal) return fromGoal;
  const goal = rawGoal.replace(/\s+/g, ' ').trim();
  if (goal && goal.length <= 72 && !/\bhttps?:\/\//i.test(goal)) return goal;
  return '';
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

  return {
    conceptId: label ? `session.${slugFromLabel(label)}` : '',
    label,
    overlay,
    subjects,
    nodes: graphNodes,
    nodeStates,
    competencies,
    gaps,
    active: Boolean(label || graphNodes.length),
  };
}
