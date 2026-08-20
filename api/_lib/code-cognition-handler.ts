import { isRateLimited, isRateLimitedDurable } from './rate-limit.js';
import { inferCodeProjectCognition, type CodeProjectFile } from './code-project-cognition.js';
import { chooseCodeRuntime } from './code-runtime-broker.js';
import { defaultCodeRepairPolicy } from './code-self-heal.js';

const MAX_FILES = 80;
const MAX_FILE_CHARS = 120_000;
const MAX_TOTAL_CHARS = 600_000;
const REQUESTS_PER_MINUTE = 30;

function normalizeFiles(value: unknown): CodeProjectFile[] {
  if (!Array.isArray(value)) return [];
  const files: CodeProjectFile[] = [];
  let total = 0;

  for (const raw of value.slice(0, MAX_FILES)) {
    if (!raw || typeof raw !== 'object') continue;
    const path = String((raw as any).path || '').trim();
    const content = String((raw as any).content || '');
    if (!path || content.length > MAX_FILE_CHARS) continue;
    total += content.length;
    if (total > MAX_TOTAL_CHARS) break;
    files.push({
      path,
      content,
      language: typeof (raw as any).language === 'string' ? (raw as any).language : undefined,
    });
  }

  return files;
}

export async function handleCodeCognitionRequest(input: {
  req: any;
  res: any;
  userSub: string;
}) {
  const { req, res, userSub } = input;
  const limitKey = `code-cognition:user:${userSub}`;
  if (isRateLimited(limitKey, REQUESTS_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: 'Too many code cognition requests. Please wait a minute.' });
  }
  const durable = await isRateLimitedDurable(limitKey, REQUESTS_PER_MINUTE, 60);
  if (durable.limited) return res.status(429).json({ error: 'Too many code cognition requests. Please wait a minute.' });

  const files = normalizeFiles(req.body?.files);
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.slice(0, 20_000) : '';
  const projectName = typeof req.body?.projectName === 'string' ? req.body.projectName.slice(0, 200) : '';

  const cognition = inferCodeProjectCognition({ files, prompt, projectName });
  const runtime = chooseCodeRuntime({ cognition });
  const repairPolicy = defaultCodeRepairPolicy({ cognition, autoHeal: req.body?.autoHeal !== false });

  return res.status(200).json({
    cognition,
    runtime,
    repairPolicy: {
      maxAttempts: repairPolicy.maxAttempts,
      autoHeal: repairPolicy.autoHeal,
      requireReviewableDiff: repairPolicy.requireReviewableDiff,
      requireVerification: repairPolicy.requireVerification,
      keepDiagnosticsVisible: repairPolicy.keepDiagnosticsVisible,
      qualityRules: repairPolicy.qualityRules,
    },
  });
}
