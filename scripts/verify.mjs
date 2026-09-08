#!/usr/bin/env node
/**
 * Run exactly what CI's first job runs, read FROM the workflow.
 *
 * WHY THIS EXISTS
 *
 * For a whole session I ran `npm run lint` and `npm run test:all` after every
 * change and called it verification. CI's job runs more things, one of which
 * is `lint:undef` — the only eslint step. tsc does not check no-undef in a .js
 * file, so a call to a function I had deleted passed every check I ran and
 * failed the first one I did not.
 *
 * The fix is not remembering harder. Steps are parsed out of ci.yml, so a step
 * added there is a step run here. This parser deliberately handles BOTH inline
 * `run: command` steps and YAML literal `run: |` blocks; otherwise a multiline
 * release gate (the dependency audit was the first one) can silently exist in
 * CI but never run locally.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

/*
 * Only the first job. The browser gates below it need a built preview server
 * and a matching Playwright build, which a dev box may not have — including
 * them would make this fail for reasons that are not the code's fault, and a
 * check people learn to ignore protects nothing.
 */
const lines = workflow.split('\n');
const jobsAt = lines.findIndex((line) => line.trimEnd() === 'jobs:');
if (jobsAt < 0) {
  console.error('verify: no jobs: block in ci.yml — refusing to report a pass.');
  process.exit(1);
}

// Job keys are the only two-space-indented keys under jobs:. Take the first
// job's lines, stopping at the second.
const isJobKey = (line) => /^ {2}[A-Za-z0-9_-]+:\s*$/.test(line);
const firstJobAt = lines.findIndex((line, i) => i > jobsAt && isJobKey(line));
const nextJobAt = lines.findIndex((line, i) => i > firstJobAt && isJobKey(line));
if (firstJobAt < 0) {
  console.error('verify: no job found under jobs: — refusing to report a pass.');
  process.exit(1);
}
const jobLines = lines.slice(firstJobAt, nextJobAt < 0 ? lines.length : nextJobAt);

function leadingSpaces(line) {
  return line.match(/^ */)?.[0].length || 0;
}

function readRunSteps(input) {
  const commands = [];

  for (let i = 0; i < input.length; i += 1) {
    const match = input[i].match(/^ {8}run:\s*(.*)$/);
    if (!match) continue;

    const value = match[1].trim();
    if (value && value !== '|' && value !== '|-' && value !== '|+') {
      if (value === '>' || value === '>-' || value === '>+') {
        throw new Error(`verify: unsupported folded YAML run block at line: ${input[i].trim()}`);
      }
      commands.push(value);
      continue;
    }

    if (value !== '|' && value !== '|-' && value !== '|+') {
      throw new Error(`verify: unsupported empty run step at line: ${input[i].trim()}`);
    }

    const block = [];
    for (i += 1; i < input.length; i += 1) {
      const line = input[i];
      if (line.trim() && leadingSpaces(line) <= 8) {
        i -= 1;
        break;
      }
      block.push(line);
    }

    const nonBlank = block.filter((line) => line.trim());
    if (!nonBlank.length) {
      throw new Error('verify: empty multiline run block — refusing to report a pass.');
    }
    const indent = Math.min(...nonBlank.map(leadingSpaces));
    commands.push(block.map((line) => (line.trim() ? line.slice(indent) : '')).join('\n').trimEnd());
  }

  return commands;
}

let steps;
try {
  steps = readRunSteps(jobLines).filter((cmd) => cmd.trim() !== 'npm ci');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (!steps.length) {
  console.error('verify: could not read any run steps from .github/workflows/ci.yml — refusing to report a pass.');
  process.exit(1);
}

const auditArtifact = join(ROOT, 'audit.json');
function protectGeneratedAuditArtifact(cmd) {
  if (!/\baudit\.json\b/.test(cmd)) return () => {};
  const existed = existsSync(auditArtifact);
  const previous = existed ? readFileSync(auditArtifact) : null;
  return () => {
    if (existed) writeFileSync(auditArtifact, previous);
    else rmSync(auditArtifact, { force: true });
  };
}

console.log(`Running ${steps.length} step(s), read from ci.yml:\n`);
let failed = 0;
for (const cmd of steps) {
  const label = cmd.includes('\n') ? `${cmd.split('\n')[0]} …` : cmd;
  const restoreGeneratedArtifacts = protectGeneratedAuditArtifact(cmd);
  process.stdout.write(`  ${label} ... `);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe' });
    console.log('ok');
  } catch (error) {
    failed += 1;
    console.log('FAILED');
    const out = `${error.stdout || ''}${error.stderr || ''}`.trim().split('\n').slice(-25);
    console.log(out.map((line) => `      ${line}`).join('\n'));
  } finally {
    restoreGeneratedArtifacts();
  }
}
console.log(failed ? `\n${failed} step(s) failed.` : '\nAll steps passed.');
process.exit(failed ? 1 : 0);
