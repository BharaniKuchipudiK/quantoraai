import { createDefaultDuffelProvider } from './duffel-provider.js';
import { createDefaultGooglePlacesProvider } from './google-places-provider.js';
import { runProviderCall, unavailable } from './provider-runtime.js';
import type {
  AttractionOption,
  AttractionSearchInput,
  FlightOption,
  FlightSearchInput,
  FlightSearchProvider,
  HotelOption,
  HotelSearchInput,
  HotelSearchProvider,
  PlaceDiscoveryProvider,
  TravelProviderResult,
} from './types.js';

export type TravelGatewayDependencies = {
  flights?: FlightSearchProvider | null;
  hotels?: HotelSearchProvider | null;
  places?: PlaceDiscoveryProvider | null;
};

function isoDate(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function validateFlightInput(input: FlightSearchInput): string | null {
  if (!input.origin.trim() || !input.destination.trim()) return 'Origin and destination are required.';
  if (input.origin.trim().toUpperCase() === input.destination.trim().toUpperCase()) return 'Origin and destination must be different.';
  const departure = isoDate(input.departureDate);
  if (departure === null) return 'Departure date must be a valid YYYY-MM-DD date.';
  if (input.returnDate) {
    const returning = isoDate(input.returnDate);
    if (returning === null) return 'Return date must be a valid YYYY-MM-DD date.';
    if (returning < departure) return 'Return date cannot be before departure date.';
  }
  return null;
}

function validateHotelInput(input: HotelSearchInput): string | null {
  if (!input.location.trim() && !input.coordinates) return 'Hotel location or coordinates are required.';
  const checkIn = isoDate(input.checkInDate);
  const checkOut = isoDate(input.checkOutDate);
  if (checkIn === null || checkOut === null) return 'Hotel dates must be valid YYYY-MM-DD dates.';
  if (checkOut <= checkIn) return 'Check-out must be after check-in.';
  const nights = Math.round((checkOut - checkIn) / 86_400_000);
  if (nights > 99) return 'Hotel stay cannot exceed 99 nights.';
  return null;
}

export class TravelProviderGateway {
  constructor(private readonly providers: TravelGatewayDependencies) {}

  async searchFlights(input: FlightSearchInput): Promise<TravelProviderResult<FlightOption[]>> {
    const validation = validateFlightInput(input);
    if (validation) return unavailable(null, validation, 'INVALID_INPUT');

    const provider = this.providers.flights;
    if (!provider) return unavailable(null, 'No live flight provider is configured.');
    return runProviderCall({
      provider: provider.name,
      operation: 'search_flights',
      fn: () => provider.searchFlights(input),
      timeoutMs: 20_000,
    });
  }

  async searchHotels(input: HotelSearchInput): Promise<TravelProviderResult<HotelOption[]>> {
    const validation = validateHotelInput(input);
    if (validation) return unavailable(null, validation, 'INVALID_INPUT');

    const hotelProvider = this.providers.hotels;
    if (!hotelProvider) return unavailable(null, 'No live hotel provider is configured.');

    let coordinates = input.coordinates;
    const warnings: string[] = [];
    if (!coordinates) {
      const places = this.providers.places;
      if (!places) {
        return unavailable(null, 'Hotel search needs a destination resolver. Configure Google Places or provide coordinates.', 'LOCATION_PROVIDER_UNAVAILABLE');
      }
      const resolved = await runProviderCall({
        provider: places.name,
        operation: 'resolve_location',
        fn: () => places.resolveLocation(input.location),
        timeoutMs: 10_000,
      });
      if (resolved.status !== 'success' || !resolved.data?.coordinates) {
        return unavailable(places.name, `Could not resolve ${input.location} for hotel search.`, resolved.reason || 'LOCATION_NOT_FOUND');
      }
      coordinates = resolved.data.coordinates;
      warnings.push(`Destination resolved as ${resolved.data.name}${resolved.data.address ? ` (${resolved.data.address})` : ''}.`);
    }

    const result = await runProviderCall({
      provider: hotelProvider.name,
      operation: 'search_hotels',
      fn: () => hotelProvider.searchHotels({ ...input, coordinates }),
      timeoutMs: 18_000,
    });
    if (result.status === 'success' && warnings.length) {
      result.warnings = [...warnings, ...(result.warnings || [])];
    }
    return result;
  }

  async searchAttractions(input: AttractionSearchInput): Promise<TravelProviderResult<AttractionOption[]>> {
    if (!input.location.trim()) return unavailable(null, 'Attraction location is required.', 'INVALID_INPUT');
    const provider = this.providers.places;
    if (!provider) return unavailable(null, 'No live attraction discovery provider is configured.');
    return runProviderCall({
      provider: provider.name,
      operation: 'search_attractions',
      fn: () => provider.searchAttractions(input),
      timeoutMs: 10_000,
    });
  }

  async resolveLocation(query: string) {
    if (!query.trim()) return unavailable(null, 'A destination query is required.', 'INVALID_INPUT');
    const provider = this.providers.places;
    if (!provider) return unavailable(null, 'No destination resolver is configured.');
    return runProviderCall({
      provider: provider.name,
      operation: 'resolve_location',
      fn: () => provider.resolveLocation(query),
      timeoutMs: 10_000,
    });
  }
}

let defaultGateway: TravelProviderGateway | null = null;

export function getDefaultTravelGateway(): TravelProviderGateway {
  if (!defaultGateway) {
    const duffel = createDefaultDuffelProvider();
    const places = createDefaultGooglePlacesProvider();
    defaultGateway = new TravelProviderGateway({
      flights: duffel,
      hotels: duffel,
      places,
    });
  }
  return defaultGateway;
}

export function describeTravelProviderReadiness() {
  return {
    flights: {
      provider: 'duffel',
      configured: Boolean(process.env.DUFFEL_API_KEY?.trim()),
      secret: 'DUFFEL_API_KEY',
    },
    hotels: {
      provider: 'duffel_stays',
      configured: Boolean(process.env.DUFFEL_API_KEY?.trim()),
      requiresAccountEntitlement: true,
      secret: 'DUFFEL_API_KEY',
      dependency: 'Google Places destination resolution unless coordinates are already known',
    },
    attractions: {
      provider: 'google_places',
      configured: Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim()),
      secret: 'GOOGLE_PLACES_API_KEY',
      bookingEnabled: false,
    },
    transactions: {
      enabled: false,
      rule: 'Bookings require explicit approval, idempotency, provider confirmation, and persisted evidence before success can be reported.',
    },
  };
}
