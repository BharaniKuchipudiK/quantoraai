import { runQirServerModel, type QirServerModelRunner } from './qir-server-model.js';
import { changedIndependentVerificationFile, changedRequiredVerificationScript } from './qir-repository-runtime.js';
import { parseVFSWithReport } from '../../src/lib/vfs-parser.js';
import { hashVfsContent, vfsFileText } from '../../src/lib/desk-checkpoints.js';

const MAX_SOURCE_CHARS = 70_000;
const MAX_FILE_CHARS = 14_000;

export type CodingCiRepairResult =
  | { status: 'repaired'; vfs: Record<string, string>; detail: string; provider: string; modelId: string }
  | { status: 'failed'; detail: string };

function normalizedVfs(vfs: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, value] of Object.entries(vfs || {})) {
    const text = vfsFileText(value);
    if (text !== null) out[path] = text;
  }
  return out;
}

function promptForRepair(input: {
  vfs: Record<string, string>;
  objective: string;
  ciDetail: string;
  attempt: number;
}): string {
  let used = 0;
  const files: string[] = [];
  for (const path of Object.keys(input.vfs).sort()) {
    const content = String(input.vfs[path] || '').slice(0, MAX_FILE_CHARS);
    if (!content || used + content.length > MAX_SOURCE_CHARS) continue;
    used += content.length;
    files.push(`FILE: ${path}\n${content}`);
  }
  return [
    'You are Quantora Coding Delivery Repair running after GitHub CI failed.',
    'Repair the implementation using the concrete CI evidence below.',
    'Return ONLY changed/new workspace files using fenced code blocks with filepath="path/to/file" attributes.',
    'Do not weaken, edit, delete, rename, or bypass existing tests, specs, snapshots, test-runner configuration, or package verification scripts.',
    'Preserve all correct changes already present. Make the smallest coherent repair that addresses the CI evidence.',
    `OBJECTIVE:\n${input.objective}`,
    `CI REPAIR ATTEMPT: ${input.attempt}`,
    `CI FAILURE EVIDENCE:\n${input.ciDetail.slice(0, 8_000)}`,
    `CURRENT WORKSPACE:\n${files.join('\n\n---\n\n')}`,
  ].join('\n\n');
}

/**
 * Produce a repaired candidate from CI evidence without giving the model any
 * authority to change the independent judge. The caller MUST run the real
 * repository verifier after this returns and before pushing the repaired head.
 */
export async function repairCodingCandidateFromCi(
  input: {
    vfs: Record<string, unknown>;
    objective: string;
    ciDetail: string;
    attempt: number;
    signal?: AbortSignal;
  },
  options: { modelId?: string; modelRunner?: QirServerModelRunner } = {},
): Promise<CodingCiRepairResult> {
  const currentVfs = normalizedVfs(input.vfs);
  if (!Object.keys(currentVfs).length) return { status: 'failed', detail: 'No workspace files were available to repair.' };
  if (!String(input.ciDetail || '').trim()) return { status: 'failed', detail: 'CI failed without concrete evidence; refusing blind repair.' };

  const modelId = String(options.modelId || process.env.QIR_WORKER_MODEL || 'gemini-flash-latest').trim();
  const modelRunner = options.modelRunner || runQirServerModel;
  const model = await modelRunner({
    modelId,
    prompt: promptForRepair({
      vfs: currentVfs,
      objective: String(input.objective || 'Repair the failed delivery.').trim(),
      ciDetail: String(input.ciDetail),
      attempt: Math.max(1, Math.floor(Number(input.attempt) || 1)),
    }),
    timeoutMs: 90_000,
    signal: input.signal,
  });
  if (model.status === 'failure') {
    return {
      status: 'failed',
      detail: `CI repair model failed: ${String(model.failure.providerMessage || model.failure.providerCode || 'provider failure').slice(0, 500)}`,
    };
  }

  const parsed = parseVFSWithReport(model.text, currentVfs);
  const nextVfs = normalizedVfs(parsed.vfs || {});
  if (!Object.keys(nextVfs).length || hashVfsContent(nextVfs) === hashVfsContent(currentVfs)) {
    return { status: 'failed', detail: 'CI repair produced no material workspace change.' };
  }

  const changedScript = changedRequiredVerificationScript(currentVfs, nextVfs);
  if (changedScript) {
    return { status: 'failed', detail: `CI repair attempted to change protected package verification script: ${changedScript}.` };
  }
  const changedJudge = changedIndependentVerificationFile(currentVfs, nextVfs);
  if (changedJudge) {
    return { status: 'failed', detail: `CI repair attempted to change protected independent verification file: ${changedJudge}.` };
  }

  return {
    status: 'repaired',
    vfs: nextVfs,
    detail: `CI repair produced a new candidate using ${model.provider}/${model.modelId}; repository verification is required before push.`,
    provider: model.provider,
    modelId: model.modelId,
  };
}
