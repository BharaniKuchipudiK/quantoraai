const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const PRODUCT_TELEMETRY_EVENT = Object.freeze({
  VISIT: 'quantora_visit',
  FIRST_WORKSPACE_OPEN: 'quantora_first_workspace_open',
});

export const PRODUCT_TELEMETRY_STORAGE = Object.freeze({
  LAST_VISIT_DAY: 'quantora_product_last_visit_day',
  FIRST_WORKSPACE_OPEN: 'quantora_product_first_workspace_open',
  PAGE_EMITTED: 'quantora_product_page_emitted',
});

export function shouldCollectProductTelemetry(locationLike) {
  const hostname = String(locationLike?.hostname || '').trim().toLowerCase();
  return Boolean(hostname) && !LOCAL_HOSTS.has(hostname);
}

function localDayStamp(now = Date.now()) {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function classifyVisit(storage, now = Date.now()) {
  const today = localDayStamp(now);
  let previous = '';
  try {
    previous = String(storage?.getItem?.(PRODUCT_TELEMETRY_STORAGE.LAST_VISIT_DAY) || '');
    storage?.setItem?.(PRODUCT_TELEMETRY_STORAGE.LAST_VISIT_DAY, today);
  } catch {
    return 'unknown';
  }

  if (!previous) return 'first_seen';
  if (previous === today) return 'same_day';
  return 'returning';
}

export function claimPageTelemetry(storage) {
  try {
    if (storage?.getItem?.(PRODUCT_TELEMETRY_STORAGE.PAGE_EMITTED) === '1') return false;
    storage?.setItem?.(PRODUCT_TELEMETRY_STORAGE.PAGE_EMITTED, '1');
    return true;
  } catch {
    // If session storage is blocked, permit one best-effort emission. The
    // component still has its React lifecycle guard; this path only loses the
    // StrictMode duplicate defence in unusually locked-down browsers.
    return true;
  }
}

export function claimFirstWorkspaceOpen(storage) {
  try {
    if (storage?.getItem?.(PRODUCT_TELEMETRY_STORAGE.FIRST_WORKSPACE_OPEN) === '1') return false;
    storage?.setItem?.(PRODUCT_TELEMETRY_STORAGE.FIRST_WORKSPACE_OPEN, '1');
    return true;
  } catch {
    return false;
  }
}

export function productTelemetrySurface(pathname) {
  const path = String(pathname || '/').toLowerCase();
  if (path === '/studio' || path.startsWith('/studio/')) return 'studio';
  return 'app';
}

export function authStateFromSession(payload) {
  if (payload && typeof payload === 'object' && payload.user) return 'signed_in';
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'user')) return 'signed_out';
  return 'unknown';
}

const VISIT_TYPES = new Set(['first_seen', 'same_day', 'returning', 'unknown']);
const AUTH_STATES = new Set(['signed_in', 'signed_out', 'unknown']);
const SURFACES = new Set(['app', 'studio']);

/**
 * Build only low-cardinality, non-identifying event data.
 *
 * Do not add email, name, account id, prompt text, URL query strings or any
 * other learner/user content here. Vercel Analytics is for aggregate product
 * telemetry; Quantora's authenticated truth stays in its existing stores.
 */
export function buildVisitEventData({ authState, visitType, surface }) {
  return {
    auth_state: AUTH_STATES.has(authState) ? authState : 'unknown',
    visit_type: VISIT_TYPES.has(visitType) ? visitType : 'unknown',
    surface: SURFACES.has(surface) ? surface : 'app',
  };
}

export function buildFirstWorkspaceEventData(surface) {
  return {
    surface: SURFACES.has(surface) ? surface : 'app',
  };
}
