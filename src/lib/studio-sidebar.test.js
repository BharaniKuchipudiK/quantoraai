import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  STUDIO_SIDEBAR_HISTORY_MIN_PX,
  defaultStudioSidebarSections,
  loadStudioSidebarSections,
  normalizeStudioSidebarSections,
  persistStudioSidebarSections,
  studioProjectLabel,
  studioSidebarFrameStyle,
  studioSidebarHistoryHint,
  studioSidebarHistoryListStyle,
  studioSidebarHistoryPaneStyle,
  studioSidebarHistoryTitle,
  studioSidebarMembershipCopy,
  studioSidebarYieldingSectionStyle,
  relativeChatTime,
  filterChatSessions,
  chatSearchEmptyCopy,
} from './studio-sidebar.js';

function memoryStorage(seed = {}) {
  const data = { ...seed };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

test('Chat History keeps a usable min-height and is never a default-collapsed section', () => {
  assert.equal(STUDIO_SIDEBAR_HISTORY_MIN_PX >= 200, true);
  const sections = defaultStudioSidebarSections();
  assert.equal(Object.prototype.hasOwnProperty.call(sections, 'history'), false);
  assert.equal(sections.projectDetails, false);
  assert.equal(sections.agents, true);
});

test('sidebar flex column gives History a real pane and lets Projects/agents yield', () => {
  const frame = studioSidebarFrameStyle();
  assert.equal(frame.display, 'flex');
  assert.equal(frame.flexDirection, 'column');
  assert.equal(frame.minHeight, 0);
  assert.equal(frame.overflow, 'hidden');
  assert.equal(frame['--studio-sidebar-history-min'], `${STUDIO_SIDEBAR_HISTORY_MIN_PX}px`);

  const yielding = studioSidebarYieldingSectionStyle({ marginBottom: '10px' });
  assert.equal(yielding.flex, '0 1 auto');
  assert.equal(yielding.minHeight, 0);
  assert.equal(yielding.marginBottom, '10px');

  const pane = studioSidebarHistoryPaneStyle();
  assert.equal(pane.flex, `1 1 ${STUDIO_SIDEBAR_HISTORY_MIN_PX}px`);
  assert.equal(pane.minHeight, STUDIO_SIDEBAR_HISTORY_MIN_PX);
  assert.equal(pane.overflow, 'hidden');

  const list = studioSidebarHistoryListStyle();
  assert.equal(list.overflowY, 'auto');
  assert.equal(list.overflowX, 'hidden');
  assert.equal(list.minHeight, 0);

  const css = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /data-quantora-sidebar-history="true"/);
  assert.match(css, /data-quantora-sidebar-history-list="true"/);
  assert.match(css, /data-quantora-sidebar-move-chat/);
  assert.match(css, /--studio-sidebar-history-min/);
});

test('history copy names the selected project instead of a global inbox', () => {
  assert.equal(studioProjectLabel('Personal Workspace'), 'Personal Workspace');
  assert.equal(studioSidebarHistoryTitle('Personal Workspace'), 'Chats in Personal Workspace');
  assert.equal(studioSidebarHistoryHint(0, 'Personal Workspace'), 'No chats in Personal Workspace yet. New Chat starts one here.');
  assert.equal(studioSidebarHistoryHint(1, 'Boutique'), '1 chat in this project');
  assert.equal(studioSidebarHistoryHint(4, 'Boutique'), '4 chats in this project');
  assert.equal(
    studioSidebarMembershipCopy('Personal Workspace'),
    'These chats belong to Personal Workspace. New Chat stays here.',
  );
  assert.equal(studioSidebarMembershipCopy(''), 'These chats belong to this project. New Chat stays here.');
});

test('section persistence keeps agents open unless the user collapsed them', () => {
  assert.deepEqual(normalizeStudioSidebarSections(null), { projectDetails: false, agents: true });
  assert.deepEqual(normalizeStudioSidebarSections({ projectDetails: true, agents: false }), {
    projectDetails: true,
    agents: false,
  });

  const storage = memoryStorage();
  persistStudioSidebarSections({ projectDetails: true, agents: false }, storage);
  assert.deepEqual(loadStudioSidebarSections(storage), { projectDetails: true, agents: false });
  assert.deepEqual(loadStudioSidebarSections(memoryStorage()), defaultStudioSidebarSections());
});

