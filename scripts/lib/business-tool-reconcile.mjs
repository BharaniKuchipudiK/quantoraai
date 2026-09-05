/*
 * DOES THE NUMBER COME FROM THE DATA?
 *
 * The judgment half of the deployed golden's business-tool transaction, kept
 * separate from the browser half so it can be run with the bug present.
 *
 * A gate whose decision logic only ever executes against a live model turn is
 * one nobody can watch fail (§4). The browser part — find the frame, fill the
 * form, click — is Playwright's problem. THIS part is the actual assertion,
 * and it has its own test with a hardcoded-total fixture in it.
 *
 * WHY THIS EXISTS AT ALL
 *
 * The platform's real output is internal tools: a form, a dropdown, rows that
 * accumulate, and a figure computed from those rows. A user's consulting CRM
 * showed weighted pipeline value, bench burn and margin against a 38% hurdle —
 * every one of them a number that is either derived or invented, and nothing
 * in the deployed gate could tell the difference. Its own Preview checks
 * listed "Totals match their rows"; the deployed gate never asserted it.
 *
 * The trap this is shaped around: asserting a total EQUALS A NUMBER WE PREDICT
 * passes for a build that hardcoded that number and computes nothing. That is
 * the confidently-wrong class — reachability is not correctness, and a
 * dashboard of invented figures renders beautifully. So the total is judged
 * against the rows twice, and against the user's own input once:
 *
 *   1. seeded total === sum of seeded rows      (it is derived, not decorative)
 *   2. total after add === sum of rows after    (it RE-derives; a constant dies here)
 *   3. total after add === total before + entered value  (it derived the RIGHT thing)
 *
 * Check 2 is the one a hardcoded total cannot survive: it agrees with the seed
 * data by construction and never moves.
 */

/**
 * @param {{ seededRows: number, seededTotal: number, afterRows: number,
 *           seededSum: number, afterSum: number, afterTotal: number,
 *           addedValue: number, minimumSeededRows?: number }} input
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function reconcilePipeline(input) {
  const {
    seededRows, seededSum, seededTotal,
    afterRows, afterSum, afterTotal,
    addedValue, minimumSeededRows = 2,
  } = input;

  for (const [name, value] of Object.entries({ seededSum, seededTotal, afterSum, afterTotal, addedValue })) {
    if (!Number.isFinite(value)) {
      return { ok: false, code: 'unreadable_number', message: `${name} is not a finite number (received ${value}).` };
    }
  }

  if (seededRows < minimumSeededRows) {
    return {
      ok: false,
      code: 'too_few_rows',
      message: `The tool seeded ${seededRows} deal row(s); the brief asked for ${minimumSeededRows}.`,
    };
  }

  if (seededTotal !== seededSum) {
    return {
      ok: false,
      code: 'seed_total_mismatch',
      message: `Totals do not match their rows before any interaction: the tool shows ${seededTotal} over rows summing to `
        + `${seededSum}. A number that does not come from the data is the defect this transaction exists to catch.`,
    };
  }

  if (afterRows !== seededRows + 1) {
    return {
      ok: false,
      code: 'row_not_added',
      message: `Submitting the deal form left ${afterRows} row(s) where ${seededRows + 1} were expected — the tool renders `
        + 'a form that does nothing, which is the dead-control class wearing a business tool\'s clothes.',
    };
  }

  if (afterTotal !== afterSum) {
    return {
      ok: false,
      code: 'total_stopped_matching_rows',
      message: `The total stopped matching its rows after a deal was added: shows ${afterTotal}, rows sum to ${afterSum}. `
        + 'This is the hardcoded-total case — it agreed with the seed data by construction and never recomputed.',
    };
  }

  if (afterTotal !== seededTotal + addedValue) {
    return {
      ok: false,
      code: 'delta_wrong',
      message: `The total moved by ${afterTotal - seededTotal} after adding a deal worth ${addedValue}. Rows and total `
        + 'agree with each other but not with what the user actually entered.',
    };
  }

  return { ok: true };
}
