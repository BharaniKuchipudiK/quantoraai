import { OutcomeStateSchema } from './schema';

export function normalizeOutcomeState(data: unknown) {
  const parsed = OutcomeStateSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  return OutcomeStateSchema.parse({});
}
