/**
 * How the platform names a future month.
 *
 * A program's whole value is that it commits to a date, so every desk that
 * names one has to name it the same way. This was written for the savings
 * program and immediately needed by the debt program; a second private copy
 * would be two places for the same off-by-one to hide.
 *
 * Pure and network-free.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The month that falls `monthsAhead` after `from`, as "October 2027".
 *
 * Deliberately month-precision: a day on a multi-year projection is false
 * precision — it would imply the plan knows which Tuesday the last payment
 * clears. Built from a fixed table rather than a locale formatter so the same
 * inputs produce the same string on every machine that runs it.
 */
export function monthLabel(from: Date, monthsAhead: number): string {
  const at = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + Math.round(monthsAhead), 1));
  return `${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}
