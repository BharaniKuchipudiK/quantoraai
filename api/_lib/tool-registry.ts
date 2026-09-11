/**
 * THE TYPED TOOL REGISTRY — Phase 4, Universal Tool Fabric.
 *
 * WHAT WAS WRONG
 *
 * A capability's identity was spread across five places and none of them knew
 * about the others. To add `read_pull_request` you had to touch:
 *
 *   1. githubFunctionDeclarations   — what the model is told
 *   2. GITHUB_TOOL_NAMES            — a hand-kept parallel list of the same strings
 *   3. shouldEnableGithubTools      — when it may be offered
 *   4. an `enabledTools.push` block — a second `if` in the stream builder
 *   5. `if (isGithubCall) { … } else { … }` — the dispatch fork in chat-handler
 *
 * Five edits, in three files, for one tool. The roadmap's requirement for this
 * phase is the opposite: "Adding a capability must not require adding another
 * independent agent loop."
 *
 * A CORRECTION TO MY FIRST DRAFT OF THIS COMMENT. I wrote that (2) drifting
 * from (1) was a live bug — add a GitHub tool, forget the name set, and the
 * call falls into the TRAVEL executor, which answers "Unknown or disabled
 * travel tool: read_pull_request" and the model repeats that to the user as a
 * fact about their repository. The consequence is real, but the drift is
 * ALREADY gated: github-tool-promise.test.ts asserts the declared names and
 * GITHUB_TOOL_NAMES are the same set. Claiming a closed hole to justify this
 * file would be the kind of unearned claim §1 is about.
 *
 * WHAT IS ACTUALLY OPEN is the fork count, which is what the roadmap names.
 * Three places in chat-handler.ts asked "which family is this?" — the
 * declaration push, the call-site guard, the executor choice — and a third
 * family had to be added to all three plus threaded down as a third boolean.
 * Nothing gates that. The registry makes those three one lookup, and a family
 * that forgets to wire itself is now a tool nobody can be offered rather than
 * a tool dispatched to the wrong executor.
 *
 * WHAT THIS FILE CHANGES, AND WHAT IT DELIBERATELY DOES NOT
 *
 * It owns the four things that were duplicated: a tool's IDENTITY (name and
 * family), its DECLARATION to the model, its ENABLEMENT rule, and its DISPATCH.
 * One list; the name sets are derived from it, so they cannot drift.
 *
 * It does NOT own what the handler does with a result. Phase 4's own words are
 * "migrate existing capabilities behind it WITHOUT CHANGING their user-visible
 * behavior", and the travel path's post-processing — PAUSE_AND_ASK, the
 * auto-retry turn, shortlist extraction — is user-visible behaviour that has
 * been debugged into its present shape. So `execute` returns the family's raw
 * result untouched, alongside the SSE state the handler already sends for it.
 * The handler stops asking "is this GitHub?" to decide WHO RUNS IT; it keeps
 * reading the result to decide what to SAY.
 *
 * Normalising the two result protocols into one envelope is Phase 5's job
 * (Outcome Contracts), where the verifier evidence that would justify a
 * common `ok` actually exists. Doing it here would be a rewrite wearing a
 * migration's clothes.
 */

import {
  travelFunctionDeclarations,
  executeToolCall as executeTravelToolCall,
  shouldEnableTravelTools,
} from "./agent-tools.js";
import {
  githubFunctionDeclarations,
  executeGithubToolCall,
  shouldEnableGithubTools,
} from "./github-agent-tools.js";
import {
  githubWriteFunctionDeclarations,
  executeGithubWriteToolCall,
  shouldEnableGithubWriteTools,
} from "./github-write-agent-tools.js";
import type { GithubPrincipal } from "./github-principal.js";
import {
  vercelFunctionDeclarations,
  executeVercelToolCall,
  shouldEnableVercelTools,
} from "./vercel-agent-tools.js";

