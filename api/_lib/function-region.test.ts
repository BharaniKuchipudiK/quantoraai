import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('[was-red] server functions run beside the Tokyo control-plane database', async () => {
  const raw = await readFile(new URL('../../vercel.json', import.meta.url), 'utf8');
  const config = JSON.parse(raw);
  assert.deepEqual(config.regions, ['hnd1'],
    'the Supabase project is in ap-northeast-1; default iad1 adds a cross-Pacific dependency to every health decision');
});
