import React, { useEffect, useMemo, useState } from 'react';

import { deriveTravelBrief } from '../lib/travel-board-brief.js';
import {
  blockedReason,
  chipEnabled,
  flightSourceNote,
} from '../lib/travel-provider-notice.js';

/**
 * One trip board: what we know, chips to move the plan, live flights and
 * places on this screen. Does not book. Not a coding workspace.
 *
 * The board reads the trip itself rather than being handed a brief. It loads
 * on demand, so keeping that logic in here is what keeps a travel-only surface
 * out of the desk entry chunk every other desk downloads.
 *
 * SIZE IS A FEATURE. The first shipped version spent six stacked rows saying
 * very little: an uppercase eyebrow, the destination, "Dates not set yet", two
 * wrapped lines of amber prose, then two fixed chip rows in which "Flights" and
 * "Show live flights" ran the identical search. It pushed the conversation off
 * screen on a surface whose whole claim is "one screen". Everything here is
 * therefore conditional: a fact that is known is shown inline, a question with
 * no answer left to give is not asked, and a chip that would fill a gap that
 * does not exist is not rendered. A trip that is fully specified collapses to a
 * single line of facts and one row of chips.
 *
 * Monochrome (Quantora design system), which makes Travel the last workspace
 * off the coloured palette. The amber accent and the isLight/textColor/
 * subtextColor props are gone: the tokens in quantora-monochrome.css flip on
 * [data-theme] already, so a component that asks its parent what colour to be
 * is both redundant and a way for a stray shade to re-enter. Hierarchy is type,
 * space and border; chips invert on hover as the system's substitute for an
 * accent.
 */