const AT = Date.parse('2026-08-31T12:00:00Z');

test('chat age reads in the shortest unambiguous form', () => {
  assert.equal(relativeChatTime(AT - 30_000, AT), 'now');
  assert.equal(relativeChatTime(AT - 5 * 60_000, AT), '5m');
  assert.equal(relativeChatTime(AT - 3 * 3_600_000, AT), '3h');
  assert.equal(relativeChatTime(AT - 2 * 86_400_000, AT), '2d');
});

test('anything past a week gets a date, because "38d" is not read as one', () => {
  const old = relativeChatTime(AT - 38 * 86_400_000, AT);
  assert.doesNotMatch(old, /^\d+d$/);
  assert.ok(old.length > 0);
});

test('a clock skew never renders a negative age', () => {
  assert.equal(relativeChatTime(AT + 5 * 60_000, AT), 'now');
});

test('a missing or junk timestamp renders nothing rather than "NaN"', () => {
  for (const bad of [undefined, null, 0, -1, 'yesterday', NaN]) {
    assert.equal(relativeChatTime(bad, AT), '', String(bad));
  }
});

test('search looks at what was said, not just the auto-generated title', () => {
  const sessions = [
    { title: 'New Chat', messages: [{ text: 'help me refinance the mortgage' }] },
    { title: 'New Chat', messages: [{ text: 'flights to Bali' }] },
  ];
  const hit = filterChatSessions(sessions, 'mortgage');
  assert.equal(hit.length, 1);
  assert.match(hit[0].messages[0].text, /refinance/);
});

test('every term must match, so adding a word narrows the list', () => {
  const sessions = [
    { title: 'Dashboard', messages: [{ text: 'revenue chart' }] },
    { title: 'Dashboard', messages: [{ text: 'settings page' }] },
  ];
  assert.equal(filterChatSessions(sessions, 'dashboard').length, 2);
  assert.equal(filterChatSessions(sessions, 'dashboard revenue').length, 1);
});

test('search is case insensitive and ignores stray whitespace', () => {
  const sessions = [{ title: 'Trip to BALI', messages: [] }];
  assert.equal(filterChatSessions(sessions, '  bali  ').length, 1);
});

test('an empty query returns every chat untouched', () => {
  const sessions = [{ title: 'a', messages: [] }, { title: 'b', messages: [] }];
  assert.equal(filterChatSessions(sessions, '').length, 2);
  assert.equal(filterChatSessions(sessions, '   ').length, 2);
});

test('search survives malformed sessions rather than throwing', () => {
  assert.deepEqual(filterChatSessions(null, 'x'), []);
  assert.equal(filterChatSessions([{}, { messages: null }, { title: null }], 'x').length, 0);
  assert.equal(filterChatSessions([{ title: 'x' }], 'x').length, 1);
});

test('a very long chat is still searchable without scanning all of it', () => {
  const huge = { title: 'Long', messages: Array.from({ length: 5000 }, () => ({ text: 'padding ' })) };
  const started = Date.now();
  assert.equal(filterChatSessions([huge], 'padding').length, 1);
  assert.ok(Date.now() - started < 200, 'search should stay fast on a long chat');
});

test('the empty-search line names what was searched for, and is blank without a query', () => {
  assert.match(chatSearchEmptyCopy('bali'), /bali/);
  assert.equal(chatSearchEmptyCopy('  '), '');
});

test('a term discussed mid-conversation is findable, not just one near the start', () => {
  /*
   * The scan budget used to be taken from the FRONT, which reproduced exactly
   * the blind spot this search exists to remove. The original test padded the
   * START, so it passed while the feature failed.
   */
  const messages = Array.from({ length: 51 }, (_, i) => ({
    text: i === 41 ? 'we settled on the postgres migration plan' : 'x'.repeat(400),
  }));
  assert.equal(filterChatSessions([{ title: 'Chat', messages }], 'postgres').length, 1);
});

test('a term in the newest message is findable in a very long chat', () => {
  const messages = Array.from({ length: 60 }, (_, i) => ({
    text: i === 59 ? 'the kubernetes rollout' : 'y'.repeat(400),
  }));
  assert.equal(filterChatSessions([{ title: 'Chat', messages }], 'kubernetes').length, 1);
});
