import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

// Execute the built artifact: source imports and a successful build cannot
// detect a module-format mismatch introduced by bundling.
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const child = spawn(process.execPath, [process.argv[2] || 'dist/server.mjs'], {
  env: { ...process.env, PORT: String(port), NODE_ENV: 'production', SERVE_STATIC: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-8000); });
child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-8000); });
const exited = once(child, 'exit');
try {
  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, `Built server exited before readiness:\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<html/i);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(ready, `Built server did not serve the frontend:\n${output}`);
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/providers`, { signal: AbortSignal.timeout(2000) });
  assert.equal(response.status, 200);
  const providers = await response.json();
  assert.equal(typeof providers.google, 'boolean');
  assert.equal(typeof providers.github, 'boolean');
  console.log('Self-host smoke passed: built server starts, serves HTML, and executes the auth providers route.');
} finally {
  child.kill('SIGTERM');
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
  await exited;
  clearTimeout(killTimer);
}
