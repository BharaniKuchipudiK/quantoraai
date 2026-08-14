import { z } from 'zod';

export const MemoryEntrySchema = z.object({
  type: z.enum(['OBSERVATION', 'PREFERENCE', 'ACTION_RESULT']),
  content: z.string(),
  importance: z.number().default(3),
});

export class QuantoraMemory {
  private static memories: any[] = [];
  static record(type: 'OBSERVATION' | 'PREFERENCE' | 'ACTION_RESULT', content: string, importance: number = 3) {
    this.memories.push({ type, content, importance, timestamp: new Date().toISOString() });
  }
  static getContextString() {
    return this.memories.map(m => `[${m.type}] ${m.content}`).join('\n');
  }
}
