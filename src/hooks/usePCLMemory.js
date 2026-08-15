export function usePCLMemory() {
  const MEMORY_KEY = 'quantora_pcl_health_memory';
  const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

  const getMemory = () => {
    try {
      const data = localStorage.getItem(MEMORY_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  };

  const saveMemory = (mem) => {
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
    } catch (e) {}
  };

  const logModelFailure = (modelId, errorType) => {
    if (!modelId) return;
    const mem = getMemory();
    mem[modelId] = {
      timestamp: Date.now(),
      errorType
    };
    saveMemory(mem);
  };

  const checkModelHealth = (modelId) => {
    if (!modelId) return { isHealthy: true };
    const mem = getMemory();
    const record = mem[modelId];
    
    if (record) {
      const elapsed = Date.now() - record.timestamp;
      if (elapsed < EXPIRY_MS) {
        return { isHealthy: false, lastFailureMsAgo: elapsed, errorType: record.errorType };
      } else {
        // Clear expired memory
        delete mem[modelId];
        saveMemory(mem);
      }
    }
    return { isHealthy: true };
  };
  
  const clearModelHealth = (modelId) => {
    if (!modelId) return;
    const mem = getMemory();
    delete mem[modelId];
    saveMemory(mem);
  };

  const logPreference = (modelId, score = 1) => {
    if (!modelId) return;
    const mem = getMemory();
    if (!mem.preferences) mem.preferences = {};
    mem.preferences[modelId] = (mem.preferences[modelId] || 0) + score;
    saveMemory(mem);
  };

  const logFeedback = (prompt, responseText, isPositive) => {
    if (isPositive) return; // For now, we only learn from mistakes
    const mem = getMemory();
    if (!mem.learnedBehaviors) mem.learnedBehaviors = [];
    
    // Store the failure signature
    mem.learnedBehaviors.push({
      timestamp: Date.now(),
      failedPrompt: prompt,
      badResponseSnippet: responseText.substring(0, 200) + '...'
    });
    
    // Keep only the last 5 corrections to avoid blowing up the system prompt context window
    if (mem.learnedBehaviors.length > 5) {
      mem.learnedBehaviors.shift();
    }
    saveMemory(mem);
  };

  const getLearnedBehaviors = () => {
    const mem = getMemory();
    if (!mem.learnedBehaviors || mem.learnedBehaviors.length === 0) return null;
    
    let instructions = "⚠️ PCL COGNITIVE MEMORY ALERT - DO NOT REPEAT PAST MISTAKES ⚠️\n";
    instructions += "In previous interactions, you failed to follow instructions. Learn from these failures:\n";
    
    mem.learnedBehaviors.forEach((b, i) => {
      instructions += `\n[Failure ${i+1}] When the user asked: "${b.failedPrompt}", you incorrectly responded with: "${b.badResponseSnippet}". DO NOT repeat this behavior. Strictly obey the user's requested persona and intent without hallucinating platform philosophy.`;
    });
    
    return instructions;
  };

  return { logModelFailure, checkModelHealth, clearModelHealth, logPreference, logFeedback, getLearnedBehaviors };
}
