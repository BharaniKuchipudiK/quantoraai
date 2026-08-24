/**
 * Parses an explicit savings-goal request in a Finance turn: the target amount,
 * the horizon, the monthly contribution, and optionally a starting balance and a
 * return rate. Like the other Finance gateways, it fires only on a clear ask.
 *
 * Example it handles:
 *   "I want to save $20,000 for a house down payment in 3 years, I have $2,000
 *    now and can put away $400/month at 4% return"
 */

export type SavingsIntent = {
  matched: boolean;
  goal: number | null;
  current: number;
  monthly: number | null;
  months: number | null;
  annualRatePct: number;
};

const TRIGGER = /\b(save|savings|saving up|save up|down ?payment|emergency fund|nest egg|save for|saving for)\b/i;

function amount(raw: string | undefined, mult: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  const m = mult?.toLowerCase() === "m" ? 1_000_000 : mult?.toLowerCase() === "k" ? 1_000 : 1;
  return Number((n * m).toFixed(2));
}

function firstAmountAfter(message: string, keywords: string): number | null {
  const re = new RegExp(`(?:${keywords})[^0-9$]{0,20}\\$?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*([kKmM])?`, "i");
  const m = message.match(re);
  return m ? amount(m[1], m[2]) : null;
}

export function parseSavingsIntent(message: unknown): SavingsIntent {
  const empty: SavingsIntent = { matched: false, goal: null, current: 0, monthly: null, months: null, annualRatePct: 0 };
  if (typeof message !== "string" || !message.trim()) return empty;
  if (!TRIGGER.test(message)) return empty;

  // Monthly contribution — must carry a per-month connector ("/", "per", or the
  // word "monthly"), so a bare horizon like "18 months" is NOT mistaken for it.
  const monthlyMatch = message.match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kKmM])?\s*(?:(?:\/|per\s+)\s*months?|monthly)\b/i);
  const monthly = monthlyMatch ? amount(monthlyMatch[1], monthlyMatch[2]) : null;

  // Horizon: "in 3 years", "within 18 months", "5-year".
  let months: number | null = null;
  const horizon = message.match(/\b(?:in|within|over|by)?\s*(\d+)[\s-]*(year|yr|month|mo)s?\b/i);
  if (horizon) {
    const n = Number(horizon[1]);
    months = /year|yr/i.test(horizon[2]) ? n * 12 : n;
  }

  // Return rate: only when clearly a return/interest figure.
  let annualRatePct = 0;
  const rate = message.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (rate && /\b(return|interest|apy|apr|growth|invest\w*|yield)\b/i.test(message)) {
    annualRatePct = Number(rate[1]);
  }

  const current = firstAmountAfter(message, "have|saved|currently|already|starting(?:\\s+with)?|got") ?? 0;

  // Goal: an amount tied to a goal keyword, else the largest amount that isn't
  // the monthly or the starting balance.
  let goal = firstAmountAfter(message, "save(?:\\s+up)?(?:\\s+(?:for|to))?|goal(?:\\s+of)?|target|reach|need|for a");
  if (goal === null) {
    const all = [...message.matchAll(/\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kKmM])?/g)]
      .map((m) => amount(m[1], m[2]))
      .filter((n): n is number => n !== null && n > 0);
    const candidates = all.filter((n) => n !== monthly && n !== current);
    goal = candidates.length ? Math.max(...candidates) : null;
  }

  return { matched: true, goal, current, monthly, months, annualRatePct };
}
