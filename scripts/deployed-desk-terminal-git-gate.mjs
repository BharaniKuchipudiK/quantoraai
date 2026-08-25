#!/usr/bin/env node
/**
 * Deployed Coding Desk Terminal `ls` + Git commit against an HTTPS Vercel deployment.
 *
 * Requires the same secrets as deployed-golden-transactions:
 *   QUANTORA_E2E_BASE_URL, VERCEL_AUTOMATION_BYPASS_SECRET
 * Optional: QUANTORA_GOLDEN_CANARY_TOKEN, QUANTORA_DEPLOYMENT_SHA
 *
 * Hits `${BASE}/desk` (COEP). Chat is mocked for a deterministic VFS; Preview-compile
 * is the live deployment API. Full signed-in live LLM on /desk remains a manual
 * checklist — see docs/DESK_TERMINAL_GIT_PROD_CHECKLIST.md.
 */
import { runDeskTerminalGitGate } from './desk-terminal-git-gate.mjs';

await runDeskTerminalGitGate({ requireDeployed: true }).catch((error) => {
  console.error('Deployed desk Terminal/Git gate FAILED:', error?.stack || error);
  process.exitCode = 1;
});
