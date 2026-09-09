import { useEffect } from 'react';
import { track } from '@vercel/analytics';
import {
  PRODUCT_TELEMETRY_EVENT,
  authStateFromSession,
  buildFirstWorkspaceEventData,
  buildVisitEventData,
  claimFirstWorkspaceOpen,
  claimPageTelemetry,
  classifyVisit,
  productTelemetrySurface,
  shouldCollectProductTelemetry,
} from '../lib/product-telemetry.js';

/**
 * Aggregate product telemetry that complements the existing <Analytics /> page
 * view stream. This component intentionally owns no product state and sends no
 * identity or learner content.
 *
 * Vercel Analytics gives us page/visitor measurement. These two custom events
 * answer the Quantora-specific questions the default stream cannot:
 *   - was this app load signed in or signed out?
 *   - is this browser returning on a later day?
 *   - did a signed-in browser reach the real Studio workspace for the first
 *     time on this device?
 *
 * The auth lookup is read-only and occurs once per non-local page load. We do
 * not use the result as authorization; /api/auth/session remains the authority.
 */
export default function ProductTelemetry() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!shouldCollectProductTelemetry(window.location)) return undefined;
    if (!claimPageTelemetry(window.sessionStorage)) return undefined;

    let cancelled = false;
    const visitType = classifyVisit(window.localStorage);
    const surface = productTelemetrySurface(window.location.pathname);

    const emit = (eventName, data) => {
      if (cancelled) return;
      try {
        track(eventName, data);
      } catch {
        // Product telemetry is observability only. It must never interrupt the
        // user journey if analytics is blocked or temporarily unavailable.
      }
    };

    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const authState = authStateFromSession(payload);
        emit(PRODUCT_TELEMETRY_EVENT.VISIT, buildVisitEventData({
          authState,
          visitType,
          surface,
        }));

        if (
          authState === 'signed_in'
          && surface === 'studio'
          && claimFirstWorkspaceOpen(window.localStorage)
        ) {
          emit(
            PRODUCT_TELEMETRY_EVENT.FIRST_WORKSPACE_OPEN,
            buildFirstWorkspaceEventData(surface),
          );
        }
      })
      .catch(() => {
        emit(PRODUCT_TELEMETRY_EVENT.VISIT, buildVisitEventData({
          authState: 'unknown',
          visitType,
          surface,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
