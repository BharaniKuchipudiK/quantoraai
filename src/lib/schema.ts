import { z } from 'zod';

const boundedString = (max: number) => z.string().trim().max(max);

const SessionFactSchema = boundedString(500);

export const SessionContextSchema = z.object({
  goal: boundedString(500).optional(),
  understanding: boundedString(1_500).optional(),
  facts: z.array(SessionFactSchema).max(24).default([]),
}).strict();

export const OutcomeStateSchema = z.object({
  memory: z.object({
    consented: z.boolean().default(false),
  }).default({ consented: false }),
  goal: z.object({
    statement: boundedString(500),
    status: z.enum(['open', 'resolved', 'blocked']).default('open'),
  }).nullable().default(null),
  understanding: boundedString(1_500).nullable().default(null),
  facts: z.array(z.object({
    statement: SessionFactSchema,
    provenance: z.enum(['user', 'assistant', 'model', 'system']).default('user'),
    confidence: z.enum(['low', 'medium', 'high']).default('medium'),
  })).max(32).default([]),
  preferences: z.array(SessionFactSchema).max(16).default([]),
}).strict();
