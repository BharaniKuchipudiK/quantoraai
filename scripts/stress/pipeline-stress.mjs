#!/usr/bin/env node
/**
 * Pipeline stress — push hostile model replies through the REAL desk path and
 * check that invariants hold. No inference, so it costs nothing to run.
 *
 * It asserts INVARIANTS, never golden output. "Did it produce this exact HTML"
 * breaks the moment wording changes and teaches nobody anything. "Did a failed
 * turn destroy the user's build" is true or false forever.
 */
import { applyWorkspaceFromChat } from '../../src/lib/studio-preview-helpers.js';
import { pickPreviewEntry } from '../../src/lib/preview-utils.js';
import { resolveDeskSaveTarget, deferredWriteStillValid } from '../../src/lib/desk-session-ownership.js';
import { compactSupersededBuilds } from '../../src/lib/session-code-budget.js';
import { probeRunningDesk, mergeLiveDeskProbe, buildDeskContextPacket } from '../../src/lib/studio-desk-context.js';
import { BASE_VFS, SCENARIOS } from './fixtures.mjs';
import { MUTATIONS } from './mutations.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const contentOf = (vfs, path) => (vfs?.[path]?.content ?? null);
const paths = (vfs) => Object.keys(vfs || {}).sort();

/*
 * Severity is part of the finding, not decoration.
 *
 *   defect  something is demonstrably wrong right now.
 *   hazard  a contract that holds only because every caller remembers to
 *           check a flag. Correct today, one careless call from a defect.
 *
 * Reporting 44 instances of one design property as 44 bugs would inflate the
 * number and bury the one real defect underneath it — the same sin as a green
 * tick over a dead wire, pointing the other way.
 */
const SEVERITY = {
  threw: 'defect',
  'markers-as-content': 'defect',
  'changed-without-committing': 'defect',
  'failure-not-described': 'defect',
  'file-lost': 'defect',
  'committed-unrunnable': 'defect',
  'file-emptied': 'defect',
  'not-idempotent': 'defect',
  'check-contradicts-files': 'defect',
  'silent-failure': 'defect',
  'sibling-dropped': 'defect',
  'expected-commit': 'defect',
  'unexpected-commit': 'defect',
  'expected-unchanged': 'defect',
  'noop-returns-empty-desk': 'hazard',
};

const violations = [];
const record = (scenario, invariant, detail) => violations.push({ scenario, invariant, detail });

