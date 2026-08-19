export type TravelProviderName = 'duffel' | 'google_places';

export type TravelProviderStatus = 'success' | 'unavailable' | 'error';

export type TravelProviderResult<T> = {
  status: TravelProviderStatus;
  executed: boolean;
  provider: TravelProviderName | null;
  fetchedAt: string;
  data?: T;
  reason?: string;
  message?: string;
  warnings?: string[];
};

export type FlightSearchInput = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers?: number;
  cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first';
};

export type FlightOption = {
  id: string;
  airline: string;
  flightNumber: string | null;
  departure: string | null;
  arrival: string | null;
  duration: string | null;
  price: number;
  currency: string | null;
  direct: boolean | null;
  offerExpiresAt?: string | null;
};

export type PlaceCoordinates = {
  latitude: number;
  longitude: number;
};

export type PlaceSummary = {
  id: string;
  name: string;
  address: string | null;
  coordinates: PlaceCoordinates | null;
  rating: number | null;
  ratingCount: number | null;
  googleMapsUri: string | null;
  websiteUri: string | null;
  types: string[];
};

export type HotelSearchInput = {
  location: string;
  checkInDate: string;
  checkOutDate: string;
  guests?: number;
  rooms?: number;
  minStarRating?: number;
  coordinates?: PlaceCoordinates;
};

export type HotelOption = {
  id: string;
  searchResultId: string;
  name: string;
  address: string | null;
  rating: number | null;
  reviewScore: number | null;
  reviewCount: number | null;
  cheapestRateAmount: number | null;
  cheapestRateCurrency: string | null;
  coordinates: PlaceCoordinates | null;
  photos: string[];
};

export type AttractionSearchInput = {
  location: string;
  category?: string;
  maxResults?: number;
};

export type AttractionOption = PlaceSummary;

export interface FlightSearchProvider {
  readonly name: TravelProviderName;
  searchFlights(input: FlightSearchInput): Promise<TravelProviderResult<FlightOption[]>>;
}

export interface HotelSearchProvider {
  readonly name: TravelProviderName;
  searchHotels(input: HotelSearchInput): Promise<TravelProviderResult<HotelOption[]>>;
}

export interface PlaceDiscoveryProvider {
  readonly name: TravelProviderName;
  resolveLocation(query: string): Promise<TravelProviderResult<PlaceSummary>>;
  searchAttractions(input: AttractionSearchInput): Promise<TravelProviderResult<AttractionOption[]>>;
}

/**
 * Transactional travel is intentionally a separate contract from discovery.
 * Search providers can never accidentally become booking providers merely by
 * being exposed to the model. Any implementation of this contract must sit
 * behind Quantora's approval + idempotency + evidence boundary.
 */
export interface TravelBookingProvider {
  readonly name: TravelProviderName;
  createBooking(input: unknown, idempotencyKey: string): Promise<TravelProviderResult<unknown>>;
}