export default function TravelTripBoard({
  messages,
  signedIn,
  onAsk,
  onRequireAuth,
}) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [flights, setFlights] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [note, setNote] = useState('');

  const brief = useMemo(() => deriveTravelBrief({ messages }), [messages]);
  // null until the health endpoint answers. A diagnostic that fails must not
  // dark a working board, so unknown stays permissive.
  const [ready, setReady] = useState({ flights: null, stays: null });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/inference-health', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((health) => {
        if (cancelled || !health) return;
        setReady({
          flights: typeof health.flightsConfigured === 'boolean' ? health.flightsConfigured : null,
          stays: typeof health.placesConfigured === 'boolean' ? health.placesConfigured : null,
        });
      })
      .catch(() => { /* unknown readiness is the safe default */ });
    return () => { cancelled = true; };
  }, []);

  const canFlights = chipEnabled({ tripReady: brief.canSearchFlights, configured: ready.flights });
  const canStays = chipEnabled({ tripReady: brief.canSearchHotels, configured: ready.stays });
  const providerBlocked = blockedReason({ kind: 'flights', tripReady: brief.canSearchFlights, configured: ready.flights })
    || blockedReason({ kind: 'hotels', tripReady: brief.canSearchHotels, configured: ready.stays });

  const runSearch = async (kind) => {
    if (!signedIn) {
      onRequireAuth?.();
      onAsk?.(kind === 'flights'
        ? 'Please search live flights for this trip once I am signed in.'
        : 'Please search places to stay for this trip once I am signed in.');
      return;
    }
    setBusy(kind);
    setError('');
    try {
      const response = await fetch('/api/travel-search', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'flights'
          ? {
            kind: 'flights',
            origin: brief.origin,
            destination: brief.destination,
            departureDate: brief.departureDate,
            returnDate: brief.returnDate,
          }
          : {
            kind: 'hotels',
            location: brief.destinationLabel || brief.destination,
          }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Search is unavailable right now.');
        return;
      }
      const result = data.result || {};
      if (result.status !== 'success') {
        setError(result.message || result.providerMessage || 'The live provider did not return results.');
        return;
      }
      if (kind === 'flights') {
        setFlights(Array.isArray(result.flights) ? result.flights : []);
        // Never a live claim over sandbox fares: the mode decides.
        setNote(flightSourceNote(data.providerMode, result.source));
      } else {
        setHotels(Array.isArray(result.hotels) ? result.hotels : []);
        setNote(result.searchContext?.note || 'Ratings are from Google, not official hotel stars. We do not book from here.');
      }
    } catch {
      setError('Search could not run. Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  // Nothing to show until the traveller has actually said something.
  if (!brief.active) return null;

  const chip = (label, onClick, { enabled = true, busyKey = null } = {}) => (
    <button
      key={label}
      type="button"
      disabled={!enabled || Boolean(busy)}
      onClick={onClick}
      className="q-mono-control q-mono-chip"
      style={{
        border: '1px solid var(--q-border)',
        background: 'var(--q-paper)',
        color: 'var(--q-ink)',
        borderRadius: '999px',
        padding: '6px 11px',
        fontSize: '0.76rem',
        fontWeight: 700,
        cursor: enabled && !busy ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.4,
      }}
    >
      {busyKey && busy === busyKey ? 'Searching…' : label}
    </button>
  );

  /*
   * One line of facts. Anything unknown is simply absent — "Dates not set yet"
   * spent a whole row restating what the missing date chip already says.
   */
  const facts = [
    brief.destinationLabel || brief.destination || '',
    brief.origin && brief.destination ? `${brief.origin} → ${brief.destination}` : '',
    brief.departureDate
      ? (brief.returnDate ? `${brief.departureDate} – ${brief.returnDate}` : brief.departureDate)
      : '',
  ].filter(Boolean);

  /*
   * With nothing known, the question IS the heading. Carrying a placeholder
   * headline as well ("Where to?" over "Where are you heading?") asks the same
   * thing twice in two type sizes, which is how a board earns a row it has not
   * paid for.
   */
  const heading = facts.length ? facts.join('  ·  ') : (brief.next || 'Where to?');
  const subline = facts.length ? brief.next : '';

  const results = flights.length > 0 || hotels.length > 0;

  return (
    <div
      data-quantora-travel-board="true"
      data-quantora-workspace-capabilities="travel"
      style={{
        marginTop: '10px',
        border: '1px solid var(--q-border)',
        borderRadius: '14px',
        padding: '12px 14px',
        textAlign: 'left',
        background: 'var(--q-paper)',
        color: 'var(--q-ink)',
      }}
    >
      <div style={{ fontSize: '0.86rem', fontWeight: 800, letterSpacing: '0.01em' }}>
        {heading}
      </div>
      {subline ? (
        <div style={{ fontSize: '0.74rem', fontWeight: 400, marginTop: '3px', lineHeight: 1.5 }}>
          {subline}
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '7px',
          borderTop: '1px solid var(--q-border)',
          marginTop: '10px',
          paddingTop: '10px',
        }}
      >
        {chip('Flights', () => runSearch('flights'), { enabled: canFlights, busyKey: 'flights' })}
        {chip('Stays', () => runSearch('hotels'), { enabled: canStays, busyKey: 'hotels' })}
        {chip('Attractions', () => onAsk?.('Suggest attractions that fit this trip. Keep it on this board — not a website.'))}
        {chip('Itinerary', () => onAsk?.('Draft a balanced day-by-day itinerary for this trip.'))}
        {/*
          Only the gaps that are actually open. Offering "I am flying from…"
          to somebody who already said SIN is the same dead control as a search
          that cannot run, just quieter about it.
        */}
        {brief.missing.includes('origin') || brief.missing.includes('destination')
          ? chip('Route…', () => onAsk?.('I am flying from '))
          : null}
        {brief.missing.includes('departureDate')
          ? chip('Dates…', () => onAsk?.('My travel dates are '))
          : null}
      </div>
      {providerBlocked ? (
        <div style={{ marginTop: '9px', fontSize: '0.74rem' }}>{providerBlocked}</div>
      ) : null}
      {error ? (
        <div style={{ marginTop: '9px', fontSize: '0.76rem', fontWeight: 700 }}>{error}</div>
      ) : null}
      {note ? (
        <div style={{ marginTop: '8px', fontSize: '0.72rem' }}>{note}</div>
      ) : null}
      {results ? (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {flights.map((flight) => (
            <div
              key={flight.id || `${flight.airline}-${flight.departure}`}
              style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--q-border)' }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                {flight.airline || 'Flight'} {flight.flightNumber || ''}
              </div>
              <div style={{ fontSize: '0.73rem', fontWeight: 400, marginTop: '2px' }}>
                {flight.direct === true ? 'Direct' : flight.direct === false ? 'Connecting' : ''}
                {flight.price ? ` · ${flight.currency || ''} ${flight.price}` : ''}
              </div>
            </div>
          ))}
          {hotels.slice(0, 6).map((hotel) => (
            <div
              key={hotel.id || hotel.name}
              style={{ padding: '8px 10px', borderRadius: '10px', border: '1px solid var(--q-border)' }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                {hotel.website || hotel.googleMapsUrl ? (
                  <a href={hotel.website || hotel.googleMapsUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                    {hotel.name || 'Place'}
                  </a>
                ) : (hotel.name || 'Place')}
              </div>
              <div style={{ fontSize: '0.73rem', fontWeight: 400, marginTop: '2px' }}>
                {hotel.userRating ? `★ ${hotel.userRating}/5` : ''}
                {hotel.userRatingCount ? ` (${hotel.userRatingCount})` : ''}
                {hotel.address ? ` · ${hotel.address}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