/** Everything an enablement rule or an executor is allowed to see. */
export interface QuantoraToolContext {
  /** The Studio/PCL domain resolved for this turn, if any. */
  studioDomain?: unknown;
  /** The signed-in user's GitHub principal, when they have connected one. */
  githubPrincipal?: GithubPrincipal | null;
  /**
   * Whether GitHub WRITE tools (push, open a pull request) may be offered
   * this turn. This IS the per-user opt-in (github_connections.auto_pr_enabled),
   * resolved once by the caller; kept independent of `githubPrincipal` so a
   * future policy can turn writes off without touching whether reads are
   * offered.
   */
  githubWriteToolsEnabled?: boolean;
  /** The platform's shared Vercel token (deploy:vercel), when configured. */
  vercelToken?: string | null;
  /** Whether the platform independently decided travel tools may run. */
  travelToolsPermitted?: boolean;
  /** Recent user turns, used by travel tools to resolve an implied location. */
  recentUserTexts?: string[];
  /** The current turn attempt, when the caller tracks one. */
  turnAttempt?: number | null;
  /**
   * Epoch ms after which no tool may still be running for this turn.
   *
   * Owned by the handler because only it knows when the request started. Absent
   * means "no turn deadline" — each call still gets its own ceiling below.
   */
  toolDeadlineAt?: number | null;
  /** Set by dispatchToolCall so an executor's provider calls die with it. */
  abortSignal?: AbortSignal;
}

/**
 * The SSE tool state the handler announces. These are the exact four strings
 * already on the wire; the registry classifies into them rather than inventing
 * a vocabulary the client does not speak.
 */
export type QuantoraToolState = "cleared" | "unavailable" | "waiting_for_user";

/**
 * Stream facts the classifier needs and only the handler owns.
 *
 * `committed` is why this is a parameter rather than a field: a travel tool
 * that wants an automatic retry turn can only get one while the response has
 * not started, so the same result is announced 'cleared' before commit and
 * 'waiting_for_user' after. The registry cannot see that and must not guess it.
 */
export interface QuantoraToolStreamState {
  committed: boolean;
}

export interface QuantoraToolInvocation {
  /** The family that actually ran it — for diagnosis, never for dispatch. */
  family: string;
  /** The family's own result, byte-for-byte. The handler reads this. */
  raw: any;
  /** What to announce over SSE for this result, given the stream's state. */
  classify(stream: QuantoraToolStreamState): QuantoraToolState;
}

export interface QuantoraToolDefinition {
  name: string;
  family: string;
  /**
   * The longest this ONE call may take, whatever its providers do internally.
   *
   * Families already time out their own provider requests; this is the ceiling
   * over the whole call, which those cannot give. read_pull_request makes three
   * SEQUENTIAL GitHub hops of up to GITHUB_TIMEOUT_MS each, so its own limits
   * bound a hop and not the tool.
   */
  budgetMs: number;
  /**
   * What this family says when the budget runs out, shaped like its own
   * results so the handler and the classifier need no special case. Each family
   * owns its wording for the same reason it owns its descriptions: the model
   * repeats this to the user.
   */
  expired(reason: string): any;
  /**
   * The declaration handed to the model, in that provider's dialect. Kept as
   * the family authored it: a tool description is a promise, and rewriting one
   * here to fit a schema is how a promise quietly changes.
   */
  declaration: any;
  /** May this tool be offered to the model on this turn? */
  isEnabled(context: QuantoraToolContext): boolean;
  execute(args: unknown, context: QuantoraToolContext): Promise<QuantoraToolInvocation>;
}

/**
 * Travel results carry `status` and `action`; the handler's existing branch
 * maps them to the SSE state below. This reproduces that mapping exactly — see
 * tool-registry.test.ts, which asserts it against the handler's own source.
 */
/**
 * Exported so the gate can measure THIS function rather than a restatement of
 * it. The first version of tool-registry.test.ts stubbed the executor and
 * asserted its own local copy of this mapping against its own expectations;
 * deleting `&& !stream.committed` below did not fail it. A gate that agrees
 * with itself is the §4 case — worse than no gate, because it is trusted.
 */
export function classifyTravelToolResult(result: any, stream: QuantoraToolStreamState): QuantoraToolState {
  if (result?.action === "PAUSE_AND_ASK") {
    const autoRetryTurn = result?.autoRetryTurn === true
      && result?.retryable === true
      && !stream.committed;
    if (autoRetryTurn) return "cleared";
    return result?.status === "unavailable" ? "unavailable" : "waiting_for_user";
  }
  return result?.status === "unavailable" ? "unavailable" : "cleared";
}

