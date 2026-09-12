import { createRealSandbox } from './sandbox-factory.js';
import { resolveSandboxCredentials, type SandboxCredentials } from './sandbox-credentials.js';
import type { SandboxFactory, SandboxHandle } from './sandbox-agent-tools.js';
import type { QirFailureCode } from './qir-contracts.js';

const SANDBOX_WALL_CLOCK_MS = 4 * 60_000;
const COMMAND_TIMEOUT_MS = 3 * 60_000;
const MAX_FILES = 500;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 5_000_000;
const MAX_OUTPUT_CHARS = 4_000;
const SKIP_PATH = /(^|\/)(?:node_modules|dist|build|coverage|\.git)(?:\/|$)/;

export type QirRuntimeCommandEvidence = {
  command: string;
  exitCode: number;
  output: string;
  outputTruncated: boolean;
};

export type QirRepositoryRuntimeResult =
  | { status: 'skipped'; reason: string; commands: string[] }
  | { status: 'unavailable'; reason: string; commands: string[] }
  | { status: 'passed'; commands: string[]; results: QirRuntimeCommandEvidence[] }
  | {
      status: 'failed';
      reason: string;
      failureCode: QirFailureCode;
      command: string | null;
      exitCode: number | null;
      output: string;
      commands: string[];
      results: QirRuntimeCommandEvidence[];
    };

export type QirRepositoryRuntimeVerifier = (input: {
  vfs: Record<string, string>;
  signal?: AbortSignal;
}) => Promise<QirRepositoryRuntimeResult>;

type RuntimeOptions = {
  credentials?: SandboxCredentials | null;
  resolveCredentials?: () => SandboxCredentials | null;
  sandboxFactory?: SandboxFactory;
};

function safePath(raw: string): string | null {
  const path = String(raw || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!path || path.startsWith('/') || path.includes('\0')) return null;
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return path;
}

function packageJson(vfs: Record<string, string>): any | null {
  const raw = vfs['package.json'];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function meaningfulScript(value: unknown): boolean {
  const script = String(value || '').trim();
  if (!script) return false;
  return !/no test specified/i.test(script);
}

export function changedRequiredVerificationScript(baseline: Record<string, string>, candidate: Record<string, string>): string | null {
  const original = packageJson(baseline)?.scripts || {};
  const proposed = packageJson(candidate)?.scripts || {};
  return ['typecheck', 'test', 'build'].find(name =>
    meaningfulScript(original[name]) && original[name] !== proposed[name],
  ) || null;
}

export function qirRuntimeCommandPlan(vfs: Record<string, string>): string[] {
  const pkg = packageJson(vfs);
  if (!pkg) return [];
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};

  let install = 'npm install --no-audit --no-fund';
  let run = (name: string) => `npm run ${name}`;
  if (vfs['pnpm-lock.yaml']) {
    install = 'corepack pnpm install --frozen-lockfile';
    run = (name: string) => `corepack pnpm run ${name}`;
  } else if (vfs['yarn.lock']) {
    install = 'corepack yarn install --frozen-lockfile';
    run = (name: string) => `corepack yarn run ${name}`;
  } else if (vfs['package-lock.json'] || vfs['npm-shrinkwrap.json']) {
    install = 'npm ci --no-audit --no-fund';
  }

  const checks = ['typecheck', 'test', 'build']
    .filter((name) => meaningfulScript(scripts[name]))
    .map((name) => `CI=1 ${run(name)}`);
  return checks.length ? [install, ...checks] : [];
}

function truncateOutput(value: string): { output: string; outputTruncated: boolean } {
  const text = String(value || '');
  if (text.length <= MAX_OUTPUT_CHARS) return { output: text, outputTruncated: false };
  return { output: text.slice(0, MAX_OUTPUT_CHARS), outputTruncated: true };
}

function failureCodeForCommand(command: string): QirFailureCode {
  return /(?:typecheck|build)/i.test(command) ? 'COMPILE_FAILURE' : 'RUNTIME_FAILURE';
}

