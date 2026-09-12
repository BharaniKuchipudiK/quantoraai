import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./chat-handler.ts', import.meta.url), 'utf8');

test('repository agent tools are provider-neutral rather than Gemini-only', () => {
  assert.match(source, /githubToolsEnabled[\s\S]{0,220}Boolean\(effectiveGeminiKey \|\| effectiveOpenRouterKey\)/);
  assert.match(source, /githubWriteToolsEnabled[\s\S]{0,260}Boolean\(effectiveGeminiKey \|\| effectiveOpenRouterKey\)/);
  assert.match(source, /vercelToolsEnabled[\s\S]{0,220}Boolean\(effectiveGeminiKey \|\| effectiveOpenRouterKey\)/);
  assert.match(source, /sandboxToolsEnabled[\s\S]{0,280}Boolean\(effectiveGeminiKey \|\| effectiveOpenRouterKey\)/);
});

test('an enabled repository tool set cannot fall through the provider-neutral text-only path', () => {
  assert.match(
    source,
    /const repositoryAgentToolsEnabled = githubToolsEnabled[\s\S]{0,180}\|\| sandboxToolsEnabled;/,
  );
  assert.match(source, /if \(!travelToolsEnabled && !repositoryAgentToolsEnabled\) \{/);
});

test('OpenRouter tool turns use the shared context, safety limit and provider adapter', () => {
  assert.match(source, /import \{ runOpenRouterToolAgent \} from '\.\/openrouter-tool-agent\.js';/);
  assert.match(source, /if \(repositoryAgentToolsEnabled\) \{[\s\S]*?runOpenRouterToolAgent\(\{/);
  assert.match(source, /runOpenRouterToolAgent\(\{[\s\S]{0,700}toolContext,[\s\S]{0,180}maxSteps: MAX_AGENT_STEPS/);
  assert.match(source, /const toolContext: QuantoraToolContext = \{[\s\S]{0,450}\.\.\.activeToolContext/);
});

test('Travel remains on its explicitly Gemini-routed live-tools path', () => {
  assert.match(source, /let travelToolsEnabled = wantTravelTools && !travelToolsDeferred && Boolean\(effectiveGeminiKey\)/);
  assert.doesNotMatch(source, /travelToolsEnabled = wantTravelTools[^;]*effectiveOpenRouterKey/);
});
