/**
 * Persist Coding Desk split widths. Mobile keeps fixed layout.
 */

export const STUDIO_CHAT_WIDTH_KEY = 'quantora_studio_chat_width_pct';
export const STUDIO_FILES_WIDTH_KEY = 'quantora_desk_files_width_px';

export const DEFAULT_CHAT_WIDTH_PCT = 36;
export const DEFAULT_FILES_WIDTH_PX = 212;
export const MIN_CHAT_WIDTH_PCT = 22;
export const MAX_CHAT_WIDTH_PCT = 55;
export const MIN_FILES_WIDTH_PX = 140;
export const MAX_FILES_WIDTH_PX = 420;
export const SPLIT_MOBILE_MAX_PX = 768;

function readNumber(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private mode */
  }
}

export function clampChatWidthPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_CHAT_WIDTH_PCT;
  return Math.min(MAX_CHAT_WIDTH_PCT, Math.max(MIN_CHAT_WIDTH_PCT, Math.round(n)));
}

export function clampFilesWidthPx(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FILES_WIDTH_PX;
  return Math.min(MAX_FILES_WIDTH_PX, Math.max(MIN_FILES_WIDTH_PX, Math.round(n)));
}

export function loadChatWidthPct() {
  return clampChatWidthPct(readNumber(STUDIO_CHAT_WIDTH_KEY, DEFAULT_CHAT_WIDTH_PCT));
}

export function loadFilesWidthPx() {
  return clampFilesWidthPx(readNumber(STUDIO_FILES_WIDTH_KEY, DEFAULT_FILES_WIDTH_PX));
}

export function saveChatWidthPct(value) {
  const next = clampChatWidthPct(value);
  writeNumber(STUDIO_CHAT_WIDTH_KEY, next);
  return next;
}

export function saveFilesWidthPx(value) {
  const next = clampFilesWidthPx(value);
  writeNumber(STUDIO_FILES_WIDTH_KEY, next);
  return next;
}

export function isStudioSplitMobile(width = typeof window !== 'undefined' ? window.innerWidth : 1200) {
  return Number(width) < SPLIT_MOBILE_MAX_PX;
}
