import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DESK_TABS,
  PINNED_DESK_TAB,
  closeDeskTab,
  deskTabKind,
  deskTabLabel,
  isSystemDeskTab,
  nextDeskTab,
  normalizeDeskTabs,
  openDeskTab,
  pruneDeskTabs,
  rankDeskFileMatches,
} from './desk-tabs.js';

test('preview is always present and always first', () => {
  assert.deepEqual(normalizeDeskTabs([]), ['preview']);
  assert.deepEqual(normalizeDeskTabs(['app.jsx']), ['preview', 'app.jsx']);
  assert.deepEqual(normalizeDeskTabs(['app.jsx', 'preview']), ['preview', 'app.jsx']);
});

test('normalize drops duplicates and blanks without reordering the rest', () => {
  assert.deepEqual(
    normalizeDeskTabs(['a.js', '', 'b.js', 'a.js', null, 'b.js']),
    ['preview', 'a.js', 'b.js'],
  );
});

test('opening an already-open tab does not duplicate it', () => {
  const tabs = openDeskTab(['preview', 'a.js'], 'a.js');
  assert.deepEqual(tabs, ['preview', 'a.js']);
});

test('opening appends in order', () => {
  let tabs = openDeskTab([], 'a.js');
  tabs = openDeskTab(tabs, 'terminal');
  tabs = openDeskTab(tabs, 'b.js');
  assert.deepEqual(tabs, ['preview', 'a.js', 'terminal', 'b.js']);
});

test('opening past the cap evicts the oldest closable tab, never preview', () => {
  let tabs = [];
  for (let i = 0; i < MAX_DESK_TABS + 4; i += 1) tabs = openDeskTab(tabs, `f${i}.js`);
  assert.equal(tabs.length, MAX_DESK_TABS);
  assert.equal(tabs[0], PINNED_DESK_TAB);
  // The first four opened were evicted; the newest survives.
  assert.ok(!tabs.includes('f0.js'));
  assert.ok(tabs.includes(`f${MAX_DESK_TABS + 3}.js`));
});

test('preview cannot be closed', () => {
  const result = closeDeskTab(['preview', 'a.js'], 'preview', 'preview');
  assert.deepEqual(result.tabs, ['preview', 'a.js']);
  assert.equal(result.active, 'preview');
});

test('closing the active tab moves selection left', () => {
  const result = closeDeskTab(['preview', 'a.js', 'b.js', 'c.js'], 'b.js', 'b.js');
  assert.deepEqual(result.tabs, ['preview', 'a.js', 'c.js']);
  assert.equal(result.active, 'a.js');
});

test('closing the leftmost closable active tab lands on preview', () => {
  const result = closeDeskTab(['preview', 'a.js', 'b.js'], 'a.js', 'a.js');
  assert.equal(result.active, 'preview');
});

test('closing a background tab leaves the active tab alone', () => {
  const result = closeDeskTab(['preview', 'a.js', 'b.js'], 'a.js', 'b.js');
  assert.deepEqual(result.tabs, ['preview', 'b.js']);
  assert.equal(result.active, 'b.js');
});

test('closing an unknown tab is a no-op', () => {
  const result = closeDeskTab(['preview', 'a.js'], 'ghost.js', 'a.js');
  assert.deepEqual(result.tabs, ['preview', 'a.js']);
  assert.equal(result.active, 'a.js');
});

test('prune drops file tabs whose file no longer exists', () => {
  const vfs = { 'a.js': { content: '' } };
  const result = pruneDeskTabs(['preview', 'a.js', 'gone.js', 'terminal'], vfs, 'a.js');
  assert.deepEqual(result.tabs, ['preview', 'a.js', 'terminal']);
  assert.equal(result.active, 'a.js');
});

test('prune falls back to preview when the active file vanished', () => {
  const result = pruneDeskTabs(['preview', 'gone.js'], { 'a.js': { content: '' } }, 'gone.js');
  assert.deepEqual(result.tabs, ['preview']);
  assert.equal(result.active, 'preview');
});

test('prune never drops system tabs even with an empty vfs', () => {
  const result = pruneDeskTabs(['preview', 'terminal', 'git'], {}, 'git');
  assert.deepEqual(result.tabs, ['preview', 'terminal', 'git']);
  assert.equal(result.active, 'git');
});

test('cycling wraps in both directions', () => {
  const tabs = ['preview', 'a.js', 'b.js'];
  assert.equal(nextDeskTab(tabs, 'preview', 1), 'a.js');
  assert.equal(nextDeskTab(tabs, 'b.js', 1), 'preview');
  assert.equal(nextDeskTab(tabs, 'preview', -1), 'b.js');
  assert.equal(nextDeskTab(tabs, 'a.js', -1), 'preview');
});

test('cycling a single-tab strip stays put', () => {
  assert.equal(nextDeskTab(['preview'], 'preview', 1), 'preview');
});

test('cycling from an unknown active tab starts at the beginning', () => {
  assert.equal(nextDeskTab(['preview', 'a.js'], 'ghost.js', 1), 'a.js');
});

test('labels shorten paths to basenames but keep pane names', () => {
  assert.equal(deskTabLabel('src/components/App.jsx'), 'App.jsx');
  assert.equal(deskTabLabel('index.html'), 'index.html');
  assert.equal(deskTabLabel('preview'), 'Preview');
  assert.equal(deskTabLabel('terminal'), 'Terminal');
  assert.equal(deskTabLabel('git'), 'Git');
  assert.equal(deskTabLabel(''), '');
});

test('kind separates panes from files', () => {
  assert.equal(deskTabKind('preview'), 'preview');
  assert.equal(deskTabKind('terminal'), 'terminal');
  assert.equal(deskTabKind('git'), 'git');
  assert.equal(deskTabKind('src/a.js'), 'file');
  assert.ok(isSystemDeskTab('git'));
  assert.ok(!isSystemDeskTab('src/a.js'));
});

test('an empty finder query lists every file in order', () => {
  const files = ['b.js', 'a.js'];
  assert.deepEqual(rankDeskFileMatches(files, ''), ['b.js', 'a.js']);
  assert.deepEqual(rankDeskFileMatches(files, '   '), ['b.js', 'a.js']);
});

test('the finder matches subsequences, not just substrings', () => {
  assert.deepEqual(rankDeskFileMatches(['app.jsx', 'index.html'], 'aj'), ['app.jsx']);
});

test('the finder ranks a basename hit above a directory hit', () => {
  const files = ['src/application/legacy/wrapper.js', 'app.jsx'];
  assert.equal(rankDeskFileMatches(files, 'app')[0], 'app.jsx');
});

test('the finder drops files that do not match at all', () => {
  assert.deepEqual(rankDeskFileMatches(['app.jsx', 'index.html'], 'zzz'), []);
});

test('the finder is case insensitive', () => {
  assert.deepEqual(rankDeskFileMatches(['App.JSX'], 'app'), ['App.JSX']);
});

test('the finder honours its limit', () => {
  const files = Array.from({ length: 80 }, (_, i) => `file${i}.js`);
  assert.equal(rankDeskFileMatches(files, 'file', 10).length, 10);
  assert.equal(rankDeskFileMatches(files, '', 10).length, 10);
});

test('the finder survives junk input', () => {
  assert.deepEqual(rankDeskFileMatches(null, 'a'), []);
  assert.deepEqual(rankDeskFileMatches(['a.js', null, ''], 'a'), ['a.js']);
});
