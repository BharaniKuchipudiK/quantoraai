import type {
  AttractionSearchInput,
  AttractionSearchResult,
  FlightSearchInput,
  FlightSearchResult,
  HotelSearchInput,
  HotelSearchResult,
  PlaceResolution,
  TravelProvider,
  TravelProviderAttempt,
  TravelProviderFailure,
} from './travel-contracts.js';
import { TravelProviderError } from './travel-provider-errors.js';
import { duffelProvider } from './providers/duffel-provider.js';
import { amadeusProvider } from './providers/amadeus-provider.js';

export type TravelProviderSet = {
  duffel: TravelProvider;
  amadeus: TravelProvider;
};

const defaultProviders: TravelProviderSet = {
  duffel: duffelProvider,
  amadeus: amadeusProvider,
};

// Provider-neutral aliases for well-known travel regions whose commonly used
// destination name does not match the airport/city name returned by suppliers.
// Keep this list deliberately small and explicit; unknown locations fail closed
// instead of silently accepting a fuzzy provider result.
const TRAVEL_LOCATION_ALIASES: Record<string, string> = {
  'bali': 'DPS',
  'bali indonesia': 'DPS',
  'bali, indonesia': 'DPS',
  'denpasar': 'DPS',
};

function normalizeLocationKey(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function canonicalTravelLocationQuery(query: string): string {
  const clean = String(query || '').trim();
  if (!clean) return clean;
  return TRAVEL_LOCATION_ALIASES[normalizeLocationKey(clean)] || clean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function validIsoDate(value: string | null | undefined): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

function invalid(message: string): TravelProviderFailure {
  return {
    status: 'invalid',
    executed: false,
    reason: 'INVALID_TRAVEL_REQUEST',
    message,
    attempts: [],
  };
}

function unavailable(message: string, attempts: TravelProviderAttempt[]): TravelProviderFailure {
  return {
    status: 'unavailable',
    executed: false,
    reason: 'TRAVEL_PROVIDERS_UNAVAILABLE',
    message,
    attempts,
  };
}

function attemptFromError(provider: TravelProvider, startedAt: number, error: any): TravelProviderAttempt {
  if (error instanceof TravelProviderError) {
    return {
      provider: provider.name,
      outcome: error.kind,
      latencyMs: Date.now() - startedAt,
      detail: error.message,
    };
  }
  return {
    provider: provider.name,
    outcome: 'error',
    latencyMs: Date.now() - startedAt,
    detail: error?.message || String(error),
  };
}

async function resolvePlace(
  query: string,
  providers: TravelProviderSet,
  attempts: TravelProviderAttempt[],
): Promise<PlaceResolution | null> {
  const canonicalQuery = canonicalTravelLocationQuery(query);
  for (const provider of [providers.duffel, providers.amadeus]) {
    if (!provider.isConfigured()) continue;
    const startedAt = Date.now();
    try {
      const place = await provider.resolvePlace(canonicalQuery);
      if (place) {
        attempts.push({
          provider: provider.name,
          outcome: 'success',
          latencyMs: Date.now() - startedAt,
          detail: canonicalQuery === query
            ? `resolved ${query} -> ${place.iataCode}`
            : `resolved ${query} via ${canonicalQuery} -> ${place.iataCode}`,
        });
        return place;
      }
      attempts.push({
        provider: provider.name,
        outcome: 'unavailable',
        latencyMs: Date.now() - startedAt,
        detail: canonicalQuery === query
          ? `no confident place match for ${query}`
          : `no confident place match for ${query} via ${canonicalQuery}`,
      });
    } catch (error: any) {
      attempts.push(attemptFromError(provider, startedAt, error));
    }
  }
  return null;
}

function validateFlightInput(input: FlightSearchInput): TravelProviderFailure | null {
  if (!String(input.origin || '').trim()) return invalid('A flight origin is required.');
  if (!String(input.destination || '').trim()) return invalid('A flight destination is required.');
  if (!validIsoDate(input.departureDate)) return invalid('A valid departure date in YYYY-MM-DD format is required.');
  if (input.departureDate < todayIso()) return invalid('The departure date is in the past. Please choose a future date.');
  if (input.returnDate) {
    if (!validIsoDate(input.returnDate)) return invalid('The return date is invalid.');
    if (input.returnDate < input.departureDate) return invalid('The return date must be on or after the departure date.');
  }
  return null;
}

function validateHotelInput(input: HotelSearchInput): TravelProviderFailure | null {
  if (!String(input.location || '').trim()) return invalid('A hotel destination is required.');
  if (!validIsoDate(input.checkInDate) || !validIsoDate(input.checkOutDate)) {
    return invalid('Valid hotel check-in and check-out dates are required.');
  }
  if (input.checkInDate < todayIso()) return invalid('The hotel check-in date is in the past.');
  if (input.checkOutDate <= input.checkInDate) return invalid('Hotel check-out must be after check-in.');
  return null;
}

export async function searchFlights(
  input: FlightSearchInput,
  providers: TravelProviderSet = defaultProviders,
): Promise<FlightSearchResult> {
  const validation = validateFlightInput(input);
  if (validation) return validation;

  const attempts: TravelProviderAttempt[] = [];
  const origin = await resolvePlace(input.origin, providers, attempts);
  if (!origin) return unavailable(`I could not confidently resolve the departure location "${input.origin}". Please use a city or airport code.`, attempts);
  const destination = await resolvePlace(input.destination, providers, attempts);
  if (!destination) return unavailable(`I could not confidently resolve the destination "${input.destination}". Please use a city or airport code.`, attempts);

  for (const provider of [providers.duffel, providers.amadeus]) {
    if (!provider.isConfigured()) continue;
    const startedAt = Date.now();
    try {
      const offers = await provider.searchFlights({
        ...input,
        originCode: origin.iataCode,
        destinationCode: destination.iataCode,
      });
      if (offers.length) {
        attempts.push({ provider: provider.name, outcome: 'success', latencyMs: Date.now() - startedAt });
        return {
          status: 'success',
          executed: true,
          provider: provider.name,
          origin,
          destination,
          offers,
          attempts,
        };
      }
      attempts.push({
        provider: provider.name,
        outcome: 'unavailable',
        latencyMs: Date.now() - startedAt,
        detail: 'provider returned no flight offers',
      });
    } catch (error: any) {
      attempts.push(attemptFromError(provider, startedAt, error));
    }
  }

  return unavailable('Live flight search is temporarily unavailable across the connected travel providers. No fares were invented.', attempts);
}

export async function searchHotels(
  input: HotelSearchInput,
  providers: TravelProviderSet = defaultProviders,
): Promise<HotelSearchResult> {
  const validation = validateHotelInput(input);
  if (validation) return validation;

  const attempts: TravelProviderAttempt[] = [];
  const location = await resolvePlace(input.location, providers, attempts);
  if (!location) return unavailable(`I could not confidently resolve the hotel destination "${input.location}". Please use a city or airport code.`, attempts);

  for (const provider of [providers.duffel, providers.amadeus]) {
    if (!provider.isConfigured() || !provider.searchHotels) continue;
    const startedAt = Date.now();
    try {
      const hotels = await provider.searchHotels({ ...input, location });
      if (hotels.length) {
        attempts.push({ provider: provider.name, outcome: 'success', latencyMs: Date.now() - startedAt });
        return {
          status: 'success',
          executed: true,
          provider: provider.name,
          location,
          hotels,
          attempts,
        };
      }
      attempts.push({
        provider: provider.name,
        outcome: 'unavailable',
        latencyMs: Date.now() - startedAt,
        detail: 'provider returned no hotel availability',
      });
    } catch (error: any) {
      attempts.push(attemptFromError(provider, startedAt, error));
    }
  }

  return unavailable('Live hotel search is temporarily unavailable across the connected travel providers. No hotel availability was invented.', attempts);
}

export async function searchAttractions(
  input: AttractionSearchInput,
  providers: TravelProviderSet = defaultProviders,
): Promise<AttractionSearchResult> {
  if (!String(input.location || '').trim()) return invalid('An attraction destination is required.');

  const attempts: TravelProviderAttempt[] = [];
  const location = await resolvePlace(input.location, providers, attempts);
  if (!location) return unavailable(`I could not confidently resolve the attraction destination "${input.location}". Please use a city or airport code.`, attempts);

  for (const provider of [providers.amadeus, providers.duffel]) {
    if (!provider.isConfigured() || !provider.searchAttractions) continue;
    const startedAt = Date.now();
    try {
      const attractions = await provider.searchAttractions({ ...input, location });
      if (attractions.length) {
        attempts.push({ provider: provider.name, outcome: 'success', latencyMs: Date.now() - startedAt });
        return {
          status: 'success',
          executed: true,
          provider: provider.name,
          location,
          attractions,
          attempts,
        };
      }
      attempts.push({
        provider: provider.name,
        outcome: 'unavailable',
        latencyMs: Date.now() - startedAt,
        detail: 'provider returned no attractions',
      });
    } catch (error: any) {
      attempts.push(attemptFromError(provider, startedAt, error));
    }
  }

  return unavailable('Live attraction discovery is temporarily unavailable across the connected travel providers. No attractions were invented.', attempts);
}

export function travelProviderHealth(providers: TravelProviderSet = defaultProviders) {
  return {
    googleRequired: false,
    conversationProvider: 'openrouter',
    flights: {
      primary: 'duffel',
      secondary: 'amadeus',
      duffelConfigured: providers.duffel.isConfigured(),
      amadeusConfigured: providers.amadeus.isConfigured(),
    },
    hotels: {
      primary: 'duffel',
      secondary: 'amadeus',
      duffelConfigured: providers.duffel.isConfigured(),
      amadeusConfigured: providers.amadeus.isConfigured(),
    },
    attractions: {
      primary: 'amadeus',
      amadeusConfigured: providers.amadeus.isConfigured(),
    },
  };
}
