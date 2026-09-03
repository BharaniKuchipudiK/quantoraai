#!/usr/bin/env node
/*
 * Make the deployed golden's real outcome legible without opening a log.
 *
 * The golden chat step is deliberately non-blocking (see the workflow, and
 * CLAUDE.md §5: separate the signal, never mute it). Separation was done
 * correctly — the deterministic readiness gate blocks, the browser golden does
 * not — but the REPORTING half was not, and that is how the failure hid:
 *
 *   - the check run conclusion reads success
 *   - the workflow run conclusion reads success
 *   - and, because `continue-on-error` records the true result in a separate
 *     `outcome` field, even the STEP conclusion in the GitHub API reads success
 *
 * The only trace was a `::warning::` and a line of log text. On 2026-09-02 the
 * golden was failing on production and on every PR preview, and nothing on any
 * dashboard said so — the same shape as the 2026-08-31 outage that CLAUDE.md §1
 * was written about, one level deeper.
 *
 * So this reporter writes the outcome to the job summary, which renders on the
 * run page itself. It reports a PASS as loudly as a failure: "no news" is what
 * made the red state survivable, and a summary that only appears on failure
 * cannot be distinguished from a summary that is broken.
 *
 * It is a reporter, not a gate. It never changes the job's result, and it never
 * throws — a reporter that can fail the run it reports on would be the next
 * thing muted.
 */
import { readFileSync, appendFileSync } from 'node:fs';

const EVIDENCE_PATH = process.env.QUANTORA_GOLDEN_EVIDENCE
  || 'artifacts/e2e/deployed-golden-evidence.json';

/** Health fields worth showing on the summary. No secret material. */
const HEALTH_KEYS = ['ready', 'goldenCanaryHonored', 'routeCount', 'geminiConfigured', 'openRouterConfigured'];

function readEvidence(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function truncate(text, max = 600) {
  const value = String(text ?? '').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/*
 * The annotation gets the headline; the summary gets the detail.
 *
 * The first CI run of this reporter put the whole error in the ::warning::,
 * and the golden's errors carry a serialized `Page state: {...}` dump — so the
 * banner became a wall of JSON that GitHub then truncated mid-string. Readable
 * is the entire point (§8): an annotation nobody can parse at a glance is the
 * failure mode this script exists to fix, reproduced one layer up.
 */
export function headline(error) {
  const value = String(error ?? '').trim();
  if (!value) return '';
  const [before] = value.split(/\s*Page state(?: at timeout)?:/i);
  return truncate((before || value).trim(), 180);
}

export function buildReport(outcome, evidence) {
  const passed = outcome === 'success';
  const lines = ['## Deployed golden chat transaction', ''];

  if (passed) {
    lines.push('**PASSED** — a prompt produced a rendered artifact on the deployed build.');
    lines.push('');
    lines.push('_Non-blocking by design; see CLAUDE.md §5._');
    return { passed, warning: null, markdown: `${lines.join('\n')}\n` };
  }

  lines.push('**FAILED** — the deployed build did not turn a prompt into a rendered artifact.');
  lines.push('');
  lines.push('This step is non-blocking, so the job above is green. The failure is real.');
  lines.push('Per CLAUDE.md §6, do not record this as flaky without a reproduction.');
  lines.push('');

  if (!evidence) {
    // The bug-present case that matters most: no evidence must still report a
    // failure, never an empty section that reads like nothing happened (§4).
    lines.push(`No evidence file was readable at \`${EVIDENCE_PATH}\`, so the cause is not on this page.`);
    lines.push('Read the step log, or download the run artifact.');
    return {
      passed,
      warning: 'Deployed golden chat FAILED and no evidence file was readable — read the step log.',
      markdown: `${lines.join('\n')}\n`,
    };
  }

  const error = truncate(evidence.error);
  if (error) {
    lines.push('### What failed', '', '```', error, '```', '');
  }

  // Carried into the annotation so the banner names the condition, not just
  // the symptom: "no healthy AI route" reads like a provider outage, while
  // paid routes being off because the meter is unreadable points at the cause.
  let spendNote = '';
  const health = evidence.inferenceHealth;
  if (health && typeof health === 'object') {
    const shown = HEALTH_KEYS
      .filter((key) => health[key] !== undefined)
      .map((key) => `| \`${key}\` | ${JSON.stringify(health[key])} |`);
    const spend = health.spend;
    if (spend && typeof spend === 'object' && spend.paidRoutesAllowed === false) {
      // With paid routes off, a single unhealthy free route is enough to
      // produce "no healthy AI route".
      const reason = truncate(spend.reason ?? 'no reason given', 80);
      shown.push(`| \`spend.paidRoutesAllowed\` | false — ${JSON.stringify(reason)} |`);
      spendNote = ` — paid routes off: ${reason}`;
    }
    if (shown.length) {
      lines.push('### Deployment readiness at failure', '', '| field | value |', '| --- | --- |', ...shown, '');
    }
  }

  if (evidence.baseUrl) lines.push(`Target: \`${evidence.baseUrl}\``);
  if (evidence.deploymentSha) lines.push(`Commit: \`${evidence.deploymentSha}\``);

  return {
    passed,
    warning: `Deployed golden chat FAILED: ${headline(evidence.error) || 'see the run artifact'}${spendNote}`,
    markdown: `${lines.join('\n')}\n`,
  };
}

function main() {
  const outcome = String(process.env.GOLDEN_CHAT_OUTCOME || '').trim();
  const report = buildReport(outcome, readEvidence(EVIDENCE_PATH));

  console.log(`deployed calculator/website golden outcome=${outcome || '(unset)'}`);
  if (report.warning) console.log(`::warning::${report.warning}`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  try {
    appendFileSync(summaryPath, report.markdown);
  } catch (error) {
    // Never fail the run over reporting.
    console.log(`Could not write the job summary: ${error?.message || error}`);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
