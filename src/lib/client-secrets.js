const memorySecrets = {
  gemini: '',
  openrouter: '',
};

function normalizeSecret(value) {
  return typeof value === 'string' ? value.trim() : '';
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
