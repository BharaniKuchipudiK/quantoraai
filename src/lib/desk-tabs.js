/**
 * Coding Desk tab strip — pure state.
 *
 * WHY THIS EXISTS
 *
 * The desk used to hold exactly one open thing: `workspaceActiveTab`, a single
 * string that was either 'preview', 'terminal', 'git', or one file path.
 * Opening a file did not add a view — it destroyed the previous one. There was
 * no close, no reopen, no way to hold two files side by side in your head. Every
 * click cost you the last thing you were looking at.
 *
 * This module adds the list. `workspaceActiveTab` stays exactly what it was —
 * the one pane that renders — so nothing downstream had to change. The list
 * lives beside it and only answers: what is open, and what should be active
 * after this click.
 *
 * All functions are pure and return new arrays. No component owns tab logic.
 */

import { studioFileLabel } from './studio-file-tree.js';

/** Preview is the desk's home. It is always open and can never be closed. */
export const PINNED_DESK_TAB = 'preview';

/** Tabs that are panes rather than files. They open and close like any other. */
export const SYSTEM_DESK_TABS = ['preview', 'terminal', 'git'];

/**
 * A guard, not a preference. Each open file tab holds an editor; an unbounded
 * strip is how a long session turns into a scroll bar and a memory leak.
 */
export const MAX_DESK_TABS = 12;

export function isSystemDeskTab(id) {
  return SYSTEM_DESK_TABS.includes(String(id || ''));
}

export function deskTabLabel(id) {
  const value = String(id || '').trim();
  if (!value) return '';
  if (isSystemDeskTab(value)) return studioFileLabel(value);
  // Files show their basename; the full path is the title attribute.
  const parts = value.split('/');
  return parts[parts.length - 1] || value;
}

/** 'preview' | 'terminal' | 'git' | 'file' — drives which icon the strip draws. */
export function deskTabKind(id) {
  const value = String(id || '').trim();
  if (isSystemDeskTab(value)) return value;
  return 'file';
}

/** Preview pinned first, then insertion order. Never duplicates. */
export function normalizeDeskTabs(tabs = []) {
  const seen = new Set([PINNED_DESK_TAB]);
  const out = [PINNED_DESK_TAB];
  for (const raw of Array.isArray(tabs) ? tabs : []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Open `id`, or bring it forward if already open.
 * At the cap the oldest closable tab is evicted, so opening never silently fails.
 */
export function openDeskTab(tabs = [], id) {
  const next = String(id || '').trim();
  if (!next) return normalizeDeskTabs(tabs);
  const list = normalizeDeskTabs(tabs);
  if (list.includes(next)) return list;
  list.push(next);
  while (list.length > MAX_DESK_TABS) {
    // Index 1 is the oldest non-pinned tab; preview at 0 is never evicted.
    list.splice(1, 1);
  }
  return list;
}

/**
 * Close `id` and say what should be active now.
 *
 * Closing the tab you are looking at moves you left, the way every editor does —
 * landing on preview only when there is nothing to the left.
 */
export function closeDeskTab(tabs = [], id, activeId = PINNED_DESK_TAB) {
  const list = normalizeDeskTabs(tabs);
  const target = String(id || '').trim();
  const active = String(activeId || '').trim() || PINNED_DESK_TAB;
  if (!target || target === PINNED_DESK_TAB) return { tabs: list, active };

  const index = list.indexOf(target);
  if (index === -1) return { tabs: list, active };

  const remaining = list.filter((tab) => tab !== target);
  if (target !== active) return { tabs: remaining, active };
  return { tabs: remaining, active: remaining[index - 1] || PINNED_DESK_TAB };
}

/**
 * Drop file tabs whose file no longer exists.
 *
 * A build rewrites the VFS. Without this, tabs accumulate pointing at paths that
 * were deleted two turns ago, and clicking one opens an empty editor that looks
 * like data loss. System tabs are panes, not files, so they always survive.
 */
export function pruneDeskTabs(tabs = [], vfs = {}, activeId = PINNED_DESK_TAB) {
  const files = vfs && typeof vfs === 'object' ? vfs : {};
  const list = normalizeDeskTabs(tabs).filter(
    (tab) => isSystemDeskTab(tab) || Object.prototype.hasOwnProperty.call(files, tab),
  );
  const active = String(activeId || '').trim() || PINNED_DESK_TAB;
  return { tabs: list, active: list.includes(active) ? active : PINNED_DESK_TAB };
}

/** Cycle with the keyboard. `direction` is 1 for next, -1 for previous; wraps. */
export function nextDeskTab(tabs = [], activeId = PINNED_DESK_TAB, direction = 1) {
  const list = normalizeDeskTabs(tabs);
  if (list.length <= 1) return list[0] || PINNED_DESK_TAB;
  const index = list.indexOf(String(activeId || '').trim());
  const from = index === -1 ? 0 : index;
  const step = Number(direction) < 0 ? -1 : 1;
  return list[(from + step + list.length) % list.length];
}
