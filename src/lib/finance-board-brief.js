/**
 * Finance desk board state. Pure and testable — decides whether the Finance
 * board shows and what deterministic tools it offers. The board is a launcher:
 * each action drops an editable example into the composer so the user swaps in
 * their own numbers, then the Finance gateways answer deterministically.
 */

export const FINANCE_ACTIONS = [
  { id: 'fx', label: 'Convert currency', prompt: 'Convert 1,000 USD to SGD' },
  { id: 'debt', label: 'Debt payoff plan', prompt: 'Help me pay off $5,000 at 19.99% (min $150) and $3,000 at 24%, $600/month' },
  { id: 'savings', label: 'Savings goal', prompt: 'Save $20,000 in 3 years, I have $2,000 now and can put away $400/month at 4%' },
  { id: 'afford', label: 'Can I afford it?', prompt: 'Can I afford SGD 3,000?' },
];

/** Show the desk once the user has actually started a Finance conversation. */
export function deriveFinanceBrief({ messages = [] } = {}) {
  const hasUserTurn = (messages || []).some((message) => message?.sender === 'user' && message?.text);
  return { active: Boolean(hasUserTurn), actions: FINANCE_ACTIONS };
}
