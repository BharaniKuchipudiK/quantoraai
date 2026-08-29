#!/usr/bin/env node
/**
 * Finance judgment gate — drives the real Finance gateways with no model call
 * and no network, and checks the ANSWER rather than the plumbing.
 *
 * The structural gates already ask "does this control reach something", "does
 * this claim name a module", "does this link resolve". None of them can catch a
 * confidently wrong number, which is the only defect in a money product that
 * actually costs the user something. This one can.
 *
 * Two layers of checking:
 *   - Per scenario: what this specific answer must and must not say.
 *   - Across every scenario: invariants that hold for ALL Finance answers.
 * The invariants are the durable half. A scenario stops one bug; an invariant
 * stops a category.
 */

// Run under tsx (see package.json) so the TypeScript engines import directly —
// this drives the SAME modules production serves, not a re-implementation.
const { FINANCE_SCENARIOS } = await import('./judgment/finance-scenarios.mjs');
const { handleDebtPlan } = await import('../api/_lib/debt-gateway.ts');
const { handleSavingsGoal } = await import('../api/_lib/savings-gateway.ts');

const GATEWAYS = [handleDebtPlan, handleSavingsGoal];

/** Collects what a gateway streamed, and refuses to be written to twice. */
function recorder() {
  const chunks = [];
  let ended = false;
  return {
    chunks,
    setHeader() {}, getHeader() { return undefined; },
    writeHead() {},
    write(chunk) { chunks.push(String(chunk)); return true; },
    end() { ended = true; },
    status() { return { json() { return undefined; } }; },
    json() { return undefined; },
    get ended() { return ended; },
    /** The assistant text, reassembled from the SSE frames. */
    text() {
      return chunks
        .map((chunk) => {
          const match = chunk.match(/^data: (\{[\s\S]*\})\s*$/);
          if (!match) return '';
          try {
            const parsed = JSON.parse(match[1]);
            return typeof parsed.text === 'string' ? parsed.text : '';
          } catch { return ''; }
        })
        .join('');
    },
  };
}

async function run(scenario) {
  const res = recorder();
  const req = {
    method: 'POST',
    body: { studioDomain: scenario.domain, message: scenario.message },
    headers: {},
    socket: { remoteAddress: `judgment-${scenario.id}` },
  };
  let handled = false;
  for (const gateway of GATEWAYS) {
    // eslint-disable-next-line no-await-in-loop
    if (await gateway(req, res)) { handled = true; break; }
  }
  return { handled, text: res.text() };
}

const failures = [];
const fail = (scenario, message) => failures.push(`${scenario.id}\n    ${message}\n    (${scenario.why || 'no rationale recorded'})`);

const PAYOFF_DATE = /Debt-free in|clears in \*\*|payments\)/;
const MODAL = /<quantora-modal>([\s\S]*?)<\/quantora-modal>/;

for (const scenario of FINANCE_SCENARIOS) {
  const first = await run(scenario);

  if (scenario.answers === false) {
    if (first.handled) fail(scenario, 'A deterministic engine consumed a turn it cannot answer from arithmetic. It must fall through so the turn stays a conversation.');
    continue;
  }

  if (!first.handled) {
    fail(scenario, 'No Finance engine answered a turn it should answer deterministically.');
    continue;
  }

  const text = first.text;
  if (!text.trim()) {
    fail(scenario, 'The engine consumed the turn and streamed nothing.');
    continue;
  }

  for (const pattern of scenario.mustSay || []) {
    if (!pattern.test(text)) fail(scenario, `The answer never says ${pattern}.`);
  }
  for (const pattern of scenario.mustNotSay || []) {
    if (pattern.test(text)) fail(scenario, `The answer says ${pattern}, and must not.`);
  }

  /*
   * INVARIANT 1 — a stated income is never payment capacity.
   *
   * This is the defect, generalised. Whenever a scenario declares minimums
   * larger than the income, no answer may carry a payoff date, however it is
   * phrased. A date here is the engine having assumed money that is not there.
   */
  const { minimums, income } = scenario.declared || {};
  if (typeof minimums === 'number' && typeof income === 'number' && minimums > income) {
    if (PAYOFF_DATE.test(text)) {
      fail(scenario, 'A payoff date appears in an answer where the minimums exceed the stated income. That date assumes money the user does not have.');
    }
  }

  /*
   * INVARIANT 2 — a refusal may not also assert.
   * "I won't give you a payoff date" followed by a payoff date is worse than
   * either alone: it reads as careful while being wrong.
   */
  if (/I won't give you a payoff date/.test(text) && /Debt-free in/.test(text)) {
    fail(scenario, 'The answer refuses to give a payoff date and then gives one.');
  }

  /*
   * INVARIANT 3 — every deterministic answer leaves a next move.
   * A gateway returns out of the pipeline before the conversation engine runs,
   * so if the answer does not carry its own follow-ups, the turn dead-ends.
   */
  const modal = text.match(MODAL);
  if (!modal) {
    fail(scenario, 'The answer ends the turn with no next move. A deterministic gateway bypasses the conversation engine, so it must carry its own follow-ups.');
  } else {
    let parsed = null;
    try { parsed = JSON.parse(modal[1]); } catch { /* reported below */ }
    if (!parsed || !Array.isArray(parsed.options) || parsed.options.length < 2) {
      fail(scenario, 'The follow-up block is missing, unparseable, or offers fewer than two options.');
    } else {
      for (const option of parsed.options) {
        if (!option?.id || !option?.title || !option?.value) {
          fail(scenario, `A follow-up option is incomplete: ${JSON.stringify(option)}`);
        } else if (!/[.?]$/.test(option.value)) {
          // The value is posted AS the user's next message. A fragment sends a
          // broken sentence on their behalf.
          fail(scenario, `A follow-up would post a fragment as the user's message: "${option.value}"`);
        }
      }
    }
  }

  /*
   * INVARIANT 4 — determinism.
   * These engines are sold as "not a model estimate". Any dependence on time,
   * randomness or call order makes that claim false, and would surface as an
   * answer that changes when nothing did.
   */
  const second = await run(scenario);
  if (second.text !== text) {
    fail(scenario, 'The same question produced a different answer on the second run. A deterministic engine cannot vary.');
  }
}

if (failures.length) {
  console.error(`\nFinance judgment gate FAILED — ${failures.length} finding(s):\n`);
  for (const entry of failures) console.error(`  ${entry}\n`);
  console.error(`These check whether the ANSWER is true, not whether the code ran. A
passing unit test suite is not evidence here: the debt engine had twenty green
tests the morning it told someone underwater they would be debt-free in a year.
`);
  process.exit(1);
}

console.log(`Finance judgment gate passed — ${FINANCE_SCENARIOS.length} scenarios, answers checked against outcome and invariant.`);
