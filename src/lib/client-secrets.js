const memorySecrets = {
  gemini: '',
  openrouter: '',
};

const LEGACY_STORAGE_KEYS = Object.freeze([
  'geminiApiKey',
  'openRouterApiKey',
]);

export const BYOK_HEADER_GEMINI = 'x-quantora-gemini-key';
export const BYOK_HEADER_OPENROUTER = 'x-quantora-openrouter-key';
export const BYOK_HEADER_ANTHROPIC = 'x-quantora-anthropic-key';

function normalizeSecret(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Older builds persisted provider credentials in localStorage. Remove those
 * values without ever reading them into application memory: localStorage is
 * available to every same-origin script and is not a credential vault.
 */
export function clearLegacyPersistentSecrets(storage = typeof localStorage === 'undefined' ? null : localStorage) {
  if (!storage) return;
  try {
    for (const key of LEGACY_STORAGE_KEYS) storage.removeItem(key);
  } catch {
    // Storage can be disabled by browser policy. Secrets still remain memory-only.
  }
}

export function getClientSecret(provider) {
  if (provider === 'gemini') return memorySecrets.gemini;
  if (provider === 'openrouter') return memorySecrets.openrouter;
  return '';
}

export function setClientSecret(provider, value) {
  const normalized = normalizeSecret(value);
  if (provider === 'gemini') memorySecrets.gemini = normalized;
  if (provider === 'openrouter') memorySecrets.openrouter = normalized;
}

export function clearClientSecrets() {
  memorySecrets.gemini = '';
  memorySecrets.openrouter = '';
}

/**
 * Attach BYOK credentials as request headers (never JSON body fields).
 */
export function byokRequestHeaders(extra = {}) {
  const headers = { ...extra };
  const gemini = getClientSecret('gemini');
  const openrouter = getClientSecret('openrouter');
  if (gemini) headers[BYOK_HEADER_GEMINI] = gemini;
  if (openrouter) headers[BYOK_HEADER_OPENROUTER] = openrouter;
  return headers;
}
