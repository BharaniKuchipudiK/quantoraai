import assert from 'node:assert/strict';
import test from 'node:test';
import type { SandboxFactory, SandboxHandle } from './sandbox-agent-tools.js';
import { qirRuntimeCommandPlan, verifyQirRepositoryRuntime } from './qir-repository-runtime.js';

const CREDENTIALS = { token: 'sandbox-token', teamId: 'team-1', projectId: 'project-1' };

test('lost ownership before allocation performs no external work', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await verifyQirRepositoryRuntime({ vfs: packageVfs(), signal: controller.signal }, {
    credentials: CREDENTIALS,
    sandboxFactory: async () => { throw new Error('must not allocate'); },
  });
  assert.equal(result.status, 'unavailable');
  assert.match('reason' in result ? result.reason : '', /ownership/);
});

test('ownership lost during allocation stops the new sandbox before writing files', async () => {
  const controller = new AbortController();
  let stops = 0;
  const result = await verifyQirRepositoryRuntime({ vfs: packageVfs(), signal: controller.signal }, {
    credentials: CREDENTIALS,
    sandboxFactory: async () => {
      controller.abort();
      return {
        writeFiles: async () => { throw new Error('must not write'); },
        runCommand: async () => { throw new Error('must not execute'); },
        stop: async () => { stops += 1; },
      };
    },
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(stops, 1);
});

test('ownership loss stops an in-flight sandbox command and prevents subsequent checks', async () => {
  const controller = new AbortController();
  let commands = 0;
  let stops = 0;
  let releaseCommand: (() => void) | undefined;
  const result = await verifyQirRepositoryRuntime({ vfs: packageVfs(), signal: controller.signal }, {
    credentials: CREDENTIALS,
    sandboxFactory: async () => ({
      writeFiles: async () => {},
      runCommand: async () => {
        commands += 1;
        await new Promise<void>(resolve => {
          releaseCommand = resolve;
          controller.abort();
        });
        return { exitCode: 0, output: async () => 'success after ownership lost' };
      },
      stop: async () => { stops += 1; releaseCommand?.(); },
    }),
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(commands, 1);
  assert.equal(stops, 1);
});

function packageVfs(script = 'node test.js') {
  return {
    'package.json': JSON.stringify({ scripts: { test: script, build: 'node build.js' } }),
    'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: {} }),
    'test.js': 'console.log("test ok")',
    'build.js': 'console.log("build ok")',
  };
}

function recordingFactory(scripted: Record<string, { exitCode: number; output: string }>) {
  const events: Array<{ type: string; value?: any }> = [];
  let stopped = false;
  const factory: SandboxFactory = async (params) => {
    events.push({ type: 'create', value: params });
    const handle: SandboxHandle = {
      async writeFiles(files) {
        events.push({ type: 'write', value: files.map((file) => ({ path: file.path, content: file.content.toString('utf8') })) });
      },
      async runCommand(params) {
        const command = params.args?.[1] || '';
        events.push({ type: 'run', value: command });
        const result = scripted[command] || { exitCode: 0, output: '' };
        return { exitCode: result.exitCode, output: async () => result.output };
      },
      async stop() {
        stopped = true;
        events.push({ type: 'stop' });
      },
    };
    return handle;
  };
  return { factory, events, stopped: () => stopped };
}

test('derives bounded repository commands from package.json and lockfile', () => {
  assert.deepEqual(qirRuntimeCommandPlan(packageVfs()), [
    'npm ci --no-audit --no-fund',
    'CI=1 npm run test',
    'CI=1 npm run build',
  ]);
  assert.deepEqual(qirRuntimeCommandPlan({ 'index.html': '<main>hello</main>' }), []);
});

test('writes the exact candidate VFS before executing real repository checks', async () => {
  const { factory, events, stopped } = recordingFactory({
    'npm ci --no-audit --no-fund': { exitCode: 0, output: 'installed' },
    'CI=1 npm run test': { exitCode: 0, output: 'tests passed' },
    'CI=1 npm run build': { exitCode: 0, output: 'build passed' },
  });

  const result = await verifyQirRepositoryRuntime(
    { vfs: packageVfs() },
    { credentials: CREDENTIALS, sandboxFactory: factory },
  );

  assert.equal(result.status, 'passed');
  assert.equal(events[0].type, 'create');
  assert.equal(events[1].type, 'write');
  assert.ok(events[1].value.some((file: any) => file.path === 'test.js' && /test ok/.test(file.content)));
  assert.equal(events[2].type, 'run', 'candidate bytes must exist before any command executes');
  assert.equal(stopped(), true);
});

test('a real failing test returns runtime evidence and stops before build', async () => {
  const { factory, events, stopped } = recordingFactory({
    'npm ci --no-audit --no-fund': { exitCode: 0, output: 'installed' },
    'CI=1 npm run test': { exitCode: 1, output: 'AssertionError: expected New' },
  });

  const result = await verifyQirRepositoryRuntime(
    { vfs: packageVfs() },
    { credentials: CREDENTIALS, sandboxFactory: factory },
  );

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.failureCode, 'RUNTIME_FAILURE');
  assert.equal(result.command, 'CI=1 npm run test');
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /AssertionError/);
  assert.equal(events.some((event) => event.type === 'run' && event.value === 'CI=1 npm run build'), false);
  assert.equal(stopped(), true);
});

test('build failures are classified as compile failures', async () => {
  const { factory } = recordingFactory({
    'npm ci --no-audit --no-fund': { exitCode: 0, output: '' },
    'CI=1 npm run test': { exitCode: 0, output: '' },
    'CI=1 npm run build': { exitCode: 2, output: 'TS2322 type mismatch' },
  });
  const result = await verifyQirRepositoryRuntime(
    { vfs: packageVfs() },
    { credentials: CREDENTIALS, sandboxFactory: factory },
  );
  assert.equal(result.status, 'failed');
  if (result.status === 'failed') assert.equal(result.failureCode, 'COMPILE_FAILURE');
});

test('unsafe candidate paths are refused before sandbox creation', async () => {
  let created = false;
  const factory: SandboxFactory = async () => {
    created = true;
    throw new Error('must not create');
  };
  const result = await verifyQirRepositoryRuntime(
    { vfs: { ...packageVfs(), '../secret.txt': 'nope' } },
    { credentials: CREDENTIALS, sandboxFactory: factory },
  );
  assert.equal(result.status, 'failed');
  if (result.status === 'failed') assert.equal(result.failureCode, 'ARTIFACT_INVALID');
  assert.equal(created, false);
});

test('missing sandbox credentials is explicit and never invents runtime success', async () => {
  let created = false;
  const factory: SandboxFactory = async () => {
    created = true;
    throw new Error('must not create');
  };
  const result = await verifyQirRepositoryRuntime(
    { vfs: packageVfs() },
    { credentials: null, sandboxFactory: factory },
  );
  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /no real repository command was executed/i);
  assert.equal(created, false);
});

test('sandbox infrastructure failure is unavailable and still tears down an allocated VM', async () => {
  let stopped = false;
  const factory: SandboxFactory = async () => ({
    async writeFiles() {},
    async runCommand() { throw new Error('microVM lost'); },
    async stop() { stopped = true; },
  });
  const result = await verifyQirRepositoryRuntime(
    { vfs: packageVfs() },
    { credentials: CREDENTIALS, sandboxFactory: factory },
  );
  assert.equal(result.status, 'unavailable');
  assert.match(result.reason, /microVM lost/);
  assert.equal(stopped, true);
});

test('deployed worker uses Sandbox OIDC while explicit missing credentials still fail closed', async () => {
  const keys = ['VERCEL', 'VERCEL_OIDC_TOKEN', 'VERCEL_SANDBOX_TOKEN', 'VERCEL_ACCESS_TOKEN'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const contextSymbol = Symbol.for('@vercel/request-context');
  const globals = globalThis as any;
  const previousContext = globals[contextSymbol];
  let allocations = 0;
  let stops = 0;
  try {
    process.env.VERCEL = '1';
    process.env.VERCEL_OIDC_TOKEN = 'synthetic-oidc';
    delete process.env.VERCEL_SANDBOX_TOKEN;
    delete process.env.VERCEL_ACCESS_TOKEN;
    const sandboxFactory: SandboxFactory = async params => {
      allocations++;
      assert.equal(params.token, undefined);
      return { writeFiles: async () => {}, runCommand: async () => ({ exitCode: 0, output: async () => 'passed' }), stop: async () => { stops++; } };
    };
    const passed = await verifyQirRepositoryRuntime({ vfs: packageVfs() }, { sandboxFactory });
    assert.equal(passed.status, 'passed');
    assert.equal(allocations, 1);
    assert.equal(stops, 1);
    delete process.env.VERCEL_OIDC_TOKEN;
    globals[contextSymbol] = { get: () => ({ headers: { 'x-vercel-oidc-token': 'synthetic-request-oidc' } }) };
    const requestScoped = await verifyQirRepositoryRuntime({ vfs: packageVfs() }, { sandboxFactory });
    assert.equal(requestScoped.status, 'passed');
    assert.equal(allocations, 2);
    assert.equal(stops, 2);
    const disabled = await verifyQirRepositoryRuntime({ vfs: packageVfs() }, { credentials: null, sandboxFactory });
    assert.equal(disabled.status, 'skipped');
    delete process.env.VERCEL;
    const local = await verifyQirRepositoryRuntime({ vfs: packageVfs() }, { sandboxFactory });
    assert.equal(local.status, 'skipped');
    assert.equal(allocations, 2);
    process.env.VERCEL = '1';
    delete globals[contextSymbol];
    const missing = await verifyQirRepositoryRuntime({ vfs: packageVfs() }, { sandboxFactory });
    assert.equal(missing.status, 'skipped');
    assert.equal(allocations, 2);
  } finally {
    if (previousContext === undefined) delete globals[contextSymbol];
    else globals[contextSymbol] = previousContext;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
