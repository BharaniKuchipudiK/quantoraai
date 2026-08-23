import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDIO_SIDEBAR_HISTORY_MIN_PX,
  defaultStudioSidebarSections,
  loadStudioSidebarSections,
  normalizeStudioSidebarSections,
  persistStudioSidebarSections,
  studioProjectLabel,
  studioSidebarHistoryHint,
  studioSidebarHistoryTitle,
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
  assert.equal(STUDIO_SIDEBAR_HISTORY_MIN_PX >= 160, true);
  const sections = defaultStudioSidebarSections();
  assert.equal(Object.prototype.hasOwnProperty.call(sections, 'history'), false);
  assert.equal(sections.projectDetails, false);
  assert.equal(sections.agents, true);
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
