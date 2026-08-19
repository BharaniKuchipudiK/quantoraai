import { parseExplicitMoney } from "./affordability-intent.js";

export type FinancialContextCommand =
  | { kind: "set_liquid_cash"; amount: number; currency: string }
  | { kind: "set_minimum_reserve"; amount: number; currency: string }
  | { kind: "add_commitment"; label: string; key: string; amount: number; currency: string; dueDate: string }
  | { kind: "set_commitments_reviewed_through"; reviewedThrough: string };

function isoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) return null;
  return trimmed;
}

function moneyCommand(kind: "set_liquid_cash" | "set_minimum_reserve", text: string): FinancialContextCommand | null {
  const money = parseExplicitMoney(text);
  if (money.amount === null || !money.currency) return null;
  return { kind, amount: money.amount, currency: money.currency };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "commitment";
}

/**
 * V1 accepts only explicit, deterministic commands. Ordinary chat is never
 * mined for financial facts. This keeps user approval visible and auditable.
 */
export function parseFinancialContextCommand(message: unknown): FinancialContextCommand | null {
  if (typeof message !== "string") return null;
  const text = message.trim();
  if (!text) return null;

  const liquid = text.match(/^(?:set|update)\s+my\s+liquid\s+cash\s+to\s+(.+)$/i);
  if (liquid) return moneyCommand("set_liquid_cash", liquid[1]);

  const reserve = text.match(/^(?:set|update)\s+my\s+(?:minimum\s+)?reserve\s+to\s+(.+)$/i);
  if (reserve) return moneyCommand("set_minimum_reserve", reserve[1]);

  const coverage = text.match(/^(?:set\s+)?commitments?\s+reviewed\s+through\s+(\d{4}-\d{2}-\d{2})$/i);
  if (coverage) {
    const reviewedThrough = isoDate(coverage[1]);
    return reviewedThrough ? { kind: "set_commitments_reviewed_through", reviewedThrough } : null;
  }

  const commitment = text.match(/^add\s+commitment\s*:\s*([^,]{1,80}),\s*(.+?),\s*due\s+(\d{4}-\d{2}-\d{2})$/i);
  if (commitment) {
    const label = commitment[1].trim();
    const money = parseExplicitMoney(commitment[2]);
    const dueDate = isoDate(commitment[3]);
    if (!label || money.amount === null || !money.currency || !dueDate) return null;
    return {
      kind: "add_commitment",
      label,
      key: `finance.commitment.${slug(label)}.${dueDate.replace(/-/g, "")}`,
      amount: money.amount,
      currency: money.currency,
      dueDate,
    };
  }

  return null;
}

export function endOfUtcDay(date: string): string {
  return `${date}T23:59:59.999Z`;
}