/** GitHub tools answer with an `ok` flag; that is the whole mapping. */
export function classifyGithubToolResult(result: any): QuantoraToolState {
  return result?.ok ? "cleared" : "unavailable";
}

/** GitHub write tools answer with an `ok` flag too; same mapping, same reason. */
export function classifyGithubWriteToolResult(result: any): QuantoraToolState {
  return result?.ok ? "cleared" : "unavailable";
}

/** Vercel tools answer with an `ok` flag too; same mapping, same reason. */
export function classifyVercelToolResult(result: any): QuantoraToolState {
  return result?.ok ? "cleared" : "unavailable";
}

/*
 * Travel providers are held to 6s per attempt, flights to two attempts with a
 * short backoff. 20s is that plus headroom for the second provider hop, not a
 * number chosen for roundness.
 */
const TRAVEL_TOOL_BUDGET_MS = 20_000;

/*
 * read_pull_request is three SEQUENTIAL GitHub hops — the PR, then a parallel
 * batch, then the checks — at GITHUB_TIMEOUT_MS (12s) each. 45s covers that
 * with headroom; it is deliberately not smaller, because cutting a legitimate
 * slow read short is its own wrong answer.
 */
const GITHUB_TOOL_BUDGET_MS = 45_000;

/*
 * push_files_to_repository makes up to PUSH_MAX_FILES+3 sequential GitHub
 * hops (ref read, tree read, one blob per file, tree write, commit write,
 * branch update) at GITHUB_TIMEOUT_MS each. A large push is a real slow
 * write, not a stuck one, so its budget is the longest here — long enough
 * that a legitimate multi-file commit is not cut off mid-write, which would
 * leave the branch in an unknown state the model would then have to guess
 * about.
 */
const GITHUB_WRITE_TOOL_BUDGET_MS = 60_000;

/*
 * read_vercel_deployment makes two Vercel hops (deployment detail, then build
 * log) that this file runs in parallel, not sequentially like GitHub's PR
 * read — so its budget does not need GitHub's multiplier. 20s matches the
 * travel budget: headroom for one slow provider hop plus a retry-shaped delay.
 */
const VERCEL_TOOL_BUDGET_MS = 20_000;

const TRAVEL_TOOLS: QuantoraToolDefinition[] = travelFunctionDeclarations.map((declaration) => ({
  name: String(declaration.name),
  family: "travel",
  declaration,
  budgetMs: TRAVEL_TOOL_BUDGET_MS,
  expired(reason: string) {
    return {
      status: "unavailable",
      executed: false,
      reason: "TOOL_BUDGET_EXHAUSTED",
      retryable: false,
      message: `The live travel lookup was stopped because ${reason}. Tell the user the provider did not answer in time and offer to try again; do not invent fares, availability or places.`,
    };
  },
  isEnabled(context) {
    /*
     * Two conditions, both already in the handler. shouldEnableTravelTools is
     * the domain rule; travelToolsPermitted is the handler's own late decision
     * (no key, deferred intake, no attempts left) which it has always been able
     * to revoke after the domain said yes.
     */
    if (context.travelToolsPermitted === false) return false;
    if (context.travelToolsPermitted === true) return true;
    return shouldEnableTravelTools(context.studioDomain);
  },
  async execute(args, context) {
    const hasTurnAttempt = typeof context.turnAttempt === "number";
    const raw = await executeTravelToolCall(this.name, args, {
      ...(context.recentUserTexts ? { recentUserTexts: context.recentUserTexts } : {}),
      ...(hasTurnAttempt ? { turnAttempt: context.turnAttempt as number } : {}),
      ...(context.abortSignal ? { fetchFn: budgetedFetch(context.abortSignal) } : {}),
    });
    return { family: "travel", raw, classify: (stream) => classifyTravelToolResult(raw, stream) };
  },
}));

