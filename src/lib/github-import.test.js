import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_REPOSITORY_IMPORT_TASK,
  buildGithubCreatePrRequestBody,
  buildGithubImportRequestBody,
  githubCompareUrl,
  humanGithubHttpError,
  readGithubApiJson,
} from './github-import.js';

test('import request always targets repository-preview with a task', () => {
  const body = buildGithubImportRequestBody('https://github.com/BharaniKuchipudiK/quantoraai');
  assert.equal(body.targetStage, 'repository-preview');
  assert.equal(body.repoUrl, 'https://github.com/BharaniKuchipudiK/quantoraai');
  assert.match(body.task, /coding context/i);
  assert.equal(body.task, DEFAULT_REPOSITORY_IMPORT_TASK);
});

test('non-JSON HTML 404 never throws Unexpected token parse error', async () => {
  const response = new Response('The page could not be found', {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  const result = await readGithubApiJson(response);
  assert.equal(result.ok, false);
  assert.match(result.error, /not found|endpoint|JSON/i);
  assert.equal(/Unexpected token/i.test(result.error), false);
  assert.equal(/is not valid JSON/i.test(result.error), false);
});

test('login HTML never surfaces cryptic JSON parse crash', async () => {
  const response = new Response('<!DOCTYPE html><html><body>Sign in to continue</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
  const result = await readGithubApiJson(response);
  assert.equal(result.ok, false);
  assert.match(result.error, /login|sign in|non-JSON/i);
  assert.equal(/Unexpected token/i.test(result.error), false);
});

test('API JSON errors surface the server message', async () => {
  const response = new Response(JSON.stringify({ error: 'Repository not found. Private repositories require a configured GitHub token.' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
  const result = await readGithubApiJson(response);
  assert.equal(result.ok, false);
  assert.match(result.error, /Private repositories require/);
});

test('successful JSON import payload is returned', async () => {
  const payload = { name: 'acme/widget', content: '--- README.md ---' };
  const response = new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const result = await readGithubApiJson(response);
  assert.equal(result.ok, true);
  assert.equal(result.data.name, 'acme/widget');
});

test('compare URL opens GitHub PR expand for an imported repo', () => {
  assert.equal(
    githubCompareUrl('https://github.com/acme/widget.git', 'quantora-desk', 'main'),
    'https://github.com/acme/widget/compare/main...quantora-desk?expand=1',
  );
  assert.equal(githubCompareUrl('https://example.com/acme/widget'), '');
});

test('create-pr body includes pipeline stage', () => {
  const body = buildGithubCreatePrRequestBody({
    repoUrl: 'https://github.com/acme/widget',
    title: 'Desk changes',
    head: 'quantora-desk',
  });
  assert.equal(body.targetStage, 'github-create-pr');
  assert.equal(body.head, 'quantora-desk');
});

test('human errors stay honest for auth and rate limits', () => {
  assert.match(humanGithubHttpError(401, 'api'), /Sign in/);
  assert.match(humanGithubHttpError(403, 'api'), /GITHUB_TOKEN|rate/i);
  assert.match(humanGithubHttpError(404, 'api'), /private repos require GITHUB_TOKEN/i);
});
