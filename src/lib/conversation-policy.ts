import { SYSTEM_PROMPTS } from './prompts';

export function getSystemPrompt(mode: 'analyzer' | 'chat') {
  if (mode === 'analyzer') {
    return SYSTEM_PROMPTS.CODE_ANALYZER;
  }
  return SYSTEM_PROMPTS.CONVERSATION_POLICY;
}

export function formatUserMessage(content: string) {
  return {
    role: 'user',
    content: content.trim(),
    timestamp: new Date().toISOString(),
  };
}
