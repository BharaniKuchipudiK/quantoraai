const RESET_TOKEN_KEY = 'quantora_reset_token';
const RESET_TTL_MS = 60 * 60 * 1000;

export function stashPasswordResetToken(token = '') {
  const value = String(token || '').trim();
  if (typeof sessionStorage === 'undefined' || !value) return;
  sessionStorage.setItem(RESET_TOKEN_KEY, JSON.stringify({ token: value, savedAt: Date.now() }));
}

export function peekPasswordResetToken() {
  if (typeof sessionStorage === 'undefined') return '';
  const raw = sessionStorage.getItem(RESET_TOKEN_KEY);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    const token = String(parsed?.token || '').trim();
    const savedAt = Number(parsed?.savedAt) || 0;
    if (!token || Date.now() - savedAt > RESET_TTL_MS) {
      sessionStorage.removeItem(RESET_TOKEN_KEY);
      return '';
    }
    return token;
  } catch {
    sessionStorage.removeItem(RESET_TOKEN_KEY);
    return '';
  }
}

export function clearPasswordResetToken() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(RESET_TOKEN_KEY);
}
