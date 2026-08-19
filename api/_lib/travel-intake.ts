import type { FlightSearchInput, HotelSearchInput } from './travel-contracts.js';

export type DirectTravelIntent = 'flight_search' | 'hotel_search' | 'attraction_search' | null;

const MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

function userHistoryText(body: any): string[] {
  const history = Array.isArray(body?.history) ? body.history : [];
  return history
    .filter((item: any) => {
      const role = item?.role || item?.sender;
      return role === 'user' || role === 'human' || (!role && typeof item?.text === 'string');
    })
    .map((item: any) => String(item?.text || item?.content || '').trim())
    .filter(Boolean);
}

function userTurns(body: any): string[] {
  return [...userHistoryText(body).slice(-8), String(body?.message || '').trim()].filter(Boolean);
}

export function travelUserTranscript(body: any): string {
  return userTurns(body).join('\n');
}

function classifyTravelText(text: string): DirectTravelIntent {
  if (/\b(?:book|find|search|show|check|compare|price|fare|flight)\b[\s\S]*\b(?:flight|flights|fare|fares)\b|\b(?:flight|flights|fare|fares)\b[\s\S]*\b(?:book|find|search|show|check|compare|price)\b/i.test(text)) {
    return 'flight_search';
  }
  if (/\b(?:book|find|search|show|check|compare)\b[\s\S]*\b(?:hotel|hotels|stay|stays|accommodation|resort|room|rooms)\b|\b(?:hotel|hotels|stay|stays|accommodation|resort|room|rooms)\b[\s\S]*\b(?:book|find|search|show|check|compare)\b/i.test(text)) {
    return 'hotel_search';
  }
  if (/\b(?:find|search|show|recommend|things to do|attractions?|activities|tours?|tickets?)\b/i.test(text)
      && /\b(?:attractions?|activities|tours?|tickets?|things to do)\b/i.test(text)) {
    return 'attraction_search';
  }
  return null;
}

export function detectDirectTravelIntent(body: any): DirectTravelIntent {
  const current = String(body?.message || '').trim();
  const explicit = classifyTravelText(current);
  if (explicit) return explicit;

  const recent = userHistoryText(body).slice(-6).reverse();
  for (const turn of recent) {
    const inferred = classifyTravelText(turn);
    if (inferred) return inferred;
  }
  return null;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function parseTravelDate(text: string, now: Date = new Date()): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const dayMonth = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/i);
  const monthDay = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i);

  let day: number | null = null;
  let month: number | null = null;
  let explicitYear: number | null = null;
  if (dayMonth) {
    day = Number(dayMonth[1]);
    month = MONTHS[dayMonth[2].toLowerCase()] || null;
    explicitYear = dayMonth[3] ? Number(dayMonth[3]) : null;
  } else if (monthDay) {
    month = MONTHS[monthDay[1].toLowerCase()] || null;
    day = Number(monthDay[2]);
    explicitYear = monthDay[3] ? Number(monthDay[3]) : null;
  }
  if (!day || !month) return null;

  if (explicitYear) return toIsoDate(explicitYear, month, day);
  const currentYear = now.getUTCFullYear();
  const candidate = toIsoDate(currentYear, month, day);
  if (!candidate) return null;
  const today = now.toISOString().slice(0, 10);
  return candidate >= today ? candidate : toIsoDate(currentYear + 1, month, day);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function cleanLocation(value: string): string {
  return value
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:on|departing|leaving|returning|return|back|for)\s+\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+[\s\S]*$/i, '')
    .replace(/\bfor\s+\d+\s+(?:nights?|days?)\b[\s\S]*$/i, '')
    .replace(/[,.!?]+$/g, '')
    .trim();
}

function extractRoute(text: string): { origin?: string; destination?: string } {
  const toFrom = text.match(/\bto\s+(.+?)\s+from\s+(.+?)(?=\s+(?:on|departing|depart|leaving|returning|return|back|for\s+\d+\s+(?:nights?|days?))\b|$)/i);
  if (toFrom) {
    return { destination: cleanLocation(toFrom[1]), origin: cleanLocation(toFrom[2]) };
  }
  const fromTo = text.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:on|departing|depart|leaving|returning|return|back|for\s+\d+\s+(?:nights?|days?))\b|$)/i);
  if (fromTo) {
    return { origin: cleanLocation(fromTo[1]), destination: cleanLocation(fromTo[2]) };
  }
  return {};
}

