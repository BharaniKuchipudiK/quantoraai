export const STUDIO_SIDEBAR_HISTORY_MIN_PX = 220;
export const STUDIO_SIDEBAR_SECTIONS_KEY = 'quantora_studio_sidebar_sections';

export function defaultStudioSidebarSections() {
  return { projectDetails: false, agents: true };
}

export function studioSidebarFrameStyle() {
  return {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
    ['--studio-sidebar-history-min']: `${STUDIO_SIDEBAR_HISTORY_MIN_PX}px`,
  };
}

export function studioSidebarYieldingSectionStyle(extra = {}) {
  return {
    flex: '0 1 auto',
    minHeight: 0,
    minWidth: 0,
    ...extra,
  };
}

export function studioSidebarHistoryPaneStyle() {
  return {
    flex: `1 1 ${STUDIO_SIDEBAR_HISTORY_MIN_PX}px`,
    minHeight: STUDIO_SIDEBAR_HISTORY_MIN_PX,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };
}

export function studioSidebarHistoryListStyle() {
  return {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingRight: '2px',
  };
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

export function studioSidebarMembershipCopy(projectName) {
  return `These chats belong to ${studioProjectLabel(projectName)}. New Chat stays here.`;
}

/**
 * Chat search and age, for the history list.
 *
 * WHY THIS EXISTS
 *
 * The sidebar listed every chat in creation order with no way to search and no
 * indication of age. That is fine at five chats and useless at fifty: the only
 * way to find last week's work was to open chats one at a time and read them.
 * Claude and ChatGPT both put search directly in the nav for exactly this.
 */

/** Longest run of message text scanned per chat, so typing stays responsive. */
const SEARCH_SCAN_LIMIT = 4000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How old a chat is, in the shortest form that is still unambiguous.
 * Anything older than a week gets a date, because "38d" is not a thing people
 * read as a date.
 */
export function relativeChatTime(timestamp, now = Date.now()) {
  const then = Number(timestamp);
  const current = Number(now);
  if (!Number.isFinite(then) || then <= 0 || !Number.isFinite(current)) return '';
  const elapsed = current - then;
  // A clock skew between devices must not render "-3m".
  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;
  try {
    return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

/** Text of one chat that a search should look at: its title, then what was said. */
function searchableChatText(session) {
  const title = String(session?.title || '');
  let body = '';
  for (const message of Array.isArray(session?.messages) ? session.messages : []) {
    if (body.length >= SEARCH_SCAN_LIMIT) break;
    const text = typeof message?.text === 'string' ? message.text : '';
    if (text) body += ` ${text}`;
  }
  return `${title} ${body.slice(0, SEARCH_SCAN_LIMIT)}`.toLowerCase();
}

/**
 * Filter chats by a typed query.
 *
 * Searches what was SAID, not just the title. A chat's title is auto-generated
 * from its opening line, so title-only search cannot find the chat where you
 * discussed a thing halfway through — which is the search people actually need.
 *
 * Every whitespace-separated term must appear somewhere, so adding a word
 * narrows rather than widens.
 */
export function filterChatSessions(sessions = [], query = '') {
  const list = Array.isArray(sessions) ? sessions : [];
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return list;
  return list.filter((session) => {
    const hay = searchableChatText(session);
    return terms.every((term) => hay.includes(term));
  });
}

/** What the list says when a search matches nothing. */
export function chatSearchEmptyCopy(query) {
  const trimmed = String(query || '').trim();
  return trimmed ? `No chat mentions “${trimmed}”.` : '';
}
