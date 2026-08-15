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
  return { logModelFailure, checkModelHealth, clearModelHealth, logPreference };
}
