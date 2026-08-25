/**
 * Short-term Coding Desk lessons — failures teach the next plan.
 * Not ML. Product memory: what broke, what to do differently.
 */

const STORAGE_KEY = 'quantora_coding_turn_lessons';
const MAX_LESSONS = 8;

function readAll() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* private mode */ }
}

/**
 * @typedef {{
 *   at: number,
 *   kind: string,
 *   detail?: string,
 *   intentKind?: string,
 * }} CodingTurnLesson
 */

export function rememberCodingTurnLesson(sessionId, lesson) {
  const id = String(sessionId || 'anon');
  const all = readAll();
  const prev = Array.isArray(all[id]) ? all[id] : [];
  const entry = {
    at: Date.now(),
    kind: String(lesson?.kind || 'unknown'),
    detail: String(lesson?.detail || '').slice(0, 240),
    intentKind: lesson?.intentKind ? String(lesson.intentKind) : undefined,
  };
  all[id] = [entry, ...prev].slice(0, MAX_LESSONS);
  writeAll(all);
  return entry;
}

export function readCodingTurnLessons(sessionId) {
  const id = String(sessionId || 'anon');
  const all = readAll();
  return Array.isArray(all[id]) ? all[id] : [];
}

/**
 * Turn lessons into planner hints — smarter next turn, not a dead error.
 */
export function lessonsToPlannerHints(lessons = []) {
  const list = Array.isArray(lessons) ? lessons : [];
  const kinds = new Set(list.map((item) => item.kind));
  return {
    preferDeterministicShopSkills: kinds.has('svg_only_desk')
      || kinds.has('empty_photos')
      || kinds.has('timeout_shop'),
    escalateModel: kinds.has('timeout_shop') || kinds.has('provider_dead'),
    reinforceInterrupt: kinds.has('oversize_burn') || kinds.has('timeout_shop'),
    lastLesson: list[0] || null,
  };
}