const GITHUB_TOOLS: QuantoraToolDefinition[] = githubFunctionDeclarations.map((declaration) => ({
  name: String(declaration.name),
  family: "github",
  declaration,
  budgetMs: GITHUB_TOOL_BUDGET_MS,
  expired(reason: string) {
    return {
      ok: false,
      status: "timed_out",
      error: `GitHub did not answer in time — ${reason}.`,
      note: "Tell the user the read timed out and offer to try again. Do not describe the pull request, its CI or its reviews from memory; you did not read them.",
    };
  },
  isEnabled(context) {
    return shouldEnableGithubTools({ hasGithubConnection: Boolean(context.githubPrincipal) });
  },
  async execute(args, context) {
    const raw = await executeGithubToolCall(this.name, args, {
      principal: context.githubPrincipal || null,
      ...(context.abortSignal ? { fetchImpl: budgetedFetch(context.abortSignal) } : {}),
    });
    return { family: "github", raw, classify: () => classifyGithubToolResult(raw) };
  },
}));

const GITHUB_WRITE_TOOLS: QuantoraToolDefinition[] = githubWriteFunctionDeclarations.map((declaration) => ({
  name: String(declaration.name),
  family: "github_write",
  declaration,
  budgetMs: GITHUB_WRITE_TOOL_BUDGET_MS,
  expired(reason: string) {
    return {
      ok: false,
      status: "timed_out",
      error: `GitHub did not answer in time — ${reason}.`,
      note: "Tell the user the write timed out. Do not describe it as succeeded or failed, and do not invent a commit, branch or pull request — check by reading the repository or pull request before saying anything happened.",
    };
  },
  isEnabled(context) {
    return shouldEnableGithubWriteTools({
      hasGithubConnection: Boolean(context.githubPrincipal),
      autoPrOptedIn: context.githubWriteToolsEnabled === true,
    });
  },
  async execute(args, context) {
    const raw = await executeGithubWriteToolCall(this.name, args, {
      principal: context.githubPrincipal || null,
      ...(context.abortSignal ? { fetchImpl: budgetedFetch(context.abortSignal) } : {}),
    });
    return { family: "github_write", raw, classify: () => classifyGithubWriteToolResult(raw) };
  },
}));

const VERCEL_TOOLS: QuantoraToolDefinition[] = vercelFunctionDeclarations.map((declaration) => ({
  name: String(declaration.name),
  family: "vercel",
  declaration,
  budgetMs: VERCEL_TOOL_BUDGET_MS,
  expired(reason: string) {
    return {
      ok: false,
      status: "timed_out",
      error: `Vercel did not answer in time — ${reason}.`,
      note: "Tell the user the read timed out and offer to try again. Do not describe the deployment's state or build log from memory; you did not read it.",
    };
  },
  isEnabled(context) {
    return shouldEnableVercelTools({ vercelConfigured: Boolean(context.vercelToken) });
  },
  async execute(args, context) {
    const raw = await executeVercelToolCall(this.name, args, {
      vercelToken: context.vercelToken || null,
      ...(context.abortSignal ? { fetchImpl: budgetedFetch(context.abortSignal) } : {}),
    });
    return { family: "vercel", raw, classify: () => classifyVercelToolResult(raw) };
  },
}));

/**
 * THE registry. Every tool the model can be offered appears here exactly once.
 *
 * A name claimed by two families is a hard failure at module load rather than a
 * test failure, because the ambiguity is unresolvable at runtime: whichever
 * entry wins, one family's tool silently executes as another's, which is
 * precisely the drift this registry exists to make impossible.
 */
function buildRegistry(): Map<string, QuantoraToolDefinition> {
  const registry = new Map<string, QuantoraToolDefinition>();
  for (const tool of [...TRAVEL_TOOLS, ...GITHUB_TOOLS, ...GITHUB_WRITE_TOOLS, ...VERCEL_TOOLS]) {
    const existing = registry.get(tool.name);
    if (existing) {
      throw new Error(
        `Tool name "${tool.name}" is claimed by both the ${existing.family} and ${tool.family} families. `
        + "One of them would silently execute as the other.",
      );
    }
    registry.set(tool.name, tool);
  }
  return registry;
}

const REGISTRY = buildRegistry();

export function listRegisteredTools(): QuantoraToolDefinition[] {
  return [...REGISTRY.values()];
}

export function findRegisteredTool(name: unknown): QuantoraToolDefinition | null {
  return typeof name === "string" ? REGISTRY.get(name) || null : null;
}