/** Invariants every turn must satisfy, whatever the reply looked like. */
function checkTurn(scenario, before, out) {
  const after = out.vfs || {};
  const id = scenario.id;

  // 1. Patch markers are syntax, never content.
  for (const path of paths(after)) {
    const text = String(contentOf(after, path) || '');
    if (text.includes('<<<<') && text.includes('====')) {
      record(id, 'markers-as-content', `${path} contains raw patch markers`);
    }
  }

  // 2. A turn that commits nothing must leave the desk exactly as it was.
  if (!out.didUpdate && Object.keys(after).length) {
    for (const path of paths(before)) {
      if (contentOf(after, path) !== contentOf(before, path)) {
        record(id, 'changed-without-committing', `${path} differs though didUpdate is false`);
      }
    }
  }

  // 3. A failed edit must be reported, not absorbed.
  const failures = out.patchFailures || [];
  if (failures.length && out.didUpdate && !failures.some((f) => f.result?.failed?.length)) {
    record(id, 'failure-not-described', 'patchFailures present but carries no reason');
  }

  // 4. Files that existed must not vanish on a same-product edit.
  if (out.didUpdate && !scenario.productSwitch) {
    for (const path of paths(before)) {
      if (!(path in after)) record(id, 'file-lost', `${path} existed before the turn and is gone`);
    }
  }

  // 5. A committed desk must be runnable.
  if (out.didUpdate && Object.keys(after).length && !pickPreviewEntry(after) && !out.needsWebEntry) {
    record(id, 'committed-unrunnable', 'didUpdate with no preview entry and no needsWebEntry flag');
  }

  // 6. No content may be an empty string where a file existed with content.
  for (const path of paths(after)) {
    const now = String(contentOf(after, path) ?? '');
    const was = String(contentOf(before, path) ?? '');
    if (was.trim() && !now.trim()) record(id, 'file-emptied', `${path} had content and is now empty`);
  }

  // 7. Applying the same reply twice must land in the same place.
  const twice = applyWorkspaceFromChat(scenario.reply, clone(after), out.job, { brief: scenario.brief || '' });
  if (out.didUpdate && twice.didUpdate) {
    for (const path of paths(after)) {
      const a = contentOf(after, path);
      const b = contentOf(twice.vfs, path);
      if (a !== b && !(scenario.expect?.reportsFailure)) {
        record(id, 'not-idempotent', `${path} changes again when the same reply is re-applied`);
        break;
      }
    }
  }

  // 8. What the check panel reports must match what the files hold.
  if (Object.keys(after).length) {
    const html = pickPreviewEntry(after) || '';
    const packet = buildDeskContextPacket({ vfs: after, job: out.job, html, studioDomain: 'coding' });
    const merged = mergeLiveDeskProbe(packet, null) || packet;
    const facts = probeRunningDesk({ html, vfs: after, job: out.job }).facts || {};
    for (const check of merged.checks || []) {
      if (check.id === 'cart' && check.ok === true && facts.hasCart !== true) {
        record(id, 'check-contradicts-files', 'cart reported ok while the files have no cart control');
      }
      if (check.id === 'catalog' && check.ok === true && (facts.catalogCount || 0) === 0) {
        record(id, 'check-contradicts-files', 'catalog reported ok with zero items');
      }
    }
  }

  // 9. A turn that changes nothing must hand back the desk, not an empty map.
  //    Returning {} makes every caller responsible for remembering didUpdate;
  //    one that trusts `.vfs` wipes the user's build.
  if (!out.didUpdate && Object.keys(before).length && !Object.keys(after).length) {
    record(id, 'noop-returns-empty-desk', 'didUpdate=false returned {} instead of the unchanged files');
  }

  // 10. Declared expectations from the fixture.
  const want = scenario.expect || {};
  if (want.commits === true && !out.didUpdate) record(id, 'expected-commit', 'this reply should have produced a build');
  if (want.commits === false && out.didUpdate) record(id, 'unexpected-commit', 'a reply with no code produced a build');
  if (want.unchanged && out.didUpdate) record(id, 'expected-unchanged', 'the desk should have been left alone');
  if (want.reportsFailure && !failures.length) record(id, 'silent-failure', 'an edit did not land and nothing said so');
  if (want.keepsSiblings && out.didUpdate) {
    for (const path of paths(before)) {
      if (!(path in after)) record(id, 'sibling-dropped', `${path} was dropped by a single-file edit`);
    }
  }
}

/** Session ownership: a desk must never land on a chat that did not build it. */
function checkSessionIsolation() {
  const cases = [
    { name: 'same session saves', input: { activeSessionId: 'a', lastSeenSession: 'a' }, save: true },
    { name: 'session changed mid-debounce', input: { activeSessionId: 'b', lastSeenSession: 'a' }, save: false },
    { name: 'no active session', input: { activeSessionId: null, lastSeenSession: null }, save: false },
  ];
  for (const item of cases) {
    const got = resolveDeskSaveTarget(item.input);
    if (got.save !== item.save) record('session-isolation', 'desk-bleed', `${item.name}: save=${got.save}, wanted ${item.save}`);
  }
  if (deferredWriteStillValid({ sessionAtBuild: 'a', sessionNow: 'b' })) {
    record('session-isolation', 'desk-bleed', 'a queued write survived a session change');
  }
}

