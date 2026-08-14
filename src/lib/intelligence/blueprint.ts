import { z } from 'zod';

export const BlueprintSchema = z.object({
  intent: z.string(),
  objective: z.string(),
  observations: z.array(z.string()),
  imagination: z.array(z.string()), // Creative suggestions for the user
  roadmap: z.array(z.object({
    step: z.number(),
    task: z.string(),
    status: z.enum(['pending', 'executing', 'completed']).default('pending')
  })),
  securityCheck: z.object({
    isSafe: z.boolean(),
    concerns: z.array(z.string()).default([])
  })
});

export type Blueprint = z.infer<typeof BlueprintSchema>;
