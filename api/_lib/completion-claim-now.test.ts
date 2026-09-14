import assert from 'node:assert/strict';
import test from 'node:test';
import { claimsCompletion } from './completion-claim.js';

/**
 * Regression for the Coding desk incident where the model said:
 * "I have now implemented the UI action button..."
 *
 * `now` sat between `have` and `implemented`, so the completion detector missed
 * the claim and the proof-of-done gate never got a chance to reject it.
 */
test('"I have now implemented" is a completion claim and must enter proof-of-done', () => {
  assert.equal(
    claimsCompletion('I have now implemented the UI action button to initiate connection to Google Drive directly into the interface.'),
    true,
  );
});

test('future work with now nearby is still not misclassified as completed', () => {
  assert.equal(claimsCompletion('I will now implement the Google Drive button.'), false);
  assert.equal(claimsCompletion('I am going to implement the Google Drive button now.'), false);
});
