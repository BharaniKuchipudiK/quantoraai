import { useModelExperienceMemory } from './useModelExperienceMemory.js';

/**
 * @deprecated PCL mission memory is server-authoritative Outcome State + Project
 * Outcome Graph + Cognitive Ledger. This compatibility shim exists only while
 * legacy UI imports migrate to useModelExperienceMemory.
 */
export function usePCLMemory() {
  return useModelExperienceMemory();
}
