import assert from 'node:assert/strict';
import test from 'node:test';
import { enabledOpenRouterTools, runOpenRouterToolAgent } from './openrouter-tool-agent.js';
import type { QuantoraToolContext, QuantoraToolDispatch } from './tool-registry.js';
import type { GithubPrincipal } from './github-principal.js';

const PRINCIPAL: GithubPrincipal = {
  userSub: 'user-1',
  login: 'octocat',
  token: 'gho_test',
  scopes: ['repo'],
  connectedAt: '2026-09-12T00:00:00.000Z',
};

function context(): QuantoraToolContext {
  return {
    githubPrincipal: PRINCIPAL,
    githubWriteToolsEnabled: false,
    vercelToken: null,
    sandboxCredentials: null,
    travelToolsPermitted: false,
    toolDeadlineAt: Date.now() + 60_000,
  };
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('OpenRouter receives the same enabled registry declarations in OpenAI function-tool shape', () => {
  const tools = enabledOpenRouterTools(context());
  const readPr = tools.find((tool) => tool.function?.name === 'read_pull_request');
  const readFile = tools.find((tool) => tool.function?.name === 'read_repo_file');
  assert.ok(readPr, 'connected GitHub read tool must be offered');
  assert.ok(readFile, 'registry tools must not disappear in provider conversion');
  assert.equal(readPr.type, 'function');
  assert.equal(readPr.function.parameters.type, 'object');
  assert.match(readPr.function.description, /REQUIRED before answering/i);
  assert.equal(tools.some((tool) => tool.function?.name === 'push_files_to_repository'), false, 'write opt-in stays authoritative');
  assert.equal(tools.some((tool) => tool.function?.name === 'search_flights'), false, 'travel revocation stays authoritative');
});

test('Nemotron/OpenRouter tool call dispatches through the universal registry boundary and feeds the result back', async () => {
  const requests: any[] = [];
  let modelTurn = 0;
  const fetchImpl = async (_url: any, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    requests.push(body);
    modelTurn += 1;
    if (modelTurn === 1) {
      return jsonResponse({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant', content: null,
            tool_calls: [{
              id: 'call_read_1', type: 'function',
              function: {
                name: 'read_repo_file',
                arguments: JSON.stringify({ owner: 'acme', repo: 'widgets', path: 'README.md' }),
              },
            }],
          },
        }],
      });
    }
    return jsonResponse({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'README says the widget is ready.' } }],
    });
  };

  const dispatches: Array<{ name: unknown; args: unknown }> = [];
  const dispatch = async (name: unknown, args: unknown): Promise<QuantoraToolDispatch> => {
    dispatches.push({ name, args });
    const raw = { ok: true, path: 'README.md', content: '# Widget\nReady.' };
    return { status: 'ok', invocation: { family: 'github', raw, classify: () => 'cleared' } };
  };

  const states: string[] = [];
  const result = await runOpenRouterToolAgent({
    key: 'sk-or-v1-test',
    modelId: 'nvidia/nemotron-test',
    messages: [{ role: 'user', content: 'Read the README.' }],
    toolContext: context(),
    fetchImpl: fetchImpl as any,
    dispatch,
    permit: (name) => name === 'read_repo_file',
    onToolState: ({ state }) => states.push(state),
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.text, 'README says the widget is ready.');
  assert.deepEqual(result.toolCalls, ['read_repo_file']);
  assert.equal(dispatches.length, 1);
  assert.deepEqual(dispatches[0], {
    name: 'read_repo_file',
    args: { owner: 'acme', repo: 'widgets', path: 'README.md' },
  });
  assert.equal(requests.length, 2);
  assert.ok(Array.isArray(requests[0].tools) && requests[0].tools.some((tool: any) => tool.function.name === 'read_repo_file'));
  const followup = requests[1].messages;
  assert.equal(followup.at(-2).role, 'assistant');
  assert.equal(followup.at(-2).tool_calls[0].id, 'call_read_1');
  assert.equal(followup.at(-1).role, 'tool');
  assert.equal(followup.at(-1).tool_call_id, 'call_read_1');
  assert.match(followup.at(-1).content, /Widget/);
  assert.deepEqual(states, ['running', 'cleared', 'completed']);
});

test('an unoffered tool is blocked before dispatch', async () => {
  let dispatched = false;
  await assert.rejects(
    runOpenRouterToolAgent({
      key: 'sk-or-v1-test',
      modelId: 'nvidia/nemotron-test',
      messages: [{ role: 'user', content: 'Merge it.' }],
      toolContext: context(),
      fetchImpl: (async () => jsonResponse({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [{ id: 'call_bad', type: 'function', function: { name: 'merge_pull_request', arguments: '{}' } }],
          },
        }],
      })) as any,
      dispatch: async () => {
        dispatched = true;
        throw new Error('must not dispatch');
      },
      permit: () => false,
    }),
    /Blocked unexpected tool call/,
  );
  assert.equal(dispatched, false);
});

test('malformed JSON arguments return a tool error to the model without executing anything', async () => {
  let modelTurn = 0;
  let dispatched = false;
  const bodies: any[] = [];
  const result = await runOpenRouterToolAgent({
    key: 'sk-or-v1-test',
    modelId: 'nvidia/nemotron-test',
    messages: [{ role: 'user', content: 'Read it.' }],
    toolContext: context(),
    fetchImpl: (async (_url: any, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      bodies.push(body);
      modelTurn += 1;
      return modelTurn === 1
        ? jsonResponse({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'bad_json', type: 'function', function: { name: 'read_repo_file', arguments: '{bad' } }] } }] })
        : jsonResponse({ choices: [{ finish_reason: 'stop', message: { content: 'I corrected the tool arguments.' } }] });
    }) as any,
    dispatch: async () => {
      dispatched = true;
      throw new Error('must not execute malformed arguments');
    },
    permit: () => true,
  });
  assert.equal(result.status, 'completed');
  assert.equal(dispatched, false);
  assert.match(String(bodies[1].messages.at(-1).content), /invalid_arguments/);
  assert.match(String(bodies[1].messages.at(-1).content), /No tool executed/);
});

test('agent stops after the bounded number of model/tool steps', async () => {
  let calls = 0;
  await assert.rejects(
    runOpenRouterToolAgent({
      key: 'sk-or-v1-test',
      modelId: 'nvidia/nemotron-test',
      messages: [{ role: 'user', content: 'Keep reading.' }],
      toolContext: context(),
      maxSteps: 2,
      fetchImpl: (async () => {
        calls += 1;
        return jsonResponse({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: `call_${calls}`, type: 'function', function: { name: 'read_repo_file', arguments: '{}' } }] } }] });
      }) as any,
      dispatch: async () => ({
        status: 'ok',
        invocation: { family: 'github', raw: { ok: true }, classify: () => 'cleared' },
      }),
      permit: () => true,
    }),
    /exceeded the 2-step safety limit/,
  );
  assert.equal(calls, 2);
});
