/**
 * Vercel tools the MODEL can call — read-only, on the same platform token
 * `vercel-web-analytics.ts` already uses.
 *
 * WHY THIS EXISTS
 *
 * A user asking "why did my Vercel build fail?" got a guess: the model had no
 * way to see a deployment's state, its error, or its build log, so it produced
 * plausible-sounding file names and commit counts instead of reading what
 * actually happened. That is the same failure this repo's own doctrine names
 * for `search_hotels` — an unread gap filled with an invention the user reads
 * as fact.
 *
 * READ-ONLY, DELIBERATELY, IN THIS FIRST SLICE
 *
 * Every tool here reads. None redeploys, cancels, or changes a project. A
 * write (opening a fix as a pull request) is a different product decision with
 * its own consent step and lands separately — mirroring `github-agent-tools.ts`.
 *
 * WHAT AUTHORIZES THESE
 *
 * The platform's own shared Vercel token, resolved once by the caller and
 * passed in as `vercelToken`. Unlike GitHub's per-user connection, this is
 * one account's credential: it can only see deployments that account's token
 * can see, which is why every tool takes the project explicitly rather than
 * assuming Quantora's own.
 */
import {
  getDeployment,
  getDeploymentBuildLog,
  listDeployments,
} from "./vercel-deployments.js";
import type { FetchLike } from "./vercel-deployments.js";

/**
 * Tools are offered only when the platform's Vercel token is actually
 * configured. A model holding a tool that always fails starts explaining that
 * failure to the user as though it were a fact about their deployment.
 */
export function shouldEnableVercelTools(input: { vercelConfigured?: boolean } = {}): boolean {
  return input.vercelConfigured === true;
}
/*
 * DESCRIPTIONS ARE PROMISES — see github-agent-tools.ts for the incident this
 * rule closes. `vercel-tool-promise.test.ts` checks these strings against the
 * shapes the executor really returns.
 */
export const vercelFunctionDeclarations: any[] = [
  {
    name: "list_vercel_deployments",
    description:
      "List recent Vercel deployments for one project on Quantora's connected Vercel account. Use this to find a deployment when the user has not given its ID. Returns for each: deployment ID, URL, state (READY, ERROR, BUILDING, QUEUED, CANCELED, or UNKNOWN), target (production or preview, when known), and creation time. Does NOT return the build log, the failure reason, or the git commit — call read_vercel_deployment for those. This tool only reads; it cannot redeploy, cancel, or change anything.",
    parameters: {
      type: "object",
      properties: {
        project: { type: "string", description: "The Vercel project name or ID." },
        teamId: { type: "string", description: "Optional Vercel team ID, if the project belongs to a team." },
        target: { type: "string", description: "Optional filter: 'production' or 'preview'." },
        limit: { type: "number", description: "Max deployments to return, 1 to 50. Defaults to 10." },
      },
      required: ["project"],
    },
  },
  {
    name: "read_vercel_deployment",
    description:
      "Read one Vercel deployment's status and build log. REQUIRED before explaining why a Vercel build or deployment failed — never guess the cause from a file name or a hunch. Returns: state, target, git branch and commit SHA when known, errorMessage and errorCode when the deployment failed, and up to 400 recent build log lines with a truncated flag if more exist. Pass onlyErrors:true to receive only log lines that look like errors or failures instead of the full recent log. Does NOT return runtime/function logs from AFTER a successful deploy — only the BUILD log. This tool only reads; it cannot redeploy, cancel, or change anything.",
    parameters: {
      type: "object",
      properties: {
        deploymentId: { type: "string", description: "The Vercel deployment ID, from list_vercel_deployments." },
        teamId: { type: "string", description: "Optional Vercel team ID, if the project belongs to a team." },
        onlyErrors: { type: "boolean", description: "If true, only return build log lines that look like errors or failures. Defaults to false." },
      },
      required: ["deploymentId"],
    },
  },
];

/**
 * A failure the MODEL reads, and therefore a failure the USER reads. Names
 * what was attempted and what Vercel said, and never softens a refusal into
 * something that sounds like a clean deploy.
 */
function toolFailure(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error || "unknown error");
  return {
    ok: false,
    status: "failed",
    action,
    error: detail,
    note: "This is a failure to READ, not a statement about the deployment. Do not describe the build as passing, failing, or unchanged on the strength of it.",
  };
}

export async function executeVercelToolCall(
  name: string,
  args: any,
  context: { vercelToken: string | null; fetchImpl?: FetchLike },
): Promise<any> {
  const token = context?.vercelToken || null;
  if (!token) {
    // Reached only if the enable-gate and the call-site guard both let this
    // through. Fails closed and says the actionable thing.
    return {
      ok: false,
      status: "not_connected",
      error: "Vercel diagnostics are not configured on this platform.",
      note: "Tell the user Vercel build diagnostics are unavailable right now; do not guess at a deployment's status.",
    };
  }

  const fetchImpl = context?.fetchImpl;

  try {
    switch (name) {
      case "list_vercel_deployments": {
        const project = String(args?.project || "").trim();
        if (!project) throw new Error("project is required.");
        const deployments = await listDeployments({
          token,
          project,
          teamId: typeof args?.teamId === "string" ? args.teamId : undefined,
          target: typeof args?.target === "string" ? args.target : undefined,
          limit: Number(args?.limit) || undefined,
          fetchImpl,
        });
        return { ok: true, status: "read", count: deployments.length, deployments };
      }

      case "read_vercel_deployment": {
        const deploymentId = String(args?.deploymentId || "").trim();
        if (!deploymentId) throw new Error("deploymentId is required.");
        const teamId = typeof args?.teamId === "string" ? args.teamId : undefined;
        const onlyErrors = args?.onlyErrors === true;

        const deployment = await getDeployment({ token, deploymentId, teamId, fetchImpl });
        // A build log read that fails (e.g. no build step for a static
        // deployment) must not sink the whole call: the deployment's own
        // state and error are still real answers on their own.
        const buildLog = await getDeploymentBuildLog({ token, deploymentId, teamId, onlyErrors, fetchImpl }).catch(
          () => ({ lines: [] as string[], truncated: false }),
        );

        return {
          ok: true,
          status: "read",
          deployment,
          buildLog: buildLog.lines,
          buildLogTruncated: buildLog.truncated,
        };
      }

      default:
        return toolFailure(name, new Error(`${name} is not a Vercel tool Quantora serves.`));
    }
  } catch (error) {
    return toolFailure(name, error);
  }
}
