import { normalizeSessionContext } from './session-context.js';
import { inferStayLocation } from './travel-hotel-location.js';

const IATA_HOP = /\b([A-Z]{3})\s*(?:to|-|→)\s*([A-Z]{3})\b/;
const ISO_DATE = /\b(20\d{2}-\d{2}-\d{2})\b/g;

function clip(text, max = 80) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * What we already know about this trip — so Travel can show one board
 * instead of sending people to airline and hotel websites.
 */
export function deriveTravelTripBrief({ conversationContext = {}, messages = [] } = {}) {
  const ctx = normalizeSessionContext(conversationContext);
  const users = (messages || [])
    .filter((message) => message?.sender === 'user' && message.text)
    .map((message) => String(message.text).trim())
    .filter(Boolean);
  const blob = [ctx.goal, ctx.understanding, ...(ctx.facts || []), ...users].join('\n');
  const hop = blob.match(IATA_HOP);
  const dates = [...blob.matchAll(ISO_DATE)].map((match) => match[1]);
  const origin = hop?.[1] || '';
  const destination = hop?.[2] || '';
  const cityFromChat = [...users].reverse().map((text) => inferStayLocation(text)).find(Boolean) || '';
  const destinationLabel = destination || cityFromChat || clip(ctx.goal) || '';
  const departureDate = dates[0] || '';
  const returnDate = dates[1] || '';
  const canSearchFlights = Boolean(origin && destination && departureDate);
  const canSearchHotels = Boolean(destinationLabel);
  let next = 'Tell me where you want to go, and from which city.';
  if (destinationLabel && !departureDate) next = 'When are you thinking of travelling?';
  else if (canSearchFlights) next = 'I can pull live flights and places to stay onto this board.';
  else if (destinationLabel && !origin) next = 'Which city are you flying from?';

  if (!destinationLabel && !origin && !users.length && !ctx.goal) {
    return {
      origin: '',
      destination: '',
      destinationLabel: '',
      departureDate: '',
      returnDate: '',
      canSearchFlights: false,
      canSearchHotels: false,
      next: 'Where should we take you?',
    };
  }

  return {
    origin,
    destination,
    destinationLabel,
    departureDate,
    returnDate,
    canSearchFlights,
    canSearchHotels,
    next,
  };
}
