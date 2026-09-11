/**
 * The one place this platform imports `@vercel/sandbox` directly. Kept
 * separate from `sandbox-agent-tools.ts` so that file's executor logic can be
 * tested against a fake `SandboxFactory` (see sandbox-agent-tools.test.ts)
 * without ever touching the real SDK or the network — the same separation
 * `github-actions.ts` already keeps from `github-agent-tools.ts`.
 *
 * STATED LIMITATION: this adapter has not been exercised against a real
 * Vercel Sandbox in this environment (no VERCEL_TEAM_ID/VERCEL_PROJECT_ID are
 * configured here). It is a direct, type-checked pass-through of the
 * `@vercel/sandbox` SDK's own documented `Sandbox.create`/`runCommand`/`stop`
 * shapes (verified by reading the SDK's own `.d.ts` files), not a live-tested
 * integration.
 */
import { Sandbox } from "@vercel/sandbox";
import type { SandboxFactory, SandboxHandle } from "./sandbox-agent-tools.js";

export const createRealSandbox: SandboxFactory = async (params) => {
  const sandbox = await Sandbox.create({
    source: params.source,
    timeout: params.timeout,
    resources: params.resources,
    token: params.token,
    teamId: params.teamId,
    projectId: params.projectId,
  } as Parameters<typeof Sandbox.create>[0]);

  const handle: SandboxHandle = {
    async runCommand(commandParams) {
      const finished = await sandbox.runCommand(commandParams);
      return {
        exitCode: finished.exitCode,
        output: (stream: "both") => finished.output(stream),
      } as { exitCode: number; output(stream: "both"): Promise<string> };
    },
    async stop() {
      await sandbox.stop();
    },
  };
  return handle;
};