function extractRouteFromTurns(body: any): { origin?: string; destination?: string } {
  const resolved: { origin?: string; destination?: string } = {};
  for (const turn of userTurns(body)) {
    const route = extractRoute(turn);
    if (route.origin) resolved.origin = route.origin;
    if (route.destination) resolved.destination = route.destination;
  }
  return resolved;
}

function extractReturnDate(text: string, now: Date): string | null {
  const marker = text.match(/\b(?:return(?:ing)?|back)\s+(?:on\s+)?([^\n,.!?]+)/i);
  return marker ? parseTravelDate(marker[1], now) : null;
}

function extractNights(text: string): number | null {
  const match = text.match(/\b(\d{1,2})\s+nights?\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return value > 0 && value <= 60 ? value : null;
}

function extractAdults(text: string): number {
  const match = text.match(/\b(\d{1,2})\s+(?:adults?|travell?ers?|passengers?|people|persons?)\b/i);
  if (!match) return 1;
  return Math.min(9, Math.max(1, Number(match[1]) || 1));
}

export type FlightDraft = {
  input?: FlightSearchInput;
  question?: string;
};

export function buildFlightSearchDraft(body: any, now: Date = new Date()): FlightDraft {
  const transcript = travelUserTranscript(body);
  const route = extractRouteFromTurns(body);
  const departureDate = parseTravelDate(transcript, now);
  const returnDate = extractReturnDate(transcript, now);
  const nights = extractNights(transcript);
  const oneWay = /\bone[- ]?way\b/i.test(transcript);

  if (!route.origin) return { question: 'Which city or airport are you departing from?' };
  if (!route.destination) return { question: 'Where would you like to fly to?' };
  if (!departureDate) return { question: 'What date would you like to depart?' };

  const derivedReturnDate = returnDate || (nights ? addDays(departureDate, nights) : null);
  if (!oneWay && !derivedReturnDate) {
    return { question: 'Is this a one-way or return trip? If return, what date would you like to fly back?' };
  }

  return {
    input: {
      origin: route.origin,
      destination: route.destination,
      departureDate,
      returnDate: oneWay ? null : derivedReturnDate,
      adults: extractAdults(transcript),
      cabinClass: 'economy',
    },
  };
}

export type HotelDraft = {
  input?: HotelSearchInput;
  question?: string;
};

export function buildHotelSearchDraft(body: any, now: Date = new Date()): HotelDraft {
  const transcript = travelUserTranscript(body);
  const route = extractRouteFromTurns(body);
  const locationMatch = transcript.match(/\b(?:hotel|hotels|stay|stays|accommodation|resort|room|rooms)\s+(?:in|at|near)\s+([^\n,.!?]+?)(?=\s+(?:from|on|for\s+\d+\s+nights?)\b|$)/i);
  const location = cleanLocation(locationMatch?.[1] || route.destination || '');
  const checkInDate = parseTravelDate(transcript, now);
  const nights = extractNights(transcript);
  const explicitCheckOut = extractReturnDate(transcript, now);
  const checkOutDate = explicitCheckOut || (checkInDate && nights ? addDays(checkInDate, nights) : null);

  if (!location) return { question: 'Which destination should I search for hotels in?' };
  if (!checkInDate) return { question: 'What date would you like to check in?' };
  if (!checkOutDate) return { question: 'What date would you like to check out, or how many nights are you staying?' };

  return {
    input: {
      location,
      checkInDate,
      checkOutDate,
      adults: extractAdults(transcript),
      rooms: 1,
    },
  };
}

export function attractionLocation(body: any): string | null {
  const transcript = travelUserTranscript(body);
  const inMatch = transcript.match(/\b(?:attractions?|activities|tours?|things to do)\s+(?:in|at|near)\s+([^\n,.!?]+)/i);
  const route = extractRouteFromTurns(body);
  return cleanLocation(inMatch?.[1] || route.destination || '') || null;
}
