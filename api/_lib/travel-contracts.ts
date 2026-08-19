export type TravelProviderName = 'duffel' | 'amadeus';

export type TravelProviderAttempt = {
  provider: TravelProviderName;
  outcome: 'success' | 'unavailable' | 'timeout' | 'error' | 'invalid';
  latencyMs: number;
  detail?: string;
};

export type TravelProviderFailure = {
  status: 'unavailable' | 'error' | 'invalid';
  executed: false;
  reason: string;
  message: string;
  attempts: TravelProviderAttempt[];
};

export type PlaceResolution = {
  provider: TravelProviderName;
  name: string;
  iataCode: string;
  type: 'airport' | 'city';
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type FlightSearchInput = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string | null;
  adults?: number;
  cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first';
  currency?: string;
};

export type FlightSegment = {
  origin: string;
  destination: string;
  departingAt: string | null;
  arrivingAt: string | null;
  carrierName: string | null;
  carrierCode: string | null;
  flightNumber: string | null;
};

export type FlightOffer = {
  id: string;
  provider: TravelProviderName;
  totalAmount: number;
  currency: string;
  direct: boolean;
  duration: string | null;
  expiresAt?: string | null;
  segments: FlightSegment[];
};

export type FlightSearchSuccess = {
  status: 'success';
  executed: true;
  provider: TravelProviderName;
  origin: PlaceResolution;
  destination: PlaceResolution;
  offers: FlightOffer[];
  attempts: TravelProviderAttempt[];
};

export type FlightSearchResult = FlightSearchSuccess | TravelProviderFailure;

export type HotelSearchInput = {
  location: string;
  checkInDate: string;
  checkOutDate: string;
  adults?: number;
  rooms?: number;
  currency?: string;
  radiusKm?: number;
};

export type HotelProviderSearchInput = Omit<HotelSearchInput, 'location'> & {
  location: PlaceResolution;
};

export type HotelOffer = {
  id: string;
  provider: TravelProviderName;
  name: string;
  totalAmount: number;
  currency: string;
  rating?: number | null;
  reviewScore?: number | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type HotelSearchSuccess = {
  status: 'success';
  executed: true;
  provider: TravelProviderName;
  location: PlaceResolution;
  hotels: HotelOffer[];
  attempts: TravelProviderAttempt[];
};

export type HotelSearchResult = HotelSearchSuccess | TravelProviderFailure;

export type AttractionSearchInput = {
  location: string;
  radiusKm?: number;
};

export type AttractionProviderSearchInput = Omit<AttractionSearchInput, 'location'> & {
  location: PlaceResolution;
};

export type AttractionOffer = {
  id: string;
  provider: TravelProviderName;
  name: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  bookingLink?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type AttractionSearchSuccess = {
  status: 'success';
  executed: true;
  provider: TravelProviderName;
  location: PlaceResolution;
  attractions: AttractionOffer[];
  attempts: TravelProviderAttempt[];
};

export type AttractionSearchResult = AttractionSearchSuccess | TravelProviderFailure;

export type TravelProvider = {
  name: TravelProviderName;
  isConfigured(): boolean;
  resolvePlace(query: string): Promise<PlaceResolution | null>;
  searchFlights(input: FlightSearchInput & { originCode: string; destinationCode: string }): Promise<FlightOffer[]>;
  searchHotels?(input: HotelProviderSearchInput): Promise<HotelOffer[]>;
  searchAttractions?(input: AttractionProviderSearchInput): Promise<AttractionOffer[]>;
};
