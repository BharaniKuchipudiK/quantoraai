import type { TravelProviderName } from './travel-contracts.js';

export class TravelProviderError extends Error {
  provider: TravelProviderName;
  kind: 'unavailable' | 'timeout' | 'error';
  status?: number;

  constructor(
    provider: TravelProviderName,
    kind: 'unavailable' | 'timeout' | 'error',
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'TravelProviderError';
    this.provider = provider;
    this.kind = kind;
    this.status = status;
  }
}

export async function fetchWithDeadline(
  provider: TravelProviderName,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: any) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new TravelProviderError(provider, 'timeout', `${provider} request timed out after ${timeoutMs}ms.`);
    }
    throw new TravelProviderError(provider, 'error', error?.message || `${provider} request failed.`);
  } finally {
    clearTimeout(timer);
  }
}

export async function providerJson(
  provider: TravelProviderName,
  response: Response,
): Promise<any> {
  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      parsed?.errors?.[0]?.detail ||
      parsed?.errors?.[0]?.title ||
      parsed?.error_description ||
      parsed?.error?.message ||
      parsed?.message ||
      text?.slice(0, 400) ||
      `${provider} returned HTTP ${response.status}.`;
    const kind = response.status === 401 || response.status === 403 || response.status === 404
      ? 'unavailable'
      : 'error';
    throw new TravelProviderError(provider, kind, message, response.status);
  }

  return parsed;
}