/**
 * The declaration groups for a turn, one per family that has an enabled tool.
 *
 * Grouped rather than flattened for the reason the handler already gave: the
 * families are separate lists so "which family is this?" stays one lookup
 * instead of a string comparison in several places.
 */
export function enabledToolDeclarations(context: QuantoraToolContext): Array<{ functionDeclarations: any[] }> {
  const byFamily = new Map<string, any[]>();
  for (const tool of listRegisteredTools()) {
    if (!tool.isEnabled(context)) continue;
    const group = byFamily.get(tool.family) || [];
    group.push(tool.declaration);
    byFamily.set(tool.family, group);
  }
  return [...byFamily.values()]
    .filter((declarations) => declarations.length > 0)
    .map((functionDeclarations) => ({ functionDeclarations }));
}

/** Is this exact call legitimate on this turn? Unknown names are never legitimate. */
export function isToolCallPermitted(name: unknown, context: QuantoraToolContext): boolean {
  const tool = findRegisteredTool(name);
  return Boolean(tool && tool.isEnabled(context));
}

export type QuantoraToolDispatch =
  | { status: "ok"; invocation: QuantoraToolInvocation }
  | { status: "unknown-tool"; name: string };

/**
 * A fetch that also dies when the turn's tool budget does.
 *
 * Racing a promise does not stop the work behind it, so a raced-out call would
 * keep a GitHub read alive against the function's clock while the turn moved
 * on. Both families take an injectable fetch and pass an `init.signal`
 * through, so merging the budget's signal into it CANCELS the request rather
 * than merely ignoring it.
 */
export function budgetedFetch(signal: AbortSignal): any {
  return (url: any, init: any = {}) => {
    const merged = init?.signal
      ? (AbortSignal as any).any([init.signal, signal])
      : signal;
    return (globalThis.fetch as any)(url, { ...init, signal: merged });
  };
}

/**
 * The single dispatch. A caller never chooses an executor.
 *
 * An unregistered name is reported as unregistered rather than handed to some
 * family's executor to guess at, because a family's "unknown tool" message
 * names that family — and the model repeats it to the user as a fact.
 */
export async function dispatchToolCall(
  name: unknown,
  args: unknown,
  context: QuantoraToolContext,
): Promise<QuantoraToolDispatch> {
  const tool = findRegisteredTool(name);
  if (!tool) return { status: "unknown-tool", name: String(name) };

  /*
   * THE TURN'S TOOL CLOCK.
   *
   * api/pipeline.ts carries chat with maxDuration 180s and the agent loop takes
   * up to MAX_AGENT_STEPS calls. read_pull_request alone can spend ~36s (three
   * sequential GitHub hops at 12s each), so five of them reach 180s of tool
   * time before a single token of model inference — and the function is killed
   * mid-stream with nothing said to the user. A stream that dies silently is
   * the failure this platform is least allowed to have.
   *
   * So the budget is the smaller of this tool's own ceiling and whatever is
   * left of the turn. When it is gone the model is TOLD, in its own family's
   * words, and can say so; it is never left waiting on a call that will outlive
   * the response.
   */
  const remaining = typeof context.toolDeadlineAt === "number"
    ? context.toolDeadlineAt - Date.now()
    : Number.POSITIVE_INFINITY;
  if (remaining <= 0) {
    const raw = tool.expired("the turn's tool time was already spent before this call started");
    return { status: "ok", invocation: { family: tool.family, raw, classify: () => "unavailable" } };
  }
  const budgetMs = Math.min(tool.budgetMs, remaining);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  let expired = false;
  try {
    const raw = await Promise.race([
      tool.execute(args, { ...context, abortSignal: controller.signal }),
      new Promise<null>((resolve) => {
        controller.signal.addEventListener("abort", () => { expired = true; resolve(null); }, { once: true });
      }),
    ]);
    if (expired || !raw) {
      return {
        status: "ok",
        invocation: {
          family: tool.family,
          raw: tool.expired(`it did not finish within ${Math.round(budgetMs / 1000)}s`),
          classify: () => "unavailable",
        },
      };
    }
    return { status: "ok", invocation: raw };
  } finally {
    clearTimeout(timer);
  }
}
