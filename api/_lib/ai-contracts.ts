import { z } from 'zod';

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}, 'Expected a real calendar date in YYYY-MM-DD format');

export const PipelineIdeaSpecSchema = z.object({
  title: boundedText(160),
  techStack: z.array(boundedText(100)).max(32),
  keyFeatures: z.array(boundedText(500)).max(50),
  dataModels: z.array(z.object({
    name: boundedText(120),
    fields: z.array(boundedText(160)).max(80),
  })).max(40),
});

export const PipelineActionSpecSchema = z.object({
  platform: boundedText(80),
  buildCmd: boundedText(500),
  envVars: z.array(z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,127}$/)).max(80),
  summary: boundedText(1_200),
});

/**
 * Today in UTC, as a comparable YYYY-MM-DD string.
 *
 * Injectable so a test can pin it, and so the boundary is one function rather
 * than a Date.now() sprinkled through the schemas.
 */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/*
 * A DATE IN THE PAST IS NOT A SEARCH.
 *
 * isoDate only ever asked "is this a real calendar date". 2025-05-08 is a real
 * calendar date, so when a model that had never been told today's date emitted
 * it, the value validated clean, reached the flight provider, and could only
 * fail — and the traveller was then offered "Tap Retry to run the same search
 * again", which would reissue the identical past date forever.
 *
 * Both halves of that were dead controls. This closes the first: no provider
 * call is ever made for a departure that has already happened. Lexicographic
 * comparison is exact for zero-padded ISO dates, so no parsing is needed.
 */
const notInThePast = (label: string) => (value: string, ctx: z.RefinementCtx) => {
  if (value < todayIso()) {
    ctx.addIssue({
      code: 'custom',
      message: `${label} ${value} is in the past — today is ${todayIso()}`,
    });
  }
};

const FlightSearchArgsSchema = z.object({
  origin: boundedText(120),
  destination: boundedText(120),
  departureDate: isoDate,
  returnDate: isoDate.optional(),
  passengers: z.coerce.number().int().min(1).max(9).optional().default(1),
}).superRefine((value, ctx) => {
  if (value.returnDate && value.returnDate < value.departureDate) {
    ctx.addIssue({ code: 'custom', path: ['returnDate'], message: 'Return date must not precede departure date' });
  }
  if (value.departureDate < todayIso()) {
    ctx.addIssue({
      code: 'custom',
      path: ['departureDate'],
      message: `Departure date ${value.departureDate} is in the past — today is ${todayIso()}`,
    });
  }
});

const HotelSearchArgsSchema = z.object({
  location: boundedText(160),
  checkInDate: isoDate.optional(),
  checkOutDate: isoDate.optional(),
  guests: z.coerce.number().int().min(1).max(20).optional().default(1),
  minStarRating: z.coerce.number().int().min(1).max(5).optional(),
}).superRefine((value, ctx) => {
  if (value.checkInDate && value.checkOutDate && value.checkOutDate <= value.checkInDate) {
    ctx.addIssue({ code: 'custom', path: ['checkOutDate'], message: 'Check-out must be after check-in' });
  }
  // Stays carry dates as context rather than as search terms, but a past
  // check-in is still a wrong answer and must not be echoed back as fact.
  if (value.checkInDate) notInThePast('Check-in date')(value.checkInDate, ctx);
});

const PlacesRoutingArgsSchema = z.object({
  query: boundedText(300).optional(),
  placeType: boundedText(100).optional(),
  origin: boundedText(300).optional(),
  destination: boundedText(300).optional(),
  travelMode: z.enum(['DRIVE', 'TRANSIT', 'WALK', 'BICYCLE', 'TWO_WHEELER']).optional().default('DRIVE'),
}).superRefine((value, ctx) => {
  const hasOrigin = Boolean(value.origin);
  const hasDestination = Boolean(value.destination);
  if (hasOrigin !== hasDestination) {
    ctx.addIssue({ code: 'custom', path: hasOrigin ? ['destination'] : ['origin'], message: 'Routing requires both origin and destination' });
  }
  if (!hasOrigin && !hasDestination && !value.query) {
    ctx.addIssue({ code: 'custom', path: ['query'], message: 'Place discovery requires a query when no route is requested' });
  }
});

const AttractionSearchArgsSchema = z.object({
  location: boundedText(160),
  category: boundedText(120).optional(),
});

const ClarifyingQuestionArgsSchema = z.object({
  question: boundedText(500),
});

export type TravelToolValidation =
  | { status: 'ok'; value: any }
  | { status: 'invalid'; issues: string[] }
  | { status: 'unknown' };

function issuePaths(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : 'root';
    return `${path}:${issue.code}`;
  });
}

export function validateTravelToolArgs(name: string, args: unknown): TravelToolValidation {
  const schemas: Record<string, z.ZodTypeAny> = {
    search_flights: FlightSearchArgsSchema,
    search_hotels: HotelSearchArgsSchema,
    get_places_routing: PlacesRoutingArgsSchema,
    search_attractions: AttractionSearchArgsSchema,
    ask_clarifying_question: ClarifyingQuestionArgsSchema,
  };
  const schema = schemas[name];
  if (!schema) return { status: 'unknown' };
  const result = schema.safeParse(args);
  return result.success
    ? { status: 'ok', value: result.data }
    : { status: 'invalid', issues: issuePaths(result.error) };
}

export type JsonContractResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'INVALID_JSON' | 'SCHEMA_MISMATCH'; issues: string[] };

function unwrapJsonFence(raw: string): string {
  const trimmed = String(raw || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function parseJsonContract<T>(raw: string, schema: z.ZodType<T>): JsonContractResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapJsonFence(raw));
  } catch {
    return { ok: false, code: 'INVALID_JSON', issues: ['root:invalid_json'] };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, code: 'SCHEMA_MISMATCH', issues: issuePaths(result.error) };
  }
  return { ok: true, value: result.data };
}

export function parsePipelineIdeaSpec(raw: string) {
  return parseJsonContract(raw, PipelineIdeaSpecSchema);
}

export function parsePipelineActionSpec(raw: string) {
  return parseJsonContract(raw, PipelineActionSpecSchema);
}
