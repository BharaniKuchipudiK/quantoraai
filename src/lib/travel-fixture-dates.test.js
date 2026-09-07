import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/*
 * A LITERAL FUTURE DATE IN A VALIDATED FIXTURE IS A SCHEDULED FAILURE.
 *
 * validateTravelToolArgs rejects a departure in the past, and in agent-tools.ts
 * that check runs BEFORE the provider-configured check. So a fixture written as
 * '2026-09-12' is valid the day it is written and returns INVALID_ARGUMENT the
 * morning after it passes — a red suite that no diff caused, on a date nobody
 * chose.
 *
 * This has now happened twice. On 2026-09-03 main went red on '2026-09-01' and
 * one file was fixed, deliberately scoped to the file that was failing. On
 * 2026-09-07 three more were still armed, two of them due to detonate five days
 * later, in the middle of a ten-user pilot running on borrowed money. Fixing the
 * instance and leaving the class is what put them there.
 *
 * THE RULE, and it cannot itself rot:
 *   - a date already in the PAST is fine forever. It stays past, and it is how
 *     rejection is deliberately tested.
 *   - a sentinel year (2090+) is fine. It is obviously not a real booking date.
 *   - any other literal date is, by definition, a future date that will become
 *     a past one. That is the bomb.
 *
 * There is no horizon constant here to age out: "is this date in the future"
 * is asked of the clock at the moment the gate runs.
 */

const VALIDATED_DATE_FIELDS = ['departureDate', 'returnDate', 'checkInDate', 'checkOutDate'];
const SENTINEL_YEAR = 2090;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SEARCH_DIRS = ['api/_lib', 'src/lib', 'shared', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

function testFilesUnder(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) out.push(...testFilesUnder(full));
    else if (/\.test\.(ts|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

function armedFixturesIn(file) {
  const source = readFileSync(file, 'utf8');
  const found = [];
  const today = new Date();
  for (const field of VALIDATED_DATE_FIELDS) {
    const pattern = new RegExp(`${field}\\s*:\\s*'(\\d{4})-(\\d{2})-(\\d{2})'`, 'g');
    for (const match of source.matchAll(pattern)) {
      const [literal, year] = [match[0], Number(match[1])];
      if (year >= SENTINEL_YEAR) continue;
      const when = new Date(`${match[1]}-${match[2]}-${match[3]}T23:59:59Z`);
      if (when <= today) continue; // already past: safe forever, and often the point
      const line = source.slice(0, match.index).split('\n').length;
      found.push({ file: path.relative(ROOT, file), line, literal, daysAway: Math.round((when - today) / 86_400_000) });
    }
  }
  return found;
}

test('no test fixture carries a future date that will age into a failure', () => {
  const armed = SEARCH_DIRS.flatMap((dir) => testFilesUnder(path.join(ROOT, dir))).flatMap(armedFixturesIn);

  /*
   * The message is the point. A gate that says only "failed" is one the next
   * person mutes under pressure, so this names the file, the line, the literal,
   * and how long is left before it goes off.
   */
  const detail = armed
    .map((a) => `  ${a.file}:${a.line}  ${a.literal}  — detonates in ${a.daysAway} day(s)`)
    .join('\n');

  assert.equal(
    armed.length,
    0,
    `A validated date fixture is hardcoded to a future date, so the suite will go red on that day with no diff to blame:\n${detail}\n\n`
      + 'Derive it from the clock instead — `const D = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)` — '
      + 'as api/_lib/agent-tools.test.ts already does. A date already in the past is fine (it stays past); '
      + `so is a sentinel year ${SENTINEL_YEAR}+.`,
  );
});

test('the gate can actually see a bomb, and does not fire on the safe shapes', () => {
  /*
   * Rule 4, turned on this gate: a check that cannot fail is worse than none.
   * The scan above passes on a clean tree, which is exactly what a broken scan
   * looks like — so prove it catches the thing it exists for.
   */
  const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  const past = '2020-01-01';

  const sample = [
    `departureDate: '${future}',`,
    `checkInDate: '${past}',`,
    "returnDate: '2099-01-01',",
    'departureDate: DEPARTURE_DATE,',
  ].join('\n');

  const armed = [];
  for (const field of VALIDATED_DATE_FIELDS) {
    const pattern = new RegExp(`${field}\\s*:\\s*'(\\d{4})-(\\d{2})-(\\d{2})'`, 'g');
    for (const match of sample.matchAll(pattern)) {
      if (Number(match[1]) >= SENTINEL_YEAR) continue;
      if (new Date(`${match[1]}-${match[2]}-${match[3]}T23:59:59Z`) <= new Date()) continue;
      armed.push(match[0]);
    }
  }

  assert.equal(armed.length, 1, 'exactly the future literal is caught');
  assert.match(armed[0], new RegExp(future), 'and it is the one that will age out');
  assert.doesNotMatch(armed.join(), /2020-01-01/, 'a past date stays past — safe, and often deliberate');
  assert.doesNotMatch(armed.join(), /2099/, 'a sentinel year is not a booking date');
  assert.doesNotMatch(armed.join(), /DEPARTURE_DATE/, 'a clock-derived constant is the remedy, not a finding');
});
