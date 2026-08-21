const MIN_RELIABILITY_SAMPLES = 5;
const DEGRADED_SUCCESS_RATE = 0.25;
const HEALTHY_SUCCESS_RATE = 0.8;
const SLOW_SUCCESS_LATENCY_MS = 15_000;

export function aggregateModelQuality(rows = []) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.model_id) continue;
    const current = result.get(row.model_id) || {
      successes: 0,
      failures: 0,
      helpful: 0,
      notHelpful: 0,
      fallbacks: 0,
      weightedLatencyTotal: 0,
      latencySuccesses: 0,
      lastEventAt: null,
    };
    const successes = Number(row.successful_responses) || 0;
    const avgLatency = Number(row.avg_latency_ms) || 0;
    current.successes += successes;
    current.failures += Number(row.failed_responses) || 0;
    current.helpful += Number(row.helpful_votes) || 0;
    current.notHelpful += Number(row.not_helpful_votes) || 0;
    current.fallbacks += Number(row.fallback_rescues) || 0;
    if (successes > 0 && avgLatency > 0) {
      current.weightedLatencyTotal += successes * avgLatency;
      current.latencySuccesses += successes;
    }
    if (row.last_event_at && (!current.lastEventAt || new Date(row.last_event_at) > new Date(current.lastEventAt))) {
      current.lastEventAt = row.last_event_at;
    }
    result.set(row.model_id, current);
  }

  for (const quality of result.values()) {
    const reliabilitySamples = quality.successes + quality.failures;
    const feedbackSamples = quality.helpful + quality.notHelpful;
    const reliability = reliabilitySamples ? quality.successes / reliabilitySamples : null;
    const usefulness = feedbackSamples ? quality.helpful / feedbackSamples : null;
    quality.sampleSize = reliabilitySamples;
    quality.successRate = reliability == null ? null : Math.round(reliability * 100);
    quality.avgLatencyMs = quality.latencySuccesses
      ? Math.round(quality.weightedLatencyTotal / quality.latencySuccesses)
      : 0;
    quality.score = reliabilitySamples >= MIN_RELIABILITY_SAMPLES
      ? Math.round(100 * ((reliability ?? 0.5) * 0.7 + (usefulness ?? reliability ?? 0.5) * 0.3))
      : null;
    delete quality.weightedLatencyTotal;
    delete quality.latencySuccesses;
  }
  return result;
}

export function classifyRecentModelHealth(quality) {
  if (!quality || Number(quality.sampleSize) < MIN_RELIABILITY_SAMPLES) {
    return { state: 'observing', selectable: true, reason: 'insufficient_recent_samples' };
  }

  const successRate = Number(quality.successRate) / 100;
  if (successRate <= DEGRADED_SUCCESS_RATE) {
    return { state: 'degraded', selectable: false, reason: 'recent_failure_rate' };
  }

  if (successRate >= HEALTHY_SUCCESS_RATE) {
    if (Number(quality.avgLatencyMs) >= SLOW_SUCCESS_LATENCY_MS) {
      return { state: 'slow', selectable: true, reason: 'recent_latency' };
    }
    return { state: 'healthy', selectable: true, reason: 'recent_reliability' };
  }

  return { state: 'observing', selectable: true, reason: 'mixed_recent_results' };
}

export function applyRecentHealth(model, recentQuality) {
  const health = classifyRecentModelHealth(recentQuality);
  return {
    ...model,
    recentQuality: recentQuality || null,
    health: health.state,
    healthReason: health.reason,
    available: model?.available !== false && health.selectable,
    selectable: model?.selectable !== false && health.selectable,
  };
}

export const MODEL_HEALTH_POLICY = Object.freeze({
  minReliabilitySamples: MIN_RELIABILITY_SAMPLES,
  degradedSuccessRate: DEGRADED_SUCCESS_RATE,
  healthySuccessRate: HEALTHY_SUCCESS_RATE,
  slowSuccessLatencyMs: SLOW_SUCCESS_LATENCY_MS,
});
