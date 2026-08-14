import { useState } from 'react';
import { QuantoraOrchestrator } from '../lib/intelligence/orchestrator';
import { Blueprint } from '../lib/intelligence/blueprint';

export function useQuantoraIntelligence() {
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  const processImagination = async (prompt: string, context: any) => {
    setIsThinking(true);
    try {
      // Simulate the DeepMind-style "Chain of Thought"
      const result = await QuantoraOrchestrator.brainstorm(prompt, context);
      setBlueprint(result);
    } catch (error) {
      console.error("Intelligence failure:", error);
    } finally {
      setIsThinking(false);
    }
  };

  return { blueprint, isThinking, processImagination };
}
