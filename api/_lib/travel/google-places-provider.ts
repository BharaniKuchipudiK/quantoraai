import { providerError, success, unavailable } from './provider-runtime.js';
import type {
  AttractionOption,
  AttractionSearchInput,
  PlaceDiscoveryProvider,
  PlaceSummary,
  TravelProviderResult,
} from './types.js';

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const DEFAULT_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.types',
].join(',');

type FetchLike = typeof fetch;

type CacheEntry<T> = { expiresAt: number; value: T };
const locationCache = new Map<string, CacheEntry<PlaceSummary>>();
const attractionCache = new Map<string, CacheEntry<AttractionOption[]>>();

function toPlaceSummary(place: any): PlaceSummary | null {
  const id = typeof place?.id === 'string' ? place.id : '';
  const name = typeof place?.displayName?.text === 'string' ? place.displayName.text : '';
  if (!id || !name) return null;

  const latitude = Number(place?.location?.latitude);
  const longitude = Number(place?.location?.longitude);
  return {
    id,
    name,
    address: typeof place?.formattedAddress === 'string' ? place.formattedAddress : null,
    coordinates: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null,
    rating: Number.isFinite(Number(place?.rating)) ? Number(place.rating) : null,
    ratingCount: Number.isFinite(Number(place?.userRatingCount)) ? Number(place.userRatingCount) : null,
    googleMapsUri: typeof place?.googleMapsUri === 'string' ? place.googleMapsUri : null,
    websiteUri: typeof place?.websiteUri === 'string' ? place.websiteUri : null,
    types: Array.isArray(place?.types) ? place.types.filter((value: unknown) => typeof value === 'string') : [],
  };
}

export class GooglePlacesTravelProvider implements PlaceDiscoveryProvider {
  readonly name = 'google_places' as const;

  constructor(
    private readonly apiKey: string | null,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async searchText(textQuery: string, pageSize: number): Promise<TravelProviderResult<PlaceSummary[]>> {
    if (!this.apiKey) {
      return unavailable(this.name, 'Google Places is not configured for destination and attraction discovery.');
    }

    try {
      const response = await this.fetchImpl(TEXT_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': DEFAULT_FIELDS,
        },
        body: JSON.stringify({
          textQuery,
          pageSize: Math.max(1, Math.min(20, pageSize)),
          languageCode: 'en',
        }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.warn(`[Google Places] ${response.status}: ${detail.slice(0, 300)}`);
        return providerError(this.name, `Google Places returned HTTP ${response.status}.`, `HTTP_${response.status}`);
      }

      const body: any = await response.json();
      const places = Array.isArray(body?.places)
        ? body.places.map(toPlaceSummary).filter(Boolean) as PlaceSummary[]
        : [];
      return success(this.name, places);
    } catch (error: any) {
      console.error('[Google Places] search failed:', error?.message || error);
      return providerError(this.name, 'Google Places search failed. No place data was fabricated.');
    }
  }

  async resolveLocation(query: string): Promise<TravelProviderResult<PlaceSummary>> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return unavailable(this.name, 'A destination is required.', 'INVALID_INPUT');

    const cached = locationCache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) return success(this.name, cached.value, ['Destination coordinates served from short-lived cache.']);

    const result = await this.searchText(query.trim(), 1);
    const first = result.data?.[0];
    if (result.status !== 'success' || !first || !first.coordinates) {
      return unavailable(this.name, `Could not resolve destination coordinates for ${query}.`, 'LOCATION_NOT_FOUND');
    }

    locationCache.set(normalized, { expiresAt: Date.now() + 30 * 60_000, value: first });
    return success(this.name, first);
  }

  async searchAttractions(input: AttractionSearchInput): Promise<TravelProviderResult<AttractionOption[]>> {
    const location = input.location.trim();
    if (!location) return unavailable(this.name, 'An attraction location is required.', 'INVALID_INPUT');

    const category = input.category?.trim() || 'top attractions';
    const maxResults = Math.max(1, Math.min(20, Math.floor(input.maxResults || 10)));
    const cacheKey = `${category.toLowerCase()}|${location.toLowerCase()}|${maxResults}`;
    const cached = attractionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return success(this.name, cached.value, ['Attraction discovery served from a five-minute cache; booking availability is not implied.']);
    }

    const result = await this.searchText(`${category} in ${location}`, maxResults);
    if (result.status !== 'success') return result;

    const attractions = result.data || [];
    attractionCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, value: attractions });
    return success(this.name, attractions, [
      'Google Places provides discovery metadata, not ticket inventory or booking confirmation.',
    ]);
  }
}

export function createDefaultGooglePlacesProvider(): GooglePlacesTravelProvider {
  return new GooglePlacesTravelProvider(process.env.GOOGLE_PLACES_API_KEY?.trim() || null);
}
