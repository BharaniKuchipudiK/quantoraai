const STORAGE_KEY = 'quantora_arena_prefs';

export function loadArenaPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { byTask: {} };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.byTask ? parsed : { byTask: {} };
  } catch {
    return { byTask: {} };
  }
}

export function saveArenaPreferences(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* best effort */ }
}

/** Record a head-to-head arena win for auto-select boosting. */
export function recordArenaWin(taskCategory, winnerModelId, loserModelId) {
  if (!winnerModelId || !taskCategory) return loadArenaPreferences();
  const prefs = loadArenaPreferences();
  if (!prefs.byTask[taskCategory]) prefs.byTask[taskCategory] = {};
  prefs.byTask[taskCategory][winnerModelId] = (prefs.byTask[taskCategory][winnerModelId] || 0) + 1;
  if (loserModelId && prefs.byTask[taskCategory][loserModelId]) {
    prefs.byTask[taskCategory][loserModelId] = Math.max(0, prefs.byTask[taskCategory][loserModelId] - 1);
  }
  saveArenaPreferences(prefs);
  return prefs;
}

export function getArenaWinCount(prefs, taskCategory, modelId) {
  return prefs?.byTask?.[taskCategory]?.[modelId] || 0;
}

/** Boost score when user has preferred this model for the task (≥2 wins). */
export function applyArenaPreferenceBoost(score, modelId, taskCategory, prefs) {
  const wins = getArenaWinCount(prefs, taskCategory, modelId);
  if (wins < 2) return score;
  return score + Math.min(20, wins * 4);
}
