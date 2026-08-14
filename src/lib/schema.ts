import { z } from 'zod';

// Schema for Outcome State
export const OutcomeStateSchema = z.object({
  id: z.string().default(''),
  // Using a more compatible way to handle numbers
  confidence: z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number().min(0).max(1)).default(0),
  status: z.enum(['pending', 'completed', 'failed']).default('pending'),
  // Removed .catch() as it causes conflicts in some TS versions
  suggestions: z.array(z.string()).default([]),
  metadata: z.record(z.any()).default({}),
  lastUpdated: z.string().optional().default(() => new Date().toISOString()),
});

export type OutcomeState = z.infer<typeof OutcomeStateSchema>;

// Schema for Session Context
export const SessionContextSchema = z.object({
  // Simplified UUID check to be more compatible
  sessionId: z.string(),
  messages: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).default([]),
  preferences: z.record(z.any()).default({}),
});

export type SessionContext = z.infer<typeof SessionContextSchema>;
