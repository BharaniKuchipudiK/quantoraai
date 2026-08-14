import { z } from 'zod';

export const OutcomeStateSchema = z.object({
  id: z.string().default(''),
  confidence: z.coerce.number().min(0).max(1).default(0),
  status: z.enum(['pending', 'completed', 'failed']).default('pending'),
  suggestions: z.array(z.string()).catch([]),
  metadata: z.record(z.any()).default({}),
  lastUpdated: z.string().datetime().optional().default(() => new Date().toISOString()),
});

export type OutcomeState = z.infer<typeof OutcomeStateSchema>;

export const SessionContextSchema = z.object({
  sessionId: z.string().uuid(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).default([]),
  preferences: z.record(z.any()).default({}),
});

export type SessionContext = z.infer<typeof SessionContextSchema>;
