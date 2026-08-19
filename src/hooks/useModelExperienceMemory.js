const EXPERIENCE_KEY = 'quantora_model_experience_memory';
const LEGACY_KEY = 'quantora_pcl_health_memory';
const EXPIRY_MS = 15 * 60 * 1000;

function readRawMemory() {
  try {
    const current = localStorage.getItem(EXPERIENCE_KEY);
    if (current) return JSON.parse(current);
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return {};
    const migrated = JSON.parse(legacy);
    localStorage.setItem(EXPERIENCE_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return {};
  }
}

function saveRawMemory(memory) {
  try {
    localStorage.setItem(EXPERIENCE_KEY, JSON.stringify(memory));
  } catch {
    // Experience telemetry is best-effort and must never block a conversation.
  }
}

/**
 * Short-lived model/runtime experience signals only.
 *
 * This is deliberately NOT PCL mission memory. It may influence failover and
 * model preference, but it cannot create project facts, approvals, decisions,
 * rejections, corrections, evidence, or Outcome State.
 */
export function useModelExperienceMemory() {
  const logModelFailure = (modelId, errorType) => {
    if (!modelId) return;
    const memory = readRawMemory();
    memory[modelId] = { timestamp: Date.now(), errorType };
    saveRawMemory(memory);
  };

  const checkModelHealth = (modelId) => {
    if (!modelId) return { isHealthy: true };
    const memory = readRawMemory();
    const record = memory[modelId];
    if (!record) return { isHealthy: true };

    const elapsed = Date.now() - record.timestamp;
    if (elapsed < EXPIRY_MS) {
      return { isHealthy: false, lastFailureMsAgo: elapsed, errorType: record.errorType };
    }
    delete memory[modelId];
    saveRawMemory(memory);
    return { isHealthy: true };
  };

  const clearModelHealth = (modelId) => {
    if (!modelId) return;
    const memory = readRawMemory();
    delete memory[modelId];
    saveRawMemory(memory);
  };

  const logPreference = (modelId, score = 1) => {
    if (!modelId) return;
    const memory = readRawMemory();
    if (!memory.preferences) memory.preferences = {};
    memory.preferences[modelId] = (memory.preferences[modelId] || 0) + score;
    saveRawMemory(memory);
  };

  const logFeedback = (prompt, responseText, isPositive) => {
    if (isPositive) return;
    const memory = readRawMemory();
    if (!memory.learnedBehaviors) memory.learnedBehaviors = [];
    memory.learnedBehaviors.push({
      timestamp: Date.now(),
      failedPrompt: String(prompt || '').slice(0, 500),
      badResponseSnippet: `${String(responseText || '').substring(0, 200)}...`,
    });
    if (memory.learnedBehaviors.length > 5) memory.learnedBehaviors.shift();
    saveRawMemory(memory);
  };

  /**
   * Legacy compatibility only. We still collect local quality telemetry for
   * diagnostics/experimentation, but it must never be concatenated into the
   * user's next prompt. Doing so contaminates intent and can make the model
   * expose evaluator language to the customer.
   */
  const getLearnedBehaviors = () => null;

  return { logModelFailure, checkModelHealth, clearModelHealth, logPreference, logFeedback, getLearnedBehaviors };
}
