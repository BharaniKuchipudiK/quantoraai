export const STUDIO_DOMAIN_REQUEST_EVENT = 'quantora:studio-domain-request';
export const STUDIO_DOMAIN_STATE_EVENT = 'quantora:studio-domain-state';

const VALID_STUDIO_DOMAINS = new Set(['travel', 'education', 'finance', 'research']);

export function normalizeStudioDomain(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return VALID_STUDIO_DOMAINS.has(normalized) ? normalized : null;
}

export function requestStudioDomain(domain, options = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STUDIO_DOMAIN_REQUEST_EVENT, {
    detail: {
      domain: normalizeStudioDomain(domain),
      createNew: options.createNew === true,
    },
  }));
}

export function publishStudioDomainState(domain) {
  if (typeof window === 'undefined') return;
  const normalized = normalizeStudioDomain(domain);
  // Domain is React/session state. Expose that state directly for scoped CSS and
  // browser contracts instead of asking a MutationObserver to infer it later.
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.quantoraDomain = normalized || '';
  }
  window.dispatchEvent(new CustomEvent(STUDIO_DOMAIN_STATE_EVENT, {
    detail: { domain: normalized },
  }));
}
