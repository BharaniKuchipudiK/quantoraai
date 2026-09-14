import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../components/StudioActivityRail.jsx', import.meta.url), 'utf8');

test('desk activity rail projects persisted trace activity instead of guessed progress', () => {
  assert.match(source, /fetchTraceStory\(correlationId\)/, 'live activity must come from the persisted trace lookup');
  assert.match(source, /LIVE_ACTIVITY_TRACE_EVENT/, 'a newly-issued Studio turn must wake the activity poller');
  assert.match(source, /result\.activities\.at\(-1\)/, 'the UI should project the latest server-derived activity');
  assert.match(source, /aria-live="polite"/, 'progress must be announced without interrupting the user');
  assert.match(source, /data-quantora-live-activity="true"/, 'browser gates need a stable live-progress surface');
});

test('live activity polling stops advancing a completed trace and clears the final pill', () => {
  assert.match(source, /finishedCorrelationId = correlationId/);
  assert.match(source, /LIVE_ACTIVITY_DONE_HOLD_MS/);
  assert.match(source, /setLiveActivity\(null\)/);
});
