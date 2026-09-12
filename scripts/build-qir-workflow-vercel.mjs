import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const service = resolve('services/qir-workflow');
const built = spawnSync(resolve('node_modules/.bin/nitro'), ['build'], {
  cwd: service, env: { ...process.env, NITRO_PRESET: 'vercel' }, stdio: 'inherit',
});
if (built.status !== 0) process.exit(built.status || 1);
mkdirSync('.vercel/output', { recursive: true });
cpSync(resolve(service, '.vercel/output'), '.vercel/output', { recursive: true });
