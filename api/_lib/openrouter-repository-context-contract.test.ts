import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('OpenRouter and other non-Gemini coding routes receive the checked-out desk context', async () => {
  const source = await readFile(new URL('./chat-handler.ts', import.meta.url), 'utf8');

  // The request's bounded desk packet is sanitized server-side and formatted
  // into the SAME user message used by the provider-neutral route.
  assert.match(source, /const deskContext = advisorTurn \? null : sanitizeDeskContext\(req\.body\?\.deskContext\)/);
  assert.match(source, /const deskBlock = formatDeskContextForPrompt\(deskContext\)/);
  assert.match(source, /const refineUserMessage = \[[\s\S]*messageForModel,[\s\S]*deskBlock,[\s\S]*\]\.filter\(Boolean\)\.join/);

  // Non-Gemini/OpenRouter models are fed `formattedHistory`; the current user
  // entry must be refineUserMessage, not the raw message that predates the desk
  // source block. This is the exact contract that failed for Nemotron: the UI
  // knew the repository while the selected engine saw no code.
  assert.match(source, /const formattedHistory = \[[\s\S]*formattedHistory\.push\(\{[\s\S]*content:[\s\S]*refineUserMessage/);
  assert.match(source, /openOpenRouterResponse\(\{[\s\S]*messages: formattedHistory/);
});
