import React, { useMemo, useState } from 'react';

import { deriveTravelBrief } from '../lib/travel-board-brief.js';

/**
 * One trip board: what we know, chips to move the plan, live flights and
 * places on this screen. Does not book. Not a coding workspace.
 *
 * The board reads the trip itself rather than being handed a brief. It loads
 * on demand, so keeping that logic in here is what keeps a travel-only surface
 * out of the desk entry chunk every other desk downloads.
 */
export default function TravelTripBoard({
  messages,
  isLight,
  textColor,
  subtextColor,
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
        setNote(result.source ? `Live from ${result.source}. We do not book from here.` : 'We do not book from here.');
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

  const chip = (label, onClick, enabled = true) => (
    <button
      type="button"
      disabled={!enabled || Boolean(busy)}
      onClick={onClick}
      style={{
        border: isLight ? '1px solid #fdba74' : '1px solid rgba(249,115,22,0.45)',
        background: isLight ? '#fff7ed' : 'rgba(249,115,22,0.12)',
        color: textColor,
        borderRadius: '999px',
        padding: '7px 12px',
        fontSize: '0.78rem',
        fontWeight: 700,
        cursor: enabled && !busy ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.45,
      }}
    >
      {busy && label.includes('live flights') ? 'Searching flights…' : busy && label.includes('places') ? 'Searching stays…' : label}
    </button>
  );

  return (
    <div
      data-quantora-travel-board="true"
      data-quantora-workspace-capabilities="travel"
      style={{
        margin: '0 auto 16px auto',
        maxWidth: '720px',
        textAlign: 'left',
        padding: '14px 16px',
        borderRadius: '16px',
        background: isLight ? '#ffffff' : 'rgba(15,23,42,0.72)',
        border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.2)',
      }}
    >
      <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: subtextColor }}>
        Your trip — one screen
      </div>
      <div style={{ marginTop: '8px', fontSize: '0.92rem', fontWeight: 700, color: textColor }}>
        {brief.destinationLabel || 'Where to?'}
        {brief.origin && brief.destination ? ` · ${brief.origin} → ${brief.destination}` : ''}
      </div>
      <div style={{ marginTop: '4px', fontSize: '0.8rem', color: subtextColor }}>
        {brief.departureDate ? `Depart ${brief.departureDate}` : 'Dates not set yet'}
        {brief.returnDate ? ` · Return ${brief.returnDate}` : ''}
      </div>
      <div style={{ marginTop: '8px', fontSize: '0.8rem', fontWeight: 600, color: isLight ? '#c2410c' : '#fdba74' }}>
        Next: {brief.next}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
        {chip('Flights', () => runSearch('flights'), brief.canSearchFlights)}
        {chip('Hotels', () => runSearch('hotels'), brief.canSearchHotels)}
        {chip('Attractions', () => onAsk?.('Suggest attractions that fit this trip. Keep it on this board — not a website.'), true)}
        {chip('Itineraries', () => onAsk?.('Draft a balanced day-by-day itinerary for this trip.'), true)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
        {chip('I am flying from…', () => onAsk?.('I am flying from '), true)}
        {chip('My dates are…', () => onAsk?.('My travel dates are '), true)}
        {chip('Show live flights', () => runSearch('flights'), brief.canSearchFlights)}
        {chip('Show places to stay', () => runSearch('hotels'), brief.canSearchHotels)}
      </div>
      {error ? (
        <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#ef4444' }}>{error}</div>
      ) : null}
      {note ? (
        <div style={{ marginTop: '8px', fontSize: '0.75rem', color: subtextColor }}>{note}</div>
      ) : null}
      {flights.length > 0 ? (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {flights.map((flight) => (
            <div
              key={flight.id || `${flight.airline}-${flight.departure}`}
              style={{
                padding: '10px 12px',
                borderRadius: '12px',
                border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.2)',
              }}
            >
              <div style={{ fontWeight: 700, color: textColor, fontSize: '0.85rem' }}>
                {flight.airline || 'Flight'} {flight.flightNumber || ''}
              </div>
              <div style={{ fontSize: '0.75rem', color: subtextColor, marginTop: '2px' }}>
                {flight.direct === true ? 'Direct' : flight.direct === false ? 'Connecting' : ''}
                {flight.price ? ` · ${flight.currency || ''} ${flight.price}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {hotels.length > 0 ? (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {hotels.slice(0, 6).map((hotel) => (
            <div
              key={hotel.id || hotel.name}
              style={{
                padding: '10px 12px',
                borderRadius: '12px',
                border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(148,163,184,0.2)',
              }}
            >
              <div style={{ fontWeight: 700, color: textColor, fontSize: '0.85rem' }}>
                {hotel.website || hotel.googleMapsUrl ? (
                  <a href={hotel.website || hotel.googleMapsUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                    {hotel.name || 'Place'}
                  </a>
                ) : (hotel.name || 'Place')}
              </div>
              <div style={{ fontSize: '0.75rem', color: subtextColor, marginTop: '2px' }}>
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
