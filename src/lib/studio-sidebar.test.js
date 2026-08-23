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
  studioSidebarYieldingSectionStyle,
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
  assert.match(css, /--studio-sidebar-history-min/);
});

test('history copy names the selected project instead of a global inbox', () => {
  assert.equal(studioProjectLabel('Personal Workspace'), 'Personal Workspace');
  assert.equal(studioSidebarHistoryTitle('Personal Workspace'), 'Chats in Personal Workspace');
  assert.equal(studioSidebarHistoryHint(0, 'Personal Workspace'), 'No chats in Personal Workspace yet. New Chat starts one here.');
  assert.equal(studioSidebarHistoryHint(1, 'Boutique'), '1 chat in this project');
  assert.equal(studioSidebarHistoryHint(4, 'Boutique'), '4 chats in this project');
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
