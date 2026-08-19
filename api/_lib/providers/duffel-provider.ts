import type {
  FlightOffer,
  FlightSearchInput,
  HotelOffer,
  HotelSearchInput,
  PlaceResolution,
  TravelProvider,
} from '../travel-contracts.js';
import { fetchWithDeadline, providerJson, TravelProviderError } from '../travel-provider-errors.js';

const DUFFEL_BASE_URL = 'https://api.duffel.com';
const DUFFEL_VERSION = 'v2';
const DUFFEL_PLACE_TIMEOUT_MS = 4_000;
const DUFFEL_FLIGHT_HTTP_TIMEOUT_MS = 7_500;
const DUFFEL_SUPPLIER_TIMEOUT_MS = 5_500;
const DUFFEL_STAYS_TIMEOUT_MS = 8_000;

function token(): string {
  return String(process.env.DUFFEL_API_KEY || '').trim();
}

function headers(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip',
    'Duffel-Version': DUFFEL_VERSION,
    Authorization: `Bearer ${token()}`,
  };
}

function normalizedText(value: unknown): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function asNumber(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function addressOf(accommodation: any): string | null {
  const address = accommodation?.location?.address || accommodation?.address;
  if (!address) return null;
  return [address.line_one, address.line_two, address.city_name, address.region, address.postal_code, address.country_code]
    .filter(Boolean)
    .join(', ') || null;
}

function normalizeDuffelOffer(offer: any): FlightOffer | null {
  const amount = asNumber(offer?.total_amount);
  const currency = String(offer?.total_currency || '').trim();
  if (!offer?.id || amount === null || !currency) return null;

  const slices = Array.isArray(offer?.slices) ? offer.slices : [];
  const segments = slices.flatMap((slice: any) =>
    (Array.isArray(slice?.segments) ? slice.segments : []).map((segment: any) => {
      const carrier = segment?.operating_carrier || segment?.marketing_carrier || null;
      const code = carrier?.iata_code || null;
      const number = segment?.operating_carrier_flight_number || segment?.marketing_carrier_flight_number || null;
      return {
        origin: segment?.origin?.iata_code || '',
        destination: segment?.destination?.iata_code || '',
        departingAt: segment?.departing_at || null,
        arrivingAt: segment?.arriving_at || null,
        carrierName: carrier?.name || null,
        carrierCode: code,
        flightNumber: code && number ? `${code}${number}` : null,
      };
    }),
  );

  return {
    id: String(offer.id),
    provider: 'duffel',
    totalAmount: amount,
    currency,
    direct: slices.every((slice: any) => Array.isArray(slice?.segments) && slice.segments.length === 1),
    duration: slices[0]?.duration || null,
    expiresAt: offer?.expires_at || null,
    segments,
  };
}

export const duffelProvider: TravelProvider = {
  name: 'duffel',

  isConfigured() {
    return Boolean(token());
  },

  async resolvePlace(query: string): Promise<PlaceResolution | null> {
    if (!token()) return null;
    const clean = String(query || '').trim();
    if (!clean) return null;

    const response = await fetchWithDeadline(
      'duffel',
      `${DUFFEL_BASE_URL}/places/suggestions?query=${encodeURIComponent(clean)}`,
      { method: 'GET', headers: headers() },
      DUFFEL_PLACE_TIMEOUT_MS,
    );
    const payload = await providerJson('duffel', response);
    const places = Array.isArray(payload?.data) ? payload.data : [];
    if (!places.length) return null;

    const normalizedQuery = normalizedText(clean);
    const isIata = /^[a-z]{3}$/i.test(clean);
    const exact = places.find((place: any) => {
      const iataCode = String(place?.iata_code || '').trim().toLowerCase();
      const iataCityCode = String(place?.iata_city_code || '').trim().toLowerCase();
      if (isIata && (iataCode === normalizedQuery || iataCityCode === normalizedQuery)) return true;
      return normalizedText(place?.name) === normalizedQuery || normalizedText(place?.city_name) === normalizedQuery;
    });

    // Never trust the first fuzzy result for a natural-language place. A wrong
    // airport is worse than asking the traveller to clarify.
    if (!exact) return null;

    const iataCode = String(exact?.iata_code || exact?.iata_city_code || '').trim().toUpperCase();
    if (!iataCode) return null;

    return {
      provider: 'duffel',
      name: String(exact?.name || exact?.city_name || clean),
      iataCode,
      type: exact?.type === 'city' ? 'city' : 'airport',
      countryCode: exact?.iata_country_code || null,
      latitude: typeof exact?.latitude === 'number' ? exact.latitude : null,
      longitude: typeof exact?.longitude === 'number' ? exact.longitude : null,
    };
  },

  async searchFlights(input: FlightSearchInput & { originCode: string; destinationCode: string }): Promise<FlightOffer[]> {
    if (!token()) {
      throw new TravelProviderError('duffel', 'unavailable', 'Duffel is not configured.');
    }

    const slices: any[] = [{
      origin: input.originCode,
      destination: input.destinationCode,
      departure_date: input.departureDate,
    }];
    if (input.returnDate) {
      slices.push({
        origin: input.destinationCode,
        destination: input.originCode,
        departure_date: input.returnDate,
      });
    }

    const adults = Math.min(9, Math.max(1, Number(input.adults) || 1));
    const response = await fetchWithDeadline(
      'duffel',
      `${DUFFEL_BASE_URL}/air/offer_requests?return_offers=true&supplier_timeout=${DUFFEL_SUPPLIER_TIMEOUT_MS}`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          data: {
            slices,
            passengers: Array.from({ length: adults }, () => ({ type: 'adult' })),
            cabin_class: input.cabinClass || 'economy',
          },
        }),
      },
      DUFFEL_FLIGHT_HTTP_TIMEOUT_MS,
    );
    const payload = await providerJson('duffel', response);
    const offers = Array.isArray(payload?.data?.offers) ? payload.data.offers : [];
    return offers
      .map(normalizeDuffelOffer)
      .filter((offer: FlightOffer | null): offer is FlightOffer => Boolean(offer))
      .sort((a: FlightOffer, b: FlightOffer) => a.totalAmount - b.totalAmount)
      .slice(0, 8);
  },

  async searchHotels(input: HotelSearchInput & { location: PlaceResolution }): Promise<HotelOffer[]> {
    if (!token()) {
      throw new TravelProviderError('duffel', 'unavailable', 'Duffel is not configured.');
    }
    const { latitude, longitude } = input.location;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new TravelProviderError('duffel', 'unavailable', 'Duffel Stays requires resolved geographic coordinates.');
    }

    const adults = Math.min(9, Math.max(1, Number(input.adults) || 1));
    const rooms = Math.min(adults, Math.max(1, Number(input.rooms) || 1));
    const response = await fetchWithDeadline(
      'duffel',
      `${DUFFEL_BASE_URL}/stays/search`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          data: {
            location: {
              radius: Math.min(100, Math.max(1, Number(input.radiusKm) || 10)),
              geographic_coordinates: { latitude, longitude },
            },
            check_in_date: input.checkInDate,
            check_out_date: input.checkOutDate,
            guests: Array.from({ length: adults }, () => ({ type: 'adult' })),
            rooms,
          },
        }),
      },
      DUFFEL_STAYS_TIMEOUT_MS,
    );
    const payload = await providerJson('duffel', response);
    const results = Array.isArray(payload?.data?.results) ? payload.data.results : [];
    return results
      .map((result: any): HotelOffer | null => {
        const accommodation = result?.accommodation || {};
        const amount = asNumber(result?.cheapest_rate_total_amount);
        const currency = String(result?.cheapest_rate_currency || '').trim();
        if (!result?.id || !accommodation?.name || amount === null || !currency) return null;
        const coords = accommodation?.location?.geographic_coordinates || {};
        return {
          id: String(result.id),
          provider: 'duffel',
          name: String(accommodation.name),
          totalAmount: amount,
          currency,
          rating: typeof accommodation?.rating === 'number' ? accommodation.rating : null,
          reviewScore: typeof accommodation?.review_score === 'number' ? accommodation.review_score : null,
          address: addressOf(accommodation),
          latitude: typeof coords?.latitude === 'number' ? coords.latitude : null,
          longitude: typeof coords?.longitude === 'number' ? coords.longitude : null,
        };
      })
      .filter((hotel: HotelOffer | null): hotel is HotelOffer => Boolean(hotel))
      .sort((a: HotelOffer, b: HotelOffer) => a.totalAmount - b.totalAmount)
      .slice(0, 10);
  },
};
