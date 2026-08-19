#!/usr/bin/env node

const DUFFEL_TOKEN = String(process.env.DUFFEL_API_KEY || '').trim();
const AMADEUS_KEY = String(process.env.AMADEUS_API_KEY || '').trim();
const AMADEUS_SECRET = String(process.env.AMADEUS_API_SECRET || '').trim();
const AMADEUS_PRODUCTION = String(process.env.AMADEUS_ENVIRONMENT || '').toLowerCase() === 'production';
const AMADEUS_BASE = AMADEUS_PRODUCTION ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';

const MAX_TOTAL_MS = Number(process.env.TRAVEL_CANARY_MAX_MS || 12_000);
const startedAt = Date.now();

function futureIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function timedFetch(label, url, init = {}, timeoutMs = 7_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!response.ok) {
      throw new Error(`${label} HTTP ${response.status}: ${body?.error_description || body?.errors?.[0]?.detail || body?.errors?.[0]?.title || text.slice(0, 300)}`);
    }
    console.log(`✔ ${label} — ${Date.now() - start}ms`);
    return body;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${label} timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function selectIata(payload, expectedCode) {
  const places = Array.isArray(payload?.data) ? payload.data : [];
  const expected = String(expectedCode || '').toUpperCase();
  const exact = places.find((place) =>
    String(place?.iata_code || '').toUpperCase() === expected ||
    String(place?.iata_city_code || '').toUpperCase() === expected,
  );
  return exact?.iata_code || exact?.iata_city_code || null;
}

async function duffelCanary() {
  if (!DUFFEL_TOKEN) throw new Error('DUFFEL_API_KEY is required for the Travel provider canary.');
  const headers = {
    Authorization: `Bearer ${DUFFEL_TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Duffel-Version': 'v2',
  };

  const [origin, destination] = await Promise.all([
    timedFetch('Duffel place: Singapore', 'https://api.duffel.com/places/suggestions?query=Singapore', { headers }, 4_000),
    timedFetch('Duffel place: Bali Indonesia', 'https://api.duffel.com/places/suggestions?query=Bali%20Indonesia', { headers }, 4_000),
  ]);
  const originCode = selectIata(origin, 'SIN');
  const destinationCode = selectIata(destination, 'DPS');
  if (originCode !== 'SIN') throw new Error(`Duffel place resolution failed route validation for Singapore: expected SIN, got ${originCode || 'none'}.`);
  if (destinationCode !== 'DPS') {
    const returned = Array.isArray(destination?.data)
      ? destination.data.slice(0, 5).map((place) => `${place?.iata_code || place?.iata_city_code || '?'}:${place?.city_name || place?.name || '?'}/${place?.iata_country_code || '?'}`).join(', ')
      : 'none';
    throw new Error(`Duffel place resolution failed route validation for Bali: expected DPS, candidates ${returned}.`);
  }

  const departure = futureIso(30);
  const returning = futureIso(33);
  const offerRequest = await timedFetch(
    `Duffel flights ${originCode}-${destinationCode}`,
    'https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=5000',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: {
          slices: [
            { origin: originCode, destination: destinationCode, departure_date: departure },
            { origin: destinationCode, destination: originCode, departure_date: returning },
          ],
          passengers: [{ type: 'adult' }],
          cabin_class: 'economy',
        },
      }),
    },
    7_500,
  );
  if (!Array.isArray(offerRequest?.data?.offers)) throw new Error('Duffel flight response is missing data.offers.');
  if (offerRequest.data.offers.length === 0) throw new Error('Duffel returned zero offers for the validated SIN-DPS canary route.');
  console.log(`  Duffel offers: ${offerRequest.data.offers.length}`);
}

async function amadeusCanary() {
  if (!AMADEUS_KEY || !AMADEUS_SECRET) {
    console.log('○ Amadeus canary skipped — AMADEUS_API_KEY / AMADEUS_API_SECRET not configured yet.');
    return;
  }

  const tokenBody = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: AMADEUS_KEY,
    client_secret: AMADEUS_SECRET,
  });
  const token = await timedFetch('Amadeus OAuth', `${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  }, 4_000);
  if (!token?.access_token) throw new Error('Amadeus OAuth did not return an access token.');

  const departure = futureIso(30);
  const url = new URL(`${AMADEUS_BASE}/v2/shopping/flight-offers`);
  url.searchParams.set('originLocationCode', process.env.TRAVEL_CANARY_AMADEUS_ORIGIN || 'MAD');
  url.searchParams.set('destinationLocationCode', process.env.TRAVEL_CANARY_AMADEUS_DESTINATION || 'ATH');
  url.searchParams.set('departureDate', departure);
  url.searchParams.set('adults', '1');
  url.searchParams.set('max', '5');
  const offers = await timedFetch('Amadeus flight offers', url.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
  }, 6_000);
  if (!Array.isArray(offers?.data)) throw new Error('Amadeus flight response is missing data array.');
  console.log(`  Amadeus offers: ${offers.data.length}`);
}

try {
  console.log('=== Quantora Travel Provider Canary ===');
  await duffelCanary();
  await amadeusCanary();
  const total = Date.now() - startedAt;
  if (total > MAX_TOTAL_MS) throw new Error(`Travel provider canary exceeded SLA: ${total}ms > ${MAX_TOTAL_MS}ms`);
  console.log(`✔ Travel provider canary passed in ${total}ms`);
} catch (error) {
  console.error(`✖ Travel provider canary failed: ${error?.message || error}`);
  process.exit(1);
}
