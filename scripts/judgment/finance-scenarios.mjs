/**
 * Finance judgment scenarios — what a GOOD ANSWER looks like, not what the code
 * does.
 *
 * WHY THIS FILE EXISTS
 *
 * The debt engine had twenty passing tests the morning it told someone 10,000
 * short every month they would be "Debt-free in 1 yr (12 payments)", and signed
 * it "a deterministic simulation of your inputs — not a model estimate". Every
 * test passed because every test asked whether the arithmetic RAN. None asked
 * whether the answer was TRUE.
 *
 * A scenario here is a situation with a known-correct shape of answer. The gate
 * drives the real gateway — no model call, no network — and checks the answer
 * against that shape plus a set of invariants that hold for every scenario.
 *
 * Adding a scenario is the cheapest way to make a class of wrong answer
 * impossible. Adding one that reproduces a defect BEFORE fixing it is the point.
 */

/**
 * `answers: false` means the deterministic engine must decline and let the turn
 * stay a conversation. That is an outcome, not a gap — a money engine that
 * answers everything is the failure mode, not the goal.
 */
export const FINANCE_SCENARIOS = [
  {
    id: 'debt/shortfall-income-is-not-capacity',
    why: 'The defect this whole harness exists for. Obligations exceed income.',
    domain: 'finance',
    message:
      'Help me pay off my debts: $400,000 at 4% (min $18,000) and $60,000 at 24% (min $7,000). I only earn $15,000 per month.',
    declared: { minimums: 25000, income: 15000 },
    answers: true,
    mustSay: [/shortfall of \*\*10,000 every month\*\*/],
    // The label a plan prints — not the phrase 'not the payoff order', which is a refusal.
    mustNotSay: [/Debt-free in/, /Payoff order:/],
  },
  {
    id: 'debt/shortfall-narrow-margin',
    why: 'One rupee short is still short. The boundary must not round in the platform\'s favour.',
    domain: 'finance',
    message:
      'Pay off my debts: $10,000 at 12% (min $3,000) and $5,000 at 20% (min $2,001). I earn $5,000 per month.',
    declared: { minimums: 5001, income: 5000 },
    answers: true,
    mustSay: [/shortfall/i],
    mustNotSay: [/Debt-free in/],
  },
  {
    id: 'debt/exactly-affordable',
    why: 'Minimums exactly equal to income is NOT a shortfall — an off-by-one here refuses a workable plan.',
    domain: 'finance',
    message:
      'Pay off my debts: $10,000 at 12% (min $3,000) and $5,000 at 20% (min $2,000). I earn $5,000 per month.',
    declared: { minimums: 5000, income: 5000 },
    answers: true,
    mustSay: [/Debt-free in/],
    mustNotSay: [/shortfall/i],
  },
  {
    id: 'debt/no-capacity-stated',
    why: 'Debts with nothing said about what they land against. Ask, do not assume.',
    domain: 'finance',
    message: 'Help me pay off my debts: $5,000 at 19.99% (min $150) and $3,000 at 24% (min $90)',
    answers: true,
    mustSay: [/240 a month/, /Where do those payments sit/],
    mustNotSay: [/Debt-free in/],
  },
  {
    id: 'debt/general-question-no-numbers',
    why: 'The trigger word alone once consumed the turn and demanded balances, forever.',
    domain: 'finance',
    message: 'how does debt affect my credit score?',
    answers: false,
  },
  {
    id: 'debt/consolidation-worse-rate-longer-term',
    why: 'A lower monthly bought with a longer term is relief paid for in interest. Say so.',
    domain: 'finance',
    message:
      'I can consolidate at 9% over 7 years. My debts: $400,000 at 4% (min $18,000) and $60,000 at 24% (min $7,000). I earn $15,000 a month.',
    declared: { minimums: 25000, income: 15000 },
    answers: true,
    mustSay: [/is \*\*worse\*\* than what you already pay/, /breathing room with interest/],
  },
  {
    id: 'debt/crisis-gateway-must-not-block-a-signed-out-answer',
    why: 'The crisis strategist is wired ahead of the payoff gateway and needs a session and a store. Consuming the turn handed a signed-out user "Sign in to continue" for a question the platform answers from the message alone.',
    domain: 'finance',
    message:
      'I can consolidate at 9% over 7 years. My debts: $400,000 at 4% (min $18,000) and $60,000 at 24% (min $7,000). I earn $15,000 a month.',
    declared: { minimums: 25000, income: 15000 },
    answers: true,
    mustSay: [/Consolidating/],
    mustNotSay: [/Sign in to continue/],
  },
  {
    id: 'debt/isolation-non-finance-domain',
    why: 'A Finance engine must never answer a Coding or Travel turn.',
    domain: 'travel',
    message:
      'Help me pay off my debts: $5,000 at 19.99% (min $150) and $3,000 at 24%, I can put $600/month extra',
    answers: false,
  },
  {
    id: 'savings/general-question-no-numbers',
    why: '"save" is the trigger, so every tax question matched it and got a demand for three numbers.',
    domain: 'finance',
    message: 'how can I save on taxes this year?',
    answers: false,
  },
  {
    id: 'savings/complete-request',
    why: 'A savings projection with every number present should compute.',
    domain: 'finance',
    message:
      'I want to save $20,000 for a down payment in 3 years, I have $2,000 now and can put away $400/month at 4% return',
    answers: true,
  },
];
