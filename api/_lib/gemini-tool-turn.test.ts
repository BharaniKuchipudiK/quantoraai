import assert from 'node:assert/strict';
import test from 'node:test';
import { appendFunctionResponse, extractSignedFunctionTurn } from './gemini-tool-turn.js';

test('Gemini function continuation preserves provider thoughtSignature exactly', () => {
  const chunk = {
    functionCalls: [{ name: 'search_hotels', args: { location: 'Tokyo' } }],
    candidates: [{
      content: {
        role: 'model',
        parts: [{
          functionCall: { name: 'search_hotels', args: { location: 'Tokyo' } },
          thoughtSignature: 'provider-owned-signature-123',
        }],
      },
    }],
  };

  const extracted = extractSignedFunctionTurn(chunk);
  assert.ok(extracted);
  assert.equal(extracted.modelTurn.parts[0].thoughtSignature, 'provider-owned-signature-123');

  const contents: any[] = [{ role: 'user', parts: [{ text: 'find a hotel' }] }];
  appendFunctionResponse(contents, extracted.modelTurn, extracted.call, { status: 'success' });

  assert.equal(contents[1].parts[0].thoughtSignature, 'provider-owned-signature-123');
  assert.equal(contents[2].parts[0].functionResponse.name, 'search_hotels');
});

test('older responses without candidate content still produce a valid turn', () => {
  const extracted = extractSignedFunctionTurn({
    functionCalls: [{ name: 'search_flights', args: { origin: 'SIN', destination: 'LHR' } }],
  });
  assert.ok(extracted);
  assert.equal(extracted.modelTurn.parts[0].functionCall.name, 'search_flights');
});
