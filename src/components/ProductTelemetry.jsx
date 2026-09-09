import { useEffect } from 'react';
import { track } from '@vercel/analytics';
import {
  PRODUCT_TELEMETRY_EVENT,
  buildFirstWorkspaceEventData,
  buildVisitEventData,
  claimFirstWorkspaceOpen,
  classifyVisit,
  productTelemetrySurface,
  shouldCollectProductTelemetry,
} from '../lib/product-telemetry.js';

// One module instance belongs to one loaded document. This blocks React
// StrictMode's development remount without suppressing a later real navigation
// or reload in the same browser tab (sessionStorage would incorrectly do so).
let claimedThisDocument = false;

/**
 * Aggregate product telemetry that complements the existing <Analytics /> page
 * view stream. This component intentionally owns no product state and sends no
 * identity or learner content.
 *
 * The custom event stream is release-controlled server-side by Vercel Flags.
 * The browser never receives the SDK key, targeting rules or raw identity; it
 * gets only an allow-listed boolean plus the coarse authenticated bit needed by
 * the event label. If flag evaluation is unavailable, this observer fails
 * closed while Vercel's existing page-view Analytics continues normally.
 */
export default function ProductTelemetry() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!shouldCollectProductTelemetry(window.location)) return undefined;
    if (claimedThisDocument) return undefined;
    claimedThisDocument = true;

    const visitType = classifyVisit(window.localStorage);
    const surface = productTelemetrySurface(window.location.pathname);

    const emit = (eventName, data) => {
      try {
        track(eventName, data);
      } catch {
        // Product telemetry is observability only. It must never interrupt the
        // user journey if analytics is blocked or temporarily unavailable.
      }
    };

    fetch('/api/release-flags', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.flags?.productTelemetryV1 !== true) return;

        const authState = payload?.audience?.authenticated === true
          ? 'signed_in'
          : 'signed_out';

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
        // Release flags fail closed. Default Vercel page analytics remain
        // active; only these optional product custom events stay disabled.
      });

    return undefined;
  }, []);

  return null;
}
