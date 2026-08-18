import assert from 'node:assert/strict';
import test from 'node:test';
import { polishOfficeUiCopy } from './office-ui-copy.js';

test('Office refinement copy hides implementation terminology', () => {
  assert.equal(
    polishOfficeUiCopy('⏳ **Updating the verified POWERPOINT artifact...**'),
    'Updating your presentation…',
  );
  assert.equal(
    polishOfficeUiCopy('⏳ **Updating the verified EXCEL artifact...**'),
    'Updating your spreadsheet…',
  );
});

test('Office creation copy is concise and format-aware', () => {
  assert.equal(
    polishOfficeUiCopy('⏳ **Architecting WORD document from the approved briefing...**'),
    'Creating your document…',
  );
  assert.equal(
    polishOfficeUiCopy('⏳ **Architecting POWERPOINT document from the approved briefing...**'),
    'Creating your presentation…',
  );
});

test('unrelated assistant copy is unchanged', () => {
  const text = 'I reviewed the architecture and found three issues.';
  assert.equal(polishOfficeUiCopy(text), text);
});
