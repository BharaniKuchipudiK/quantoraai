import {
  STUDY_LEARNING_INTERACTION,
  STUDY_LEARNING_INTERACTION_EVENT,
} from './study-learning-interactions.js';

export const STUDY_WORKING_STATE_VERSION = 'study-working-state-v1';
export const STUDY_WORKING_STATE_TTL_MS = 20 * 60 * 1000;
export const STUDY_WORKING_STATE_MAX_EVENTS = 12;

const RESPONSE_TYPES = new Set([
  STUDY_LEARNING_INTERACTION.RESPONSE_CORRECT,
  STUDY_LEARNING_INTERACTION.RESPONSE_INCORRECT,
]);

let activeConcept = { conceptKey: '', conceptLabel: '' };
let observations = [];

function clean(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function normalizeConceptKey(value) {
  return clean(value, 160).toLowerCase();
}

function eventTime(event) {
  const value = Date.parse(String(event?.occurredAt || ''));
  return Number.isFinite(value) ? value : null;
}

function boundedEvents(events, nowMs) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => event && event.observationOnly === true && event.contractVersion)
    .filter((event) => {
      const at = eventTime(event);
      return at !== null && at <= nowMs && nowMs - at <= STUDY_WORKING_STATE_TTL_MS;
    })
    .slice(-STUDY_WORKING_STATE_MAX_EVENTS);
}

function consecutiveTail(events, type) {
  let count = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type !== type) break;
    count += 1;
  }
  return count;
}

export function deriveStudyWorkingState({
  events = [],
  conceptKey = '',
  conceptLabel = '',
  now = Date.now,
} = {}) {
  const nowMs = Number(now());
  const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const recent = boundedEvents(events, safeNow);
  if (!recent.length) return null;

  const responses = recent.filter((event) => RESPONSE_TYPES.has(event.type));
  const incorrectTail = consecutiveTail(responses, STUDY_LEARNING_INTERACTION.RESPONSE_INCORRECT);
  const correctTail = consecutiveTail(responses, STUDY_LEARNING_INTERACTION.RESPONSE_CORRECT);
  const hintRequests = recent.filter((event) => event.type === STUDY_LEARNING_INTERACTION.HINT_REQUESTED).length;
  const hintDepth = recent
    .filter((event) => event.type === STUDY_LEARNING_INTERACTION.HINT_DEPTH_USED)
    .reduce((max, event) => Math.max(max, Number(event.hintDepth) || 0), 0);
  const repeatedExplanations = recent.filter((event) => event.type === STUDY_LEARNING_INTERACTION.REPEATED_EXPLANATION_REQUESTED).length;

  const misconceptionCandidate = incorrectTail >= 2 ? 'possible' : 'none';
  const hintDependence = hintRequests >= 3 || hintDepth >= 3
    ? 'high'
    : hintRequests > 0 || hintDepth > 0
      ? 'emerging'
      : 'none';

  let recentPattern = 'neutral';
  if (correctTail >= 2) recentPattern = 'success';
  else if (incorrectTail >= 2) recentPattern = 'struggle';
  else if (responses.some((event) => event.type === STUDY_LEARNING_INTERACTION.RESPONSE_CORRECT)
    && responses.some((event) => event.type === STUDY_LEARNING_INTERACTION.RESPONSE_INCORRECT)) recentPattern = 'mixed';

  const latestRepresentation = [...recent].reverse().find((event) => (
    event.type === STUDY_LEARNING_INTERACTION.SIMULATION_MANIPULATED
    || event.type === STUDY_LEARNING_INTERACTION.VISUAL_REQUESTED
  ));
  const representationPreference = latestRepresentation?.type === STUDY_LEARNING_INTERACTION.SIMULATION_MANIPULATED
    ? 'interactive'
    : latestRepresentation?.type === STUDY_LEARNING_INTERACTION.VISUAL_REQUESTED
      ? 'visual'
      : null;

  let scaffoldingNeed = 'low';
  if (misconceptionCandidate === 'possible' || hintDependence === 'high' || repeatedExplanations >= 2) {
    scaffoldingNeed = 'high';
  } else if (incorrectTail > 0 || hintDependence === 'emerging' || repeatedExplanations > 0 || representationPreference) {
    scaffoldingNeed = 'moderate';
  }

  const reasonCodes = [];
  if (misconceptionCandidate === 'possible') reasonCodes.push('repeated_incorrect_response');
  if (hintDependence === 'high') reasonCodes.push('repeated_hint_use');
  else if (hintDependence === 'emerging') reasonCodes.push('hint_used');
  if (repeatedExplanations > 0) reasonCodes.push('reexplanation_requested');
  if (representationPreference === 'interactive') reasonCodes.push('interactive_manipulation_observed');
  else if (representationPreference === 'visual') reasonCodes.push('visual_requested');
  if (recentPattern === 'success') reasonCodes.push('recent_verified_success');
  if (recentPattern === 'mixed') reasonCodes.push('mixed_recent_results');

  return Object.freeze({
    version: STUDY_WORKING_STATE_VERSION,
    temporary: true,
    conceptKey: normalizeConceptKey(conceptKey),
    conceptLabel: clean(conceptLabel, 300),
    misconceptionCandidate,
    hintDependence,
    representationPreference,
    recentPattern,
    scaffoldingNeed,
    observedSignals: recent.length,
    reasonCodes: Object.freeze(reasonCodes.slice(0, 6)),
  });
}

export function setStudyWorkingConcept({ conceptKey = '', conceptLabel = '' } = {}) {
  const next = {
    conceptKey: normalizeConceptKey(conceptKey),
    conceptLabel: clean(conceptLabel, 300),
  };
  if (activeConcept.conceptKey && next.conceptKey && activeConcept.conceptKey !== next.conceptKey) {
    observations = [];
  }
  activeConcept = next;
}

export function readStudyWorkingState(options = {}) {
  return deriveStudyWorkingState({
    events: observations,
    conceptKey: activeConcept.conceptKey,
    conceptLabel: activeConcept.conceptLabel,
    now: options.now || Date.now,
  });
}

export function resetStudyWorkingStateForTests() {
  activeConcept = { conceptKey: '', conceptLabel: '' };
  observations = [];
}

function consumeStudyInteraction(event) {
  if (!event || event.observationOnly !== true) return;
  const eventConcept = normalizeConceptKey(event.conceptId);
  if (eventConcept && activeConcept.conceptKey && eventConcept !== activeConcept.conceptKey) return;
  if (!activeConcept.conceptKey && eventConcept) activeConcept.conceptKey = eventConcept;
  observations = [...observations, event].slice(-STUDY_WORKING_STATE_MAX_EVENTS);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(STUDY_LEARNING_INTERACTION_EVENT, (event) => consumeStudyInteraction(event?.detail));
}
