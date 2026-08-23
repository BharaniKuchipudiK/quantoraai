export const STUDIO_SIDEBAR_HISTORY_MIN_PX = 168;
export const STUDIO_SIDEBAR_SECTIONS_KEY = 'quantora_studio_sidebar_sections';

export function defaultStudioSidebarSections() {
  return { projectDetails: false, agents: true };
}

export function normalizeStudioSidebarSections(value) {
  const defaults = defaultStudioSidebarSections();
  if (!value || typeof value !== 'object') return { ...defaults };
  return {
    projectDetails: value.projectDetails === true,
    agents: value.agents !== false,
  };
}

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export function loadStudioSidebarSections(storage) {
  const store = resolveStorage(storage);
  if (!store) return defaultStudioSidebarSections();
  try {
    const raw = store.getItem(STUDIO_SIDEBAR_SECTIONS_KEY);
    if (!raw) return defaultStudioSidebarSections();
    return normalizeStudioSidebarSections(JSON.parse(raw));
  } catch {
    return defaultStudioSidebarSections();
  }
}

export function persistStudioSidebarSections(sections, storage) {
  const next = normalizeStudioSidebarSections(sections);
  const store = resolveStorage(storage);
  if (!store) return next;
  try {
    store.setItem(STUDIO_SIDEBAR_SECTIONS_KEY, JSON.stringify(next));
  } catch {
    // Private mode and quota errors should not break the sidebar.
  }
  return next;
}

export function studioProjectLabel(projectName) {
  const name = String(projectName || '').trim();
  return name || 'this project';
}

export function studioSidebarHistoryTitle(projectName) {
  return `Chats in ${studioProjectLabel(projectName)}`;
}

export function studioSidebarHistoryHint(count, projectName) {
  const name = studioProjectLabel(projectName);
  const parsed = Number(count);
  const n = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  if (n <= 0) return `No chats in ${name} yet. New Chat starts one here.`;
  if (n === 1) return '1 chat in this project';
  return `${n} chats in this project`;
}
