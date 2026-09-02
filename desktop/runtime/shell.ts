import { spawn } from "node:child_process";
import { DESK_COMMAND_TIMEOUT_MS, DESK_OUTPUT_MAX_BYTES, isValidDeskCommand } from "../../shared/desk-runtime-contract.js";
import { capOutput, defaultShell, stripAnsi } from "./workspace-policy.js";

/*
 * Run one desk command in the attached folder and collect its output.
 *
 * Same contract the WebContainer path returns ({ ok, output }), so the
 * terminal pane needs no branch. Real process, real exit code, real stderr
 * interleaved with stdout in arrival order. Output is plain text (ANSI
 * stripped) and capped to its tail. A command that stays silent longer than
 * the timeout is killed and says so — nothing here ever invents output.
 */

export type RunResult = { ok: boolean; output: string; exitCode: number | null };

export function runCollected(
  line: string,
  options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  if (!isValidDeskCommand(line)) {
    return Promise.resolve({ ok: false, output: "That is not a command this desk can run.", exitCode: null });
  }
  const shell = defaultShell();
  const timeoutMs = options.timeoutMs ?? DESK_COMMAND_TIMEOUT_MS;

  return new Promise((resolve) => {
    const child = spawn(shell.command, [...shell.args, line], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env, TERM: "dumb", NO_COLOR: "1", CI: process.env.CI || "" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let output = "";
    let timedOut = false;
    let timer = setTimeout(onTimeout, timeoutMs);

    function bump() {
      clearTimeout(timer);
      timer = setTimeout(onTimeout, timeoutMs);
    }
    function onTimeout() {
      timedOut = true;
      child.kill("SIGKILL");
    }
    const collect = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > DESK_OUTPUT_MAX_BYTES * 2) output = output.slice(-DESK_OUTPUT_MAX_BYTES);
      bump();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, output: `The shell could not start: ${error.message}`, exitCode: null });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let text = capOutput(stripAnsi(output).replace(/\r\n/g, "\n").trimEnd(), DESK_OUTPUT_MAX_BYTES);
      if (timedOut) text = `${text}\n(killed: no output for ${Math.round(timeoutMs / 1000)}s)`.trim();
      const ok = code === 0 && !timedOut;
      resolve({ ok, output: text || (ok ? "" : `(exit ${code ?? "signal"})`), exitCode: code });
    });
  });
}
