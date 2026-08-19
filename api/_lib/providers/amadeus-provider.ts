import type {
  AttractionOffer,
  AttractionSearchInput,
  FlightOffer,
  FlightSearchInput,
  HotelOffer,
  HotelSearchInput,
  PlaceResolution,
  TravelProvider,
} from '../travel-contracts.js';
import { fetchWithDeadline, providerJson, TravelProviderError } from '../travel-provider-errors.js';

const AMADEUS_AUTH_TIMEOUT_MS = 4_000;
const AMADEUS_SEARCH_TIMEOUT_MS = 6_000;

let tokenCache: { token: string; expiresAt: number; cacheKey: string } | null = null;

function credentials() {
  return {
    key: String(process.env.AMADEUS_API_KEY || '').trim(),
    secret: String(process.env.AMADEUS_API_SECRET || '').trim(),
  };
}

function baseUrl(): string {
  return String(process.env.AMADEUS_ENVIRONMENT || '').toLowerCase() === 'production'
    ? 'https://api.amadeus.com'
    : 'https://test.api.amadeus.com';
}

function configured(): boolean {
  const { key, secret } = credentials();
  return Boolean(key && secret);
}

async function accessToken(): Promise<string> {
  const { key, secret } = credentials();
  if (!key || !secret) {
    throw new TravelProviderError('amadeus', 'unavailable', 'Amadeus API key/secret are not configured.');
  }

  const cacheKey = `${baseUrl()}:${key}`;
  if (tokenCache && tokenCache.cacheKey === cacheKey && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: key,
    client_secret: secret,
  });
  const response = await fetchWithDeadline(
    'amadeus',
    `${baseUrl()}/v1/security/oauth2/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    AMADEUS_AUTH_TIMEOUT_MS,
  );
  const payload = await providerJson('amadeus', response);
  const token = String(payload?.access_token || '').trim();
  if (!token) {
    throw new TravelProviderError('amadeus', 'unavailable', 'Amadeus authorization did not return an access token.');
  }
  const expiresIn = Math.max(60, Number(payload?.expires_in) || 1_799);
  tokenCache = {
    token,
    cacheKey,
    expiresAt: Date.now() + expiresIn * 1_000,
  };
  return token;
}

async function amadeusGet(path: string, params: Record<string, string | number | undefined>): Promise<any> {
  const token = await accessToken();
  const url = new URL(`${baseUrl()}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetchWithDeadline(
    'amadeus',
    url.toString(),
    { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    AMADEUS_SEARCH_TIMEOUT_MS,
  );
  return providerJson('amadeus', response);
}

function parseAmount(value: unknown): number | null {
  const amount = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(amount) ? amount : null;
}

function normalizeFlightOffer(offer: any, carriers: Record<string, string>): FlightOffer | null {
  const amount = parseAmount(offer?.price?.grandTotal ?? offer?.price?.total);
  const currency = String(offer?.price?.currency || '').trim();
  if (!offer?.id || amount === null || !currency) return null;

  const itineraries = Array.isArray(offer?.itineraries) ? offer.itineraries : [];
  const segments = itineraries.flatMap((itinerary: any) =>
    (Array.isArray(itinerary?.segments) ? itinerary.segments : []).map((segment: any) => {
      const code = String(segment?.carrierCode || '').trim() || null;
      return {
        origin: String(segment?.departure?.iataCode || ''),
        destination: String(segment?.arrival?.iataCode || ''),
        departingAt: segment?.departure?.at || null,
        arrivingAt: segment?.arrival?.at || null,
        carrierName: code ? carriers[code] || null : null,
        carrierCode: code,
        flightNumber: code && segment?.number ? `${code}${segment.number}` : null,
      };
    }),
  );

  return {
    id: String(offer.id),
    provider: 'amadeus',
    totalAmount: amount,
    currency,
    direct: itineraries.every((itinerary: any) => Array.isArray(itinerary?.segments) && itinerary.segments.length === 1),
    duration: itineraries[0]?.duration || null,
    segments,
  };
}

export const amadeusProvider: TravelProvider = {
  name: 'amadeus',

  isConfigured() {
    return configured();
  },

  async resolvePlace(query: string): Promise<PlaceResolution | null> {
    if (!configured()) return null;
    const clean = String(query || '').trim();
    if (!clean) return null;

    const payload = await amadeusGet('/v1/reference-data/locations', {
      subType: 'AIRPORT,CITY',
      keyword: clean,
      'page[limit]': 10,
      view: 'LIGHT',
    });
    const places = Array.isArray(payload?.data) ? payload.data : [];
    if (!places.length) return null;

    const normalized = clean.toLowerCase();
    const exact = places.find((place: any) =>
      String(place?.iataCode || '').toLowerCase() === normalized ||
      String(place?.name || '').toLowerCase() === normalized,
    );
    const place = exact || places[0];
    const iataCode = String(place?.iataCode || '').trim().toUpperCase();
    if (!iataCode) return null;

    return {
      provider: 'amadeus',
      name: String(place?.name || clean),
      iataCode,
      type: String(place?.subType || '').toUpperCase() === 'CITY' ? 'city' : 'airport',
      countryCode: place?.address?.countryCode || null,
      latitude: typeof place?.geoCode?.latitude === 'number' ? place.geoCode.latitude : null,
      longitude: typeof place?.geoCode?.longitude === 'number' ? place.geoCode.longitude : null,
    };
  },

  async searchFlights(input: FlightSearchInput & { originCode: string; destinationCode: string }): Promise<FlightOffer[]> {
    if (!configured()) {
      throw new TravelProviderError('amadeus', 'unavailable', 'Amadeus is not configured.');
    }
    const payload = await amadeusGet('/v2/shopping/flight-offers', {
      originLocationCode: input.originCode,
      destinationLocationCode: input.destinationCode,
      departureDate: input.departureDate,
      returnDate: input.returnDate || undefined,
      adults: Math.min(9, Math.max(1, Number(input.adults) || 1)),
      travelClass: (input.cabinClass || 'economy').toUpperCase(),
      currencyCode: input.currency || undefined,
      max: 10,
    });
    const carriers = payload?.dictionaries?.carriers || {};
    const offers = Array.isArray(payload?.data) ? payload.data : [];
    return offers
      .map((offer: any) => normalizeFlightOffer(offer, carriers))
      .filter((offer: FlightOffer | null): offer is FlightOffer => Boolean(offer))
      .sort((a: FlightOffer, b: FlightOffer) => a.totalAmount - b.totalAmount)
      .slice(0, 8);
  },

  async searchHotels(input: HotelSearchInput & { location: PlaceResolution }): Promise<HotelOffer[]> {
    if (!configured()) {
      throw new TravelProviderError('amadeus', 'unavailable', 'Amadeus is not configured.');
    }

    const list = await amadeusGet('/v1/reference-data/locations/hotels/by-city', {
      cityCode: input.location.iataCode,
      radius: Math.min(100, Math.max(1, Number(input.radiusKm) || 10)),
      radiusUnit: 'KM',
    });
    const hotelRows = Array.isArray(list?.data) ? list.data.slice(0, 20) : [];
    const hotelIds = hotelRows.map((row: any) => row?.hotelId).filter(Boolean);
    if (!hotelIds.length) return [];
    const hotelById = new Map(hotelRows.map((row: any) => [String(row.hotelId), row]));

    const offersPayload = await amadeusGet('/v3/shopping/hotel-offers', {
      hotelIds: hotelIds.join(','),
      adults: Math.min(9, Math.max(1, Number(input.adults) || 1)),
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      roomQuantity: Math.max(1, Number(input.rooms) || 1),
      currency: input.currency || undefined,
      bestRateOnly: 'true',
    });
    const rows = Array.isArray(offersPayload?.data) ? offersPayload.data : [];
    return rows
      .map((row: any): HotelOffer | null => {
        const offer = Array.isArray(row?.offers) ? row.offers[0] : null;
        const amount = parseAmount(offer?.price?.total);
        const currency = String(offer?.price?.currency || '').trim();
        const hotelId = String(row?.hotel?.hotelId || row?.hotel?.hotelId || '').trim();
        if (!hotelId || amount === null || !currency) return null;
        const listRow: any = hotelById.get(hotelId) || {};
        const address = listRow?.address || {};
        const geo = row?.hotel?.latitude != null
          ? { latitude: row.hotel.latitude, longitude: row.hotel.longitude }
          : listRow?.geoCode || {};
        return {
          id: String(offer?.id || hotelId),
          provider: 'amadeus',
          name: String(row?.hotel?.name || listRow?.name || hotelId),
          totalAmount: amount,
          currency,
          rating: null,
          reviewScore: null,
          address: [address?.lines?.[0], address?.cityName, address?.postalCode, address?.countryCode].filter(Boolean).join(', ') || null,
          latitude: typeof geo?.latitude === 'number' ? geo.latitude : null,
          longitude: typeof geo?.longitude === 'number' ? geo.longitude : null,
        };
      })
      .filter((hotel: HotelOffer | null): hotel is HotelOffer => Boolean(hotel))
      .sort((a: HotelOffer, b: HotelOffer) => a.totalAmount - b.totalAmount)
      .slice(0, 10);
  },

  async searchAttractions(input: AttractionSearchInput & { location: PlaceResolution }): Promise<AttractionOffer[]> {
    if (!configured()) {
      throw new TravelProviderError('amadeus', 'unavailable', 'Amadeus is not configured.');
    }
    const { latitude, longitude } = input.location;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new TravelProviderError('amadeus', 'unavailable', 'Amadeus activities search requires resolved coordinates.');
    }

    const payload = await amadeusGet('/v1/shopping/activities', {
      latitude,
      longitude,
      radius: Math.min(20, Math.max(1, Number(input.radiusKm) || 10)),
    });
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.slice(0, 12).map((row: any): AttractionOffer => ({
      id: String(row?.id || row?.name || 'activity'),
      provider: 'amadeus',
      name: String(row?.name || 'Activity'),
      description: row?.shortDescription || row?.description || null,
      price: parseAmount(row?.price?.amount),
      currency: row?.price?.currencyCode || null,
      bookingLink: row?.bookingLink || null,
      latitude: typeof row?.geoCode?.latitude === 'number' ? row.geoCode.latitude : null,
      longitude: typeof row?.geoCode?.longitude === 'number' ? row.geoCode.longitude : null,
    }));
  },
};

export function resetAmadeusTokenCacheForTests() {
  tokenCache = null;
}
