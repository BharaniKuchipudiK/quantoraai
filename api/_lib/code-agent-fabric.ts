import type { CodeProjectCognition, CodeProjectFile } from './code-project-cognition.js';
import type { CodeRuntimeDecision } from './code-runtime-broker.js';
import type { CodeDiagnostic, CodeVerificationEvidence } from './code-self-heal.js';

export const CODE_AGENT_FABRIC_VERSION = 'code-agent-fabric-2026-08-20.1';

export type CodeAgentKind = 'quantora-native' | 'opencode' | 'factory-droid' | 'custom';
export type CodeAgentOperation = 'understand' | 'plan' | 'review' | 'edit' | 'repair' | 'execute' | 'verify' | 'explain';
export type CodeAgentCapability =
  | 'repository_read'
  | 'repository_search'
  | 'architecture_reasoning'
  | 'multi_file_edit'
  | 'diagnostics'
  | 'command_execution'
  | 'test_execution'
  | 'preview_verification'
  | 'diff_explanation';

export type CodeWorkspaceSnapshot = {
  id: string;
  projectName: string;
  objective: string;
  cognition: CodeProjectCognition;
  runtime: CodeRuntimeDecision;
  files: CodeProjectFile[];
  diagnostics: CodeDiagnostic[];
  checkpointId?: string | null;
};

export type CodeAgentTask = {
  id: string;
  operation: CodeAgentOperation;
  objective: string;
  requiredCapabilities: CodeAgentCapability[];
  dependsOn: string[];
  mutation: boolean;
  requiresVerification: boolean;
};

export type CodeAgentPlan = {
  version: string;
  tasks: CodeAgentTask[];
  finalTaskId: string | null;
  requiresCheckpoint: boolean;
  requiresVerification: boolean;
};

export type CodeAgentPatch = {
  path: string;
  content: string;
  reason: string;
};

export type CodeAgentCommand = {
  command: string;
  cwd?: string | null;
  purpose: string;
};

export type CodeAgentResult = {
  status: 'success' | 'failure' | 'blocked';
  summary?: string | null;
  patches?: CodeAgentPatch[];
  commands?: CodeAgentCommand[];
  diagnostics?: CodeDiagnostic[];
  verification?: CodeVerificationEvidence | null;
  architectureNotes?: string[];
  explanation?: string | null;
  provider?: string | null;
  model?: string | null;
  error?: string | null;
};

export type CodeAgentContext = {
  plan: CodeAgentPlan;
  task: CodeAgentTask;
  workspace: CodeWorkspaceSnapshot;
  priorResults: Record<string, CodeAgentResult>;
};

export type CodeAgentAdapter = {
  id: string;
  kind: CodeAgentKind;
  priority?: number;
  capabilities: CodeAgentCapability[];
  isAvailable?: () => boolean | Promise<boolean>;
  invoke: (context: CodeAgentContext) => Promise<CodeAgentResult>;
};