function candidateFiles(vfs: Record<string, string>):
  | { ok: true; files: Array<{ path: string; content: Buffer }> }
  | { ok: false; reason: string } {
  const files: Array<{ path: string; content: Buffer }> = [];
  let totalBytes = 0;
  for (const [rawPath, rawContent] of Object.entries(vfs || {})) {
    const path = safePath(rawPath);
    if (!path) return { ok: false, reason: `Unsafe candidate path: ${String(rawPath).slice(0, 160)}` };
    if (SKIP_PATH.test(path)) continue;
    const content = Buffer.from(String(rawContent ?? ''), 'utf8');
    if (content.byteLength > MAX_FILE_BYTES) {
      return { ok: false, reason: `Candidate file is too large for runtime verification: ${path}` };
    }
    totalBytes += content.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { ok: false, reason: 'Candidate workspace is too large for bounded runtime verification.' };
    }
    files.push({ path, content });
    if (files.length > MAX_FILES) {
      return { ok: false, reason: 'Candidate workspace has too many files for bounded runtime verification.' };
    }
  }
  return { ok: true, files };
}

export async function verifyQirRepositoryRuntime(
  input: { vfs: Record<string, string>; signal?: AbortSignal },
  options: RuntimeOptions = {},
): Promise<QirRepositoryRuntimeResult> {
  const commands = qirRuntimeCommandPlan(input.vfs);
  if (input.signal?.aborted) {
    return { status: 'unavailable', reason: 'Worker ownership was lost before repository execution.', commands };
  }
  if (!commands.length) {
    return { status: 'skipped', reason: 'No supported package.json verification scripts were found.', commands };
  }

  const prepared = candidateFiles(input.vfs);
  if (prepared.ok === false) {
    return {
      status: 'failed',
      reason: prepared.reason,
      failureCode: 'ARTIFACT_INVALID',
      command: null,
      exitCode: null,
      output: '',
      commands,
      results: [],
    };
  }

  const credentials = options.credentials === undefined
    ? (options.resolveCredentials || resolveSandboxCredentials)()
    : options.credentials;
  // Deployed workers use the SDK's short-lived OIDC identity. Explicit test or
  // operator credential overrides still fail closed when null.
  const automaticOidc = options.credentials === undefined && !options.resolveCredentials
    && process.env.VERCEL === '1' && Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
  if (!credentials && !automaticOidc) {
    return {
      status: 'skipped',
      reason: 'Vercel Sandbox credentials are not configured; no real repository command was executed.',
      commands,
    };
  }

  const factory = options.sandboxFactory || createRealSandbox;
  let sandbox: SandboxHandle | null = null;
  let stopping: Promise<void> | null = null;
  const stopSandbox = () => {
    if (sandbox && !stopping) stopping = sandbox.stop().catch(() => {});
    return stopping;
  };
  const abortExecution = () => { void stopSandbox(); };
  const results: QirRuntimeCommandEvidence[] = [];
  try {
    input.signal?.addEventListener('abort', abortExecution, { once: true });
    sandbox = await factory({
      timeout: SANDBOX_WALL_CLOCK_MS,
      resources: { vcpus: 2 },
      token: credentials?.token,
      teamId: credentials?.teamId,
      projectId: credentials?.projectId,
    });
    input.signal?.throwIfAborted();
    if (typeof sandbox.writeFiles !== 'function') {
      return { status: 'unavailable', reason: 'The configured sandbox cannot write the durable candidate workspace.', commands };
    }
    await sandbox.writeFiles(prepared.files);
    input.signal?.throwIfAborted();

    for (const command of commands) {
      input.signal?.throwIfAborted();
      const finished = await sandbox.runCommand({
        cmd: 'bash',
        args: ['-lc', command],
        timeoutMs: COMMAND_TIMEOUT_MS,
      });
      input.signal?.throwIfAborted();
      const raw = await finished.output('both');
      input.signal?.throwIfAborted();
      const truncated = truncateOutput(raw);
      const evidence: QirRuntimeCommandEvidence = {
        command,
        exitCode: finished.exitCode,
        output: truncated.output,
        outputTruncated: truncated.outputTruncated,
      };
      results.push(evidence);
      if (finished.exitCode !== 0) {
        return {
          status: 'failed',
          reason: `Real repository command failed: ${command} (exit ${finished.exitCode}).`,
          failureCode: failureCodeForCommand(command),
          command,
          exitCode: finished.exitCode,
          output: truncated.output,
          commands,
          results,
        };
      }
    }
    return { status: 'passed', commands, results };
  } catch (error) {
    if (input.signal?.aborted) {
      return { status: 'unavailable', reason: 'Worker ownership was lost during repository execution.', commands };
    }
    const detail = error instanceof Error ? error.message : String(error || 'unknown sandbox error');
    return { status: 'unavailable', reason: `Real repository execution could not run: ${detail}`.slice(0, 500), commands };
  } finally {
    input.signal?.removeEventListener('abort', abortExecution);
    await stopSandbox();
  }
}
