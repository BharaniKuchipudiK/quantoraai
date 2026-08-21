import assert from 'node:assert/strict';
import test from 'node:test';
import { parseYouTubeVideoId } from './youtube-media.js';

test('parses supported YouTube URL forms without DOM state', () => {
  assert.equal(parseYouTubeVideoId('https://youtu.be/abc123'), 'abc123');
  assert.equal(parseYouTubeVideoId('https://www.youtube.com/watch?v=abc123'), 'abc123');
  assert.equal(parseYouTubeVideoId('https://youtube.com/shorts/abc123'), 'abc123');
  assert.equal(parseYouTubeVideoId('https://example.com/watch?v=abc123'), null);
});