/** Storage: a long build session must stay inside a browser origin budget. */
function checkStorageBudget() {
  const LIMIT = 5 * 1024 * 1024;
  const reply = `Build.\n\n\`\`\`html filepath="index.html"\n${BASE_VFS['index.html'].content.repeat(60)}\n\`\`\``;
  const messages = [];
  for (let i = 0; i < 12; i += 1) {
    messages.push({ id: `u${i}`, sender: 'user', text: 'again' });
    messages.push({ id: `a${i}`, sender: 'ai', text: reply });
  }
  const raw = JSON.stringify({ messages, desk: BASE_VFS }).length;
  const folded = JSON.stringify({ messages: compactSupersededBuilds(messages).messages, desk: BASE_VFS }).length;
  if (folded >= raw) record('storage', 'no-saving', 'folding superseded builds saved nothing');
  const sessions = Math.floor(LIMIT / folded);
  if (sessions < 10) record('storage', 'budget-too-tight', `only ${sessions} sessions of this size fit in 5MB`);
  return { raw, folded, sessions };
}

let ran = 0;
for (const base of SCENARIOS) {
  for (const mutation of MUTATIONS) {
    /*
     * A mutation changes how the reply ARRIVES, never what it means, so the
     * declared expectations still apply — except where truncation genuinely
     * removes the code, which is not a broken promise but a shorter reply.
     */
    const destructive = mutation.id === 'truncated-60pct' || mutation.id === 'unclosed-fence';
    const scenario = {
      ...base,
      id: `${base.id} [${mutation.id}]`,
      reply: mutation.apply(base.reply),
      expect: destructive
        // Truncation removes the code itself, so a promise about what the code
        // does no longer applies. Keeping `reportsFailure` here was the
        // harness asserting a failure it had just deleted.
        ? { ...base.expect, commits: undefined, keepsSiblings: undefined, reportsFailure: undefined }
        : base.expect,
    };
    const before = clone(scenario.vfs ?? BASE_VFS);
    let out;
    try {
      out = applyWorkspaceFromChat(scenario.reply, clone(before), null, { brief: scenario.brief || 'build my coffee shop' });
    } catch (error) {
      record(scenario.id, 'threw', `${error?.message || error}`);
      continue;
    }
    checkTurn(scenario, before, out);
    ran += 1;
  }
}
checkSessionIsolation();
const storage = checkStorageBudget();

const byInvariant = new Map();
for (const v of violations) {
  if (!byInvariant.has(v.invariant)) byInvariant.set(v.invariant, []);
  byInvariant.get(v.invariant).push(v);
}

console.log(`\nPipeline stress — ${ran} scenarios through the real desk path, 0 model calls.\n`);
console.log(`  storage: a 12-build session is ${(storage.raw / 1024).toFixed(0)}KB raw, ${(storage.folded / 1024).toFixed(0)}KB folded (${storage.sessions} fit in 5MB)\n`);

if (!violations.length) {
  console.log('  No invariant violations.\n');
  process.exit(0);
}

const defects = [...byInvariant].filter(([name]) => SEVERITY[name] !== 'hazard');
const hazards = [...byInvariant].filter(([name]) => SEVERITY[name] === 'hazard');
const rootOf = (scenario) => String(scenario).replace(/\s*\[[^\]]+\]$/, '');

const show = (label, entries) => {
  if (!entries.length) return;
  console.log(`  ${label}\n`);
  for (const [invariant, items] of entries.sort((a, b) => b[1].length - a[1].length)) {
    const roots = [...new Set(items.map((item) => rootOf(item.scenario)))];
    console.log(`    ${invariant}  — ${roots.length} case(s), ${items.length} occurrence(s)`);
    console.log(`      ${items[0].detail}`);
    console.log(`      seen in: ${roots.slice(0, 4).join(', ')}${roots.length > 4 ? ` +${roots.length - 4} more` : ''}\n`);
  }
};

show(`DEFECTS — ${defects.reduce((n, [, i]) => n + i.length, 0)} occurrence(s)`, defects);
show(`HAZARDS — correct today, one careless caller from a defect`, hazards);
process.exit(defects.length ? 1 : 0);
