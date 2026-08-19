import { Duffel } from '@duffel/api';
import { providerError, success, unavailable } from './provider-runtime.js';
import type {
  FlightOption,
  FlightSearchInput,
  FlightSearchProvider,
  HotelOption,
  HotelSearchInput,
  HotelSearchProvider,
  TravelProviderResult,
} from './types.js';

function amount(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function coordinates(value: any) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function addressOf(accommodation: any): string | null {
  const address = accommodation?.location?.address;
  if (!address) return null;
  return [address.line_one, address.line_two, address.city_name, address.region, address.postal_code, address.country_code]
    .filter(Boolean)
    .join(', ') || null;
}

export class DuffelTravelProvider implements FlightSearchProvider, HotelSearchProvider {
  readonly name = 'duffel' as const;

  constructor(private readonly client: Duffel | null) {}

  async searchFlights(input: FlightSearchInput): Promise<TravelProviderResult<FlightOption[]>> {
    if (!this.client) {
      return unavailable(this.name, 'Duffel is not configured for live flight search.');
    }

    try {
      const slices: any[] = [{
        origin: input.origin.trim(),
        destination: input.destination.trim(),
        departure_date: input.departureDate.trim(),
      }];
      if (input.returnDate) {
        slices.push({
          origin: input.destination.trim(),
          destination: input.origin.trim(),
          departure_date: input.returnDate.trim(),
        });
      }

      const passengerCount = Math.min(9, Math.max(1, Math.floor(input.passengers || 1)));
      const response = await this.client.offerRequests.create({
        slices,
        passengers: Array.from({ length: passengerCount }, () => ({ type: 'adult' as const })),
        cabin_class: input.cabinClass || 'economy',
      });

      const offers = Array.isArray(response?.data?.offers) ? response.data.offers.slice(0, 12) : [];
      const flights = offers.map((offer: any): FlightOption => {
        const firstSlice = offer?.slices?.[0];
        const firstSegment = firstSlice?.segments?.[0];
        const lastSegment = firstSlice?.segments?.[firstSlice?.segments?.length - 1];
        return {
          id: String(offer?.id || ''),
          airline: firstSegment?.operating_carrier?.name || firstSegment?.marketing_carrier?.name || 'Unknown carrier',
          flightNumber: firstSegment?.operating_carrier?.iata_code && firstSegment?.operating_carrier_flight_number
            ? `${firstSegment.operating_carrier.iata_code}${firstSegment.operating_carrier_flight_number}`
            : null,
          departure: firstSegment?.departing_at || null,
          arrival: lastSegment?.arriving_at || null,
          duration: firstSlice?.duration || null,
          price: amount(offer?.total_amount) ?? 0,
          currency: offer?.total_currency || null,
          direct: Array.isArray(firstSlice?.segments) ? firstSlice.segments.length === 1 : null,
          offerExpiresAt: offer?.expires_at || null,
        };
      }).filter((option: FlightOption) => option.id && option.price >= 0);

      return success(this.name, flights);
    } catch (error: any) {
      console.error('[Duffel] flight search failed:', error?.errors || error?.message || error);
      return providerError(this.name, 'Duffel flight search failed. No substitute fares were generated.');
    }
  }

  async searchHotels(input: HotelSearchInput): Promise<TravelProviderResult<HotelOption[]>> {
    if (!this.client) {
      return unavailable(this.name, 'Duffel is not configured for live hotel search.');
    }
    if (!input.coordinates) {
      return unavailable(this.name, 'Hotel search needs resolved destination coordinates.', 'LOCATION_REQUIRED');
    }

    try {
      const guestCount = Math.min(9, Math.max(1, Math.floor(input.guests || 1)));
      const roomCount = Math.min(9, Math.max(1, Math.floor(input.rooms || 1)));
      const response: any = await (this.client as any).stays.search({
        rooms: roomCount,
        location: {
          radius: 10,
          geographic_coordinates: {
            longitude: input.coordinates.longitude,
            latitude: input.coordinates.latitude,
          },
        },
        check_out_date: input.checkOutDate,
        check_in_date: input.checkInDate,
        guests: Array.from({ length: guestCount }, () => ({ type: 'adult' })),
      });

      const results = Array.isArray(response?.data?.results) ? response.data.results : [];
      const minRating = Math.max(0, Math.min(5, Number(input.minStarRating) || 0));
      const hotels = results.map((result: any): HotelOption => {
        const accommodation = result?.accommodation || {};
        const geo = accommodation?.location?.geographic_coordinates;
        return {
          id: String(accommodation?.id || ''),
          searchResultId: String(result?.id || ''),
          name: accommodation?.name || 'Unknown accommodation',
          address: addressOf(accommodation),
          rating: amount(accommodation?.rating),
          reviewScore: amount(accommodation?.review_score),
          reviewCount: Number.isFinite(Number(accommodation?.review_count)) ? Number(accommodation.review_count) : null,
          cheapestRateAmount: amount(result?.cheapest_rate_total_amount),
          cheapestRateCurrency: result?.cheapest_rate_currency || null,
          coordinates: coordinates(geo),
          photos: Array.isArray(accommodation?.photos)
            ? accommodation.photos.map((photo: any) => photo?.url).filter(Boolean).slice(0, 5)
            : [],
        };
      }).filter((hotel: HotelOption) => (
        hotel.id
        && hotel.searchResultId
        && (minRating === 0 || (hotel.rating !== null && hotel.rating >= minRating))
      ));

      return success(this.name, hotels.slice(0, 20), [
        'Hotel prices are live search results and must be re-quoted before booking because availability and rates can change.',
      ]);
    } catch (error: any) {
      console.error('[Duffel] hotel search failed:', error?.errors || error?.message || error);
      return providerError(this.name, 'Duffel Stays search failed. No substitute hotel availability was generated.');
    }
  }
}

export function createDefaultDuffelProvider(): DuffelTravelProvider {
  const token = process.env.DUFFEL_API_KEY?.trim();
  return new DuffelTravelProvider(token ? new Duffel({ token }) : null);
}
