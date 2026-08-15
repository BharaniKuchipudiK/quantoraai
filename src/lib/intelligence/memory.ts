import { z } from 'zod';

export const MemoryEntrySchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(7)),
  timestamp: z.string().default(() => new Date().toISOString()),
  type: z.enum(['OBSERVATION', 'PREFERENCE', 'ACTION_RESULT']),
  content: z.string(),
  importance: z.number().min(1).max(5).default(3), // 5 = critical context
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export class QuantoraMemory {
  private static memories: MemoryEntry[] = [];

  /**
   * Commits a new memory to the synthetic brain.
   */
  static record(type: MemoryEntry['type'], content: string, importance: number = 3) {
    const entry = MemoryEntrySchema.parse({ type, content, importance });
    this.memories.push(entry);
    console.log(`🧠 Memory Stored: [${type}] ${content.substring(0, 50)}...`);
  }

  /**
   * Retrieves all relevant memories to inform the next "Imagination" phase.
   */
  static recall() {
    return this.memories.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Filters memories for a specific project objective.
   */
  static getContextString() {
    return this.memories
      .map(m => `[${m.type}] ${m.content}`)
      .join('\n');
  }
}
