import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/*
 * A LITERAL FUTURE TRAVEL DATE IN A WALL-CLOCK TEST IS A SCHEDULED FAILURE.
 *
 * Travel validation rejects dates once they move into the past. A booking date
 * literal can therefore be green when committed and make main red later with
 * no code change at all. This has happened more than once.
 *
 * The guard deliberately targets that failure class rather than every ISO date
 * in every test. Finance parsers, schedule windows, and other deterministic
 * simulations legitimately use fixed dates against their own explicit clock;
 * those do not age with wall time and must not be treated as booking fixtures.
 *
 * Rules:
 *   - travel/booking tests with non-sentinel future literals are rejected;
 *   - dates already in the past are safe forever and can test rejection paths;
 *   - a sentinel year (2090+) is allowed when far-future is the subject;
 *   - deterministic tests declaring a fixed AS_OF are simulation-clock tests;
 *   - normal future travel fixtures must be derived from the clock.
 */

const SENTINEL_YEAR = 2090;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SEARCH_DIRS = ['api/_lib', 'src/lib', 'shared', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
const TRAVEL_DATE_SURFACE = /\b(?:departureDate|returnDate|checkInDate|checkOutDate|travel|flight|hotel|booking|itinerary|SIN\s+to\s+[A-Z]{3})\b/i;

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

function frozenAsOfIn(source) {
  const match = source.match(/\bconst\s+AS_OF\s*=\s*['"](\d{4}-\d{2}-\d{2})(?:T[^'"]*)?['"]/);
  return match?.[1] || null;
}

function armedDateLiteralsIn(file) {
  const source = readFileSync(file, 'utf8');
  if (!TRAVEL_DATE_SURFACE.test(source)) return [];

  const found = [];
  const today = new Date();
  const frozenAsOf = frozenAsOfIn(source);
  const pattern = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

  for (const match of source.matchAll(pattern)) {
    const year = Number(match[1]);
    if (year >= SENTINEL_YEAR) continue;
    const when = new Date(`${match[1]}-${match[2]}-${match[3]}T23:59:59Z`);
    if (Number.isNaN(when.getTime()) || when <= today) continue;

    // An explicit frozen AS_OF means this file evaluates its dates against a
    // simulation clock, not calendar time, so its fixtures cannot silently rot.
    if (frozenAsOf) continue;

    const line = source.slice(0, match.index).split('\n').length;
    found.push({
      file: path.relative(ROOT, file),
      line,
      literal: match[0],
      daysAway: Math.round((when - today) / 86_400_000),
    });
  }

  return found;
}

test('no wall-clock travel test carries a hardcoded future date that can age into a failure', () => {
  const armed = SEARCH_DIRS
    .flatMap((dir) => testFilesUnder(path.join(ROOT, dir)))
    .flatMap(armedDateLiteralsIn);

  const detail = armed
    .map((a) => `  ${a.file}:${a.line}  ${a.literal}  — detonates in ${a.daysAway} day(s)`)
    .join('\n');

  assert.equal(
    armed.length,
    0,
    `A wall-clock travel test contains a hardcoded future date, so the suite can go red later with no diff to blame:\n${detail}\n\n`
      + 'Derive future booking fixtures from the clock instead — '
      + '`const D = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)` — '
      + `or use a sentinel year ${SENTINEL_YEAR}+ only when a fixed far-future date is explicitly required.`,
  );
});

test('the gate catches future travel dates in fields and user-message strings', () => {
  const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  const past = '2020-01-01';
  const sample = [
    `departureDate: '${future}',`,
    `message: 'SIN to DPS on ${future}',`,
    `checkInDate: '${past}',`,
    "returnDate: '2099-01-01',",
    'departureDate: DEPARTURE_DATE,',
  ].join('\n');

  assert.equal(TRAVEL_DATE_SURFACE.test(sample), true, 'the sample is recognised as travel-date-sensitive');
  const today = new Date();
  const armed = [...sample.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)]
    .filter((match) => Number(match[1]) < SENTINEL_YEAR)
    .filter((match) => new Date(`${match[1]}-${match[2]}-${match[3]}T23:59:59Z`) > today)
    .map((match) => match[0]);

  assert.equal(armed.length, 2, 'both future literals are caught regardless of surrounding syntax');
  assert.equal(armed.every((literal) => literal === future), true, 'only the future date is armed');
  assert.doesNotMatch(armed.join(), /2020-01-01/, 'a past date stays past — safe and often deliberate');
  assert.doesNotMatch(armed.join(), /2099/, 'a sentinel year is not a real booking fixture');
  assert.doesNotMatch(armed.join(), /DEPARTURE_DATE/, 'a clock-derived constant is the remedy, not a finding');
});

test('non-travel deterministic fixtures are outside the wall-clock booking gate', () => {
  const finance = 'dueDate: "2026-10-01"; commitment parser fixture';
  const study = 'schedule window through 2026-10-03';
  assert.equal(TRAVEL_DATE_SURFACE.test(finance), false);
  assert.equal(TRAVEL_DATE_SURFACE.test(study), false);
});

test('a frozen AS_OF marks deterministic simulated-clock travel tests as safe', () => {
  const source = "const AS_OF = '2026-01-01T00:00:00.000Z';\nconst departureDate = '2026-12-20';";
  assert.equal(TRAVEL_DATE_SURFACE.test(source), true);
  assert.equal(frozenAsOfIn(source), '2026-01-01');
});
