import { validateDeskSyncEntries } from '../../shared/desk-runtime-contract.js';
import { parsePythonRuntimeCommand } from './python-runtime-command.js';

const contentOf = (entry) => typeof entry === 'string' ? entry : entry?.content;

/** Only changed text files are merged; no deletions or stale source overwrites. */
export function mergePythonOutputFiles(base = {}, current = {}, files = []) {
  const checked = validateDeskSyncEntries(files);
  if (!checked.ok) return { ok: false, error: checked.reason };
  const next = { ...current };
  for (const file of checked.entries) {
    if (contentOf(base[file.path]) === file.content) continue;
    if (contentOf(current[file.path]) !== contentOf(base[file.path]) && contentOf(current[file.path]) !== file.content) {
      return { ok: false, error: `${file.path} changed while Python ran. Output was not saved over your edits.` };
    }
    next[file.path] = { ...(typeof current[file.path] === 'object' ? current[file.path] : {}), content: file.content };
  }
  return { ok: true, vfs: next };
}

/** Execute only explicit Run instructions from the user's brief, not model prose. */
export function requestedPythonCommands(brief = '') {
  const commands = [];
  for (const line of String(brief).split('\n')) {
    const match = line.match(/\brun\s+`?((?:python3?|pytest)\s+[^`\n]+)/i);
    if (!match) continue;
    const command = match[1].split(/\s+and\s+/i)[0].trim().replace(/[.;]$/, '');
    if (/[;&|<>]/.test(command)) continue;
    if (parsePythonRuntimeCommand(command).ok && !commands.includes(command)) commands.push(command);
    if (commands.length >= 5) break;
  }
  return commands;
}
