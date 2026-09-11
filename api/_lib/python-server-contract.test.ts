import assert from 'node:assert/strict';
import test from 'node:test';
import { requestedDeliverablePaths } from '../../src/lib/requested-deliverables.js';
import { validateBuildArtifactResponse, recoverInterruptedBuildArtifactResponse } from './build-artifact-contract.js';
import { prompt, response } from '../../scripts/fixtures/python-csv-contract.mjs';
import { invokePythonChatHandler } from '../../scripts/fixtures/python-chat-handler.mjs';

const options = { requestedFiles: requestedDeliverablePaths(prompt), requestBrief: prompt };
test('Python source admission follows the explicit source list, not generated output filenames', () => {
  assert.deepEqual(options.requestedFiles, ['cleaner.py', 'test_cleaner.py', 'sample.csv', 'README.md']);
  assert.equal(validateBuildArtifactResponse(response, null, options).ok, true);
  assert.equal(validateBuildArtifactResponse(response).detailCode, 'browser-preview-missing', 'web contracts remain strict');
  assert.equal(validateBuildArtifactResponse(response, 'simple-website', options).ok, false, 'web canaries cannot bypass their contract');
});
test('Python source validation refuses missing, unsafe, and disguised files', () => {
  for (const invalid of [
    'Files are ready: cleaner.py, test_cleaner.py, sample.csv, README.md',
    response.replace('filepath="cleaner.py"', 'filepath="../cleaner.py"'),
    response.replace('filepath="cleaner.py"', 'filepath="missing.py"'),
    response.replace(/import csv[\s\S]*?(?=\n```)/, '<html><body>Python code panel</body></html>'),
  ]) assert.equal(validateBuildArtifactResponse(invalid, null, options).ok, false);
});
test('interrupted Python recovery requires the full requested bundle', () => {
  assert.equal(recoverInterruptedBuildArtifactResponse(response + '\nunfinished explanation', null, options), response.trim());
  assert.equal(recoverInterruptedBuildArtifactResponse(response.slice(0, response.lastIndexOf('```')), null, options), null);
});
test('real /api/chat handler delivers Python source on the first attempt', async () => {
  const result = await invokePythonChatHandler({ message: prompt, modelId: 'openai/gpt-4o-mini', buildMode: true, studioMode: 'build', studioModeExplicit: true, taskCategory: 'coding' }, response);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.providerCalls, 1, result.stream || JSON.stringify(result.body));
  assert.ok(result.providerRequest);
  assert.match(result.providerRequest.messages.map((message) => message.content).join('\n'), /PYTHON SOURCE OVERRIDE/);
  const events = result.stream.split('\n').filter((line) => line.startsWith('data: {')).map((line) => JSON.parse(line.slice(6)));
  assert.equal(events.some((event) => event.error), false, result.stream);
  assert.equal(events.map((event) => event.text || '').join('').includes('filepath="cleaner.py"'), true, result.stream);
});
