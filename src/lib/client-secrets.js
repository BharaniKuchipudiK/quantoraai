const memorySecrets = {
  gemini: '',
  openrouter: '',
};

export const BYOK_HEADER_GEMINI = 'x-quantora-gemini-key';
export const BYOK_HEADER_OPENROUTER = 'x-quantora-openrouter-key';
export const BYOK_HEADER_ANTHROPIC = 'x-quantora-anthropic-key';

function normalizeSecret(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function storageSecret(key) {
  if (typeof localStorage === 'undefined') return '';
  try {
    return normalizeSecret(localStorage.getItem(key) || '');
  } catch {
    return '';
  }
}

export function getClientSecret(provider) {
  if (provider === 'gemini') {
    return memorySecrets.gemini || storageSecret('geminiApiKey');
  }
  if (provider === 'openrouter') {
    return memorySecrets.openrouter || storageSecret('openRouterApiKey');
  }
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
