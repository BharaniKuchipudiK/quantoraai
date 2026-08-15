import type { StudioDomain } from '../../../../api/_lib/studio-domains.js';
import type { StudioMode } from '../../../../api/_lib/studio-modes.js';
import { classifyTask } from '../../model-routing.js';
import type {
  CommunicationAutonomy,
  CommunicationDomain,
  CommunicationIntent,
  CommunicationMode,
  CommunicationStakes,
} from './types';

type ClassifyIntentInput = {
  message: string;
  studioMode: StudioMode;
  studioDomain: StudioDomain | null;
  guidedBuild?: boolean;
  refineMode?: boolean;
  choiceSelected?: boolean;
};

type TaskCategory = 'coding' | 'vision' | 'research' | 'writing' | 'quick' | 'general';

function mapDomain(taskCategory: TaskCategory, studioDomain: StudioDomain | null): CommunicationDomain {
  if (studioDomain) return studioDomain;
  if (taskCategory === 'vision') return 'research';
  if (taskCategory === 'coding') return 'coding';
  if (taskCategory === 'research') return 'research';
  return 'general';
}

function mapMode(input: ClassifyIntentInput, taskCategory: TaskCategory): CommunicationMode {
  if (input.studioMode === 'plan') return 'plan';
  if (input.studioMode === 'build' || input.guidedBuild || input.refineMode) return 'build';
  if (/\b(compare|versus|vs\.?|difference|trade[- ]?off)\b/i.test(input.message)) return 'compare';
  if (/\b(decide|choose|recommend|best option)\b/i.test(input.message)) return 'decide';
  if (/\b(review|audit|verify|check)\b/i.test(input.message)) return 'review';
  if (taskCategory === 'research') return 'review';
  return 'ask';
}

function mapStakes(domain: CommunicationDomain, message: string): CommunicationStakes {
  if (domain === 'finance') return 'high';
  if (/\b(emergency|urgent|critical|security|private|sensitive|investment)\b/i.test(message)) return 'high';
  if (domain === 'travel' || domain === 'education' || domain === 'research') return 'medium';
  return 'low';
}

function mapAutonomy(mode: CommunicationMode, choiceSelected: boolean): CommunicationAutonomy {
  if (mode === 'build') return 'draft';
  if (mode === 'decide' || choiceSelected) return 'recommend';
  return 'answer_only';
}

export function classifyCommunicationIntent(input: ClassifyIntentInput): CommunicationIntent {
  const taskCategory = classifyTask(input.message) as TaskCategory;
  const domain = mapDomain(taskCategory, input.studioDomain);
  const mode = mapMode(input, taskCategory);
  const stakes = mapStakes(domain, input.message);
  const autonomy = mapAutonomy(mode, input.choiceSelected === true);

  return {
    domain,
    mode,
    stakes,
    autonomy,
    needsClarification: input.guidedBuild === true && input.choiceSelected !== true,
    userGoal: input.message.trim() ? input.message.trim().slice(0, 500) : null,
  };
}
