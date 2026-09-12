import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const service = resolve('services/qir-workflow');
const built = spawnSync(resolve('node_modules/.bin/nitro'), ['build'], {
  cwd: service, env: { ...process.env, NITRO_PRESET: 'vercel' }, stdio: 'inherit',
});
if (built.status !== 0) process.exit(built.status || 1);
// Compilation alone missed an SDK initialization crash in the CJS step bundle.
// Load each deployable handler before allowing upload.
for (const handler of ['flow', 'step']) {
  const entry = resolve(service, `.vercel/output/functions/.well-known/workflow/v1/${handler}.func/index.js`);
  const smoke = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', entry], { stdio: 'inherit', timeout: 30_000 });
  if (smoke.status !== 0) process.exit(smoke.status || 1);
}
mkdirSync('.vercel/output', { recursive: true });
cpSync(resolve(service, '.vercel/output'), '.vercel/output', { recursive: true });
