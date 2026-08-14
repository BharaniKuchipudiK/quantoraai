import { OutcomeStateSchema, type OutcomeState } from './schema';

export function normalizeOutcomeState(data: unknown): OutcomeState {
  return OutcomeStateSchema.parse(data ?? {});
}
