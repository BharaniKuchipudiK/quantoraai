/**
 * The one place this platform imports `@vercel/sandbox` directly. Chat tools
 * may provide a Git source; QIR may instead create a clean microVM and write
 * its exact durable candidate workspace into it before executing checks.
 */
import { Sandbox } from "@vercel/sandbox";
import type { SandboxFactory, SandboxHandle } from "./sandbox-agent-tools.js";

export const createRealSandbox: SandboxFactory = async (params) => {
  const sandbox = await Sandbox.create({
    ...(params.source ? { source: params.source } : {}),
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
    async writeFiles(files) {
      await (sandbox as any).writeFiles(files);
    },
    async stop() {
      await sandbox.stop();
    },
  };
  return handle;
};
