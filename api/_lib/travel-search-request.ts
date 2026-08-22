type TravelSearchBody = {
  kind?: unknown;
  origin?: unknown;
  destination?: unknown;
  departureDate?: unknown;
  returnDate?: unknown;
  passengers?: unknown;
  location?: unknown;
  destinationLabel?: unknown;
};

type TravelSearchResult =
  | { ok: false; error: string }
  | { ok: true; tool: 'search_flights'; args: { origin: string; destination: string; departureDate: string; returnDate?: string; passengers: number } }
  | { ok: true; tool: 'search_hotels'; args: { location: string } };

export function parseTravelSearchRequest(body: TravelSearchBody = {}): TravelSearchResult {
  const kind = String(body.kind || '').trim().toLowerCase();
  if (kind !== 'flights' && kind !== 'hotels') {
    return { ok: false, error: 'Ask for flights or hotels — we do not book from this board yet.' };
  }
  if (kind === 'flights') {
    const origin = String(body.origin || '').trim().toUpperCase();
    const destination = String(body.destination || '').trim().toUpperCase();
    const departureDate = String(body.departureDate || '').trim();
    const returnDate = String(body.returnDate || '').trim();
    const passengers = Math.min(9, Math.max(1, Number(body.passengers) || 1));
    if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
      return { ok: false, error: 'I need a from-airport and to-airport code, like SIN to DPS.' };
    }
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(departureDate)) {
      return { ok: false, error: 'I need a departure date like 2026-09-12 before I can search live flights.' };
    }
    return {
      ok: true,
      tool: 'search_flights',
      args: {
        origin,
        destination,
        departureDate,
        ...( /^20\d{2}-\d{2}-\d{2}$/.test(returnDate) ? { returnDate } : {}),
        passengers,
      },
    };
  }

  const location = String(body.location || body.destinationLabel || body.destination || '').trim();
  if (location.length < 2) {
    return { ok: false, error: 'Tell me the city or area so I can look up places to stay.' };
  }
  return {
    ok: true,
    tool: 'search_hotels',
    args: { location },
  };
}
