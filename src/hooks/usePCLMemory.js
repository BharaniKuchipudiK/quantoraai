import { useModelExperienceMemory } from './useModelExperienceMemory.js';

/**
 * @deprecated PCL mission memory is server-authoritative Outcome State + Project
 * Outcome Graph + Cognitive Ledger. This compatibility shim exists only while
 * legacy UI imports migrate to useModelExperienceMemory.
 *
 * Important UX boundary: model-health telemetry is an internal routing signal,
 * not customer-facing PCL. The legacy AiStudio interception card must never
 * block a user turn or surface "PCL Observation" diagnostics. Actual provider
 * failures are still handled by the chat runtime/fallback path.
 */
export function usePCLMemory() {
  const memory = useModelExperienceMemory();

  return {
    ...memory,
    checkModelHealth: () => ({ isHealthy: true }),
  };
}