const OPERATION_CAPABILITIES: Record<CodeAgentOperation, CodeAgentCapability[]> = {
  understand: ['repository_read', 'repository_search', 'architecture_reasoning'],
  plan: ['repository_read', 'repository_search', 'architecture_reasoning'],
  review: ['repository_read', 'repository_search', 'architecture_reasoning', 'diagnostics'],
  edit: ['repository_read', 'repository_search', 'multi_file_edit'],
  repair: ['repository_read', 'repository_search', 'diagnostics', 'multi_file_edit'],
  execute: ['command_execution'],
  verify: ['diagnostics', 'test_execution', 'preview_verification'],
  explain: ['repository_read', 'diff_explanation'],
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function task(
  id: string,
  operation: CodeAgentOperation,
  objective: string,
  dependsOn: string[] = [],
): CodeAgentTask {
  const mutation = operation === 'edit' || operation === 'repair' || operation === 'execute';
  return {
    id,
    operation,
    objective: objective.trim().slice(0, 1200),
    requiredCapabilities: OPERATION_CAPABILITIES[operation],
    dependsOn,
    mutation,
    requiresVerification: mutation || operation === 'verify',
  };
}

export function buildCodeAgentPlan(input: {
  operation: Exclude<CodeAgentOperation, 'understand' | 'plan' | 'execute' | 'verify'>;
  objective: string;
  workspace: CodeWorkspaceSnapshot;
}): CodeAgentPlan {
  const objective = input.objective || input.workspace.objective;
  const tasks: CodeAgentTask[] = [];

  tasks.push(task('understand', 'understand', `Understand the repository, its purpose, architecture and constraints before acting. Project objective: ${objective}`));

  if (input.operation === 'review') {
    tasks.push(task('review', 'review', `Review the project against its intended purpose. Prioritize correctness, maintainability, security, efficiency and architectural fit.`, ['understand']));
    return {
      version: CODE_AGENT_FABRIC_VERSION,
      tasks,
      finalTaskId: 'review',
      requiresCheckpoint: false,
      requiresVerification: false,
    };
  }

  if (input.operation === 'explain') {
    tasks.push(task('explain', 'explain', `Explain the relevant code and engineering trade-offs in terms of the user's project objective.`, ['understand']));
    return {
      version: CODE_AGENT_FABRIC_VERSION,
      tasks,
      finalTaskId: 'explain',
      requiresCheckpoint: false,
      requiresVerification: false,
    };
  }

  const mutatingOperation = input.operation === 'repair' ? 'repair' : 'edit';
  tasks.push(task('plan', 'plan', `Prepare the smallest coherent engineering plan needed to achieve: ${objective}`, ['understand']));
  tasks.push(task(mutatingOperation, mutatingOperation, input.operation === 'repair'
    ? `Repair the root cause of the current diagnostics using the smallest architecture-consistent patch.`
    : `Implement the requested change using targeted, architecture-consistent edits.`, ['plan']));
  tasks.push(task('execute', 'execute', `Run the smallest useful build, test or reproduction commands that exercise the changed behavior.`, [mutatingOperation]));
  tasks.push(task('verify', 'verify', `Verify the requested outcome with execution evidence. Do not infer success from code appearance alone.`, ['execute']));

  return {
    version: CODE_AGENT_FABRIC_VERSION,
    tasks,
    finalTaskId: 'verify',
    requiresCheckpoint: true,
    requiresVerification: true,
  };
}

function hasCapabilities(adapter: CodeAgentAdapter, required: CodeAgentCapability[]): boolean {
  return required.every((capability) => adapter.capabilities.includes(capability));
}

export class CodeAgentRegistry {
  private adapters = new Map<string, CodeAgentAdapter>();

  register(adapter: CodeAgentAdapter): void {
    if (!adapter?.id) throw new Error('Code agent adapter id is required.');
    if (!Array.isArray(adapter.capabilities) || !adapter.capabilities.length) {
      throw new Error(`Code agent adapter ${adapter.id} must declare capabilities.`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  remove(id: string): void {
    this.adapters.delete(id);
  }

  list(): CodeAgentAdapter[] {
    return [...this.adapters.values()].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  async select(required: CodeAgentCapability[], exclude: string[] = []): Promise<CodeAgentAdapter | null> {
    for (const adapter of this.list()) {
      if (exclude.includes(adapter.id) || !hasCapabilities(adapter, required)) continue;
      if (adapter.isAvailable && !(await adapter.isAvailable())) continue;
      return adapter;
    }
    return null;
  }
}

const MAX_PATCH_FILES = 30;
const MAX_PATCH_CONTENT_CHARS = 1_500_000;
const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\0)[^\r\n]+$/;

export function validateCodeAgentResult(input: {
  task: CodeAgentTask;
  result: CodeAgentResult;
}): { ok: boolean; issues: string[] } {
  const { task, result } = input;
  const issues: string[] = [];

  if (!['success', 'failure', 'blocked'].includes(result.status)) issues.push('Invalid agent result status.');

  const patches = result.patches || [];
  if (!task.mutation && patches.length) issues.push(`Non-mutating ${task.operation} task returned file patches.`);
  if (patches.length > MAX_PATCH_FILES) issues.push(`Agent returned more than ${MAX_PATCH_FILES} changed files in one step.`);

  let patchChars = 0;
  for (const patch of patches) {
    if (!SAFE_RELATIVE_PATH.test(String(patch.path || ''))) issues.push(`Unsafe patch path: ${patch.path || '(empty)'}.`);
    patchChars += String(patch.content || '').length;
    if (!String(patch.reason || '').trim()) issues.push(`Patch ${patch.path || '(unknown)'} is missing an engineering reason.`);
  }
  if (patchChars > MAX_PATCH_CONTENT_CHARS) issues.push('Agent patch payload exceeds the bounded workspace mutation budget.');

  for (const command of result.commands || []) {
    if (!task.mutation && task.operation !== 'verify') issues.push(`Non-execution ${task.operation} task returned shell commands.`);
    if (!String(command.command || '').trim()) issues.push('Agent returned an empty command.');
    if (!String(command.purpose || '').trim()) issues.push('Agent command is missing a purpose.');
  }

  if (task.operation === 'verify' && result.status === 'success') {
    const evidence = result.verification;
    const hasPositiveEvidence = Boolean(
      evidence?.buildPassed === true
      || evidence?.testsPassed === true
      || evidence?.previewLoaded === true
      || evidence?.runtimeClean === true
      || evidence?.lintPassed === true
    );
    if (!hasPositiveEvidence) issues.push('Verification task claimed success without positive execution evidence.');
    if (evidence?.buildPassed === false || evidence?.testsPassed === false || evidence?.previewLoaded === false || evidence?.runtimeClean === false || evidence?.lintPassed === false) {
      issues.push('Verification task claimed success while evidence contains a failing signal.');
    }
  }

  return { ok: issues.length === 0, issues };
}

export type CodeAgentRunResult = {
  status: 'complete' | 'failed' | 'blocked';
  plan: CodeAgentPlan;
  results: Record<string, CodeAgentResult>;
  adapterTrace: Record<string, string[]>;
  failedTaskId?: string | null;
  reason?: string | null;
};

export async function runCodeAgentPlan(input: {
  plan: CodeAgentPlan;
  workspace: CodeWorkspaceSnapshot;
  registry: CodeAgentRegistry;
  authorizeTask?: (task: CodeAgentTask) => boolean | Promise<boolean>;
}): Promise<CodeAgentRunResult> {
  const results: Record<string, CodeAgentResult> = {};
  const adapterTrace: Record<string, string[]> = {};

  for (const current of input.plan.tasks) {
    if (current.dependsOn.some((dependency) => results[dependency]?.status !== 'success')) {
      return { status: 'blocked', plan: input.plan, results, adapterTrace, failedTaskId: current.id, reason: 'dependency_not_satisfied' };
    }

    if (input.authorizeTask && !(await input.authorizeTask(current))) {
      return { status: 'blocked', plan: input.plan, results, adapterTrace, failedTaskId: current.id, reason: 'task_not_authorized' };
    }

    const attempted: string[] = [];
    let completed = false;

    while (!completed) {
      const adapter = await input.registry.select(current.requiredCapabilities, attempted);
      if (!adapter) {
        return { status: 'failed', plan: input.plan, results, adapterTrace, failedTaskId: current.id, reason: 'no_capable_code_agent' };
      }
      attempted.push(adapter.id);
      adapterTrace[current.id] = [...attempted];

      try {
        const raw = await adapter.invoke({
          plan: input.plan,
          task: current,
          workspace: input.workspace,
          priorResults: results,
        });
        const validation = validateCodeAgentResult({ task: current, result: raw });
        if (!validation.ok) {
          results[current.id] = { status: 'failure', error: validation.issues.join(' '), provider: adapter.id };
          continue;
        }
        results[current.id] = { ...raw, provider: raw.provider || adapter.id };
        if (raw.status !== 'success') {
          if (raw.status === 'blocked') {
            return { status: 'blocked', plan: input.plan, results, adapterTrace, failedTaskId: current.id, reason: raw.error || 'adapter_blocked' };
          }
          continue;
        }
        completed = true;
      } catch (error: any) {
        results[current.id] = { status: 'failure', error: error?.message || 'Code agent failed.', provider: adapter.id };
      }
    }
  }

  return { status: 'complete', plan: input.plan, results, adapterTrace };
}

export function publicCodeAgentPlan(plan: CodeAgentPlan) {
  return {
    version: plan.version,
    tasks: plan.tasks.map((item) => ({
      id: item.id,
      operation: item.operation,
      objective: item.objective,
      mutation: item.mutation,
      requiresVerification: item.requiresVerification,
    })),
    requiresCheckpoint: plan.requiresCheckpoint,
    requiresVerification: plan.requiresVerification,
  };
}
