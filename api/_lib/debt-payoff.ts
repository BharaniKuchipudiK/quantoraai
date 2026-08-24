/**
 * Deterministic debt-payoff engine (ADR-025, P3).
 *
 * Given a set of debts and a monthly budget, it simulates the two standard
 * payoff strategies — avalanche (highest APR first) and snowball (smallest
 * balance first) — and reports months to freedom, total interest, and payoff
 * order. Pure and network-free: the numbers come from arithmetic, never a
 * language model, so a debt-consolidation answer is defensible and reproducible.
 */

export type Debt = {
  name: string;
  balance: number;
  apr: number; // annual percentage rate, e.g. 19.99
  minPayment: number;
};

export type PayoffStrategy = "avalanche" | "snowball";

export type PayoffResult = {
  strategy: PayoffStrategy;
  feasible: boolean; // false when the budget cannot outpace interest within the horizon
  months: number;
  totalInterest: number;
  totalPaid: number;
  order: string[]; // names in the order they are cleared
  reason?: string; // set when infeasible
};

const HORIZON_MONTHS = 1200; // 100 years — anything longer is "never pays off"
const CENT = 0.005;

function monthlyRate(apr: number): number {
  return apr / 100 / 12;
}

function orderIndices(balances: number[], debts: Debt[], strategy: PayoffStrategy): number[] {
  const active = balances.map((_, i) => i).filter((i) => balances[i] > CENT);
  return active.sort((a, b) =>
    strategy === "avalanche" ? debts[b].apr - debts[a].apr : balances[a] - balances[b],
  );
}

export function simulatePayoff(
  debts: Debt[],
  extraMonthly: number,
  strategy: PayoffStrategy,
): PayoffResult {
  const base: PayoffResult = {
    strategy, feasible: false, months: 0, totalInterest: 0, totalPaid: 0, order: [],
  };
  if (!debts.length) return { ...base, feasible: true };

  const budget = debts.reduce((sum, d) => sum + Math.max(0, d.minPayment), 0) + Math.max(0, extraMonthly);
  if (budget <= 0) return { ...base, reason: "No monthly budget to apply." };

  const balances = debts.map((d) => Math.max(0, d.balance));
  const order: string[] = [];
  let totalInterest = 0;
  let months = 0;

  while (balances.some((b) => b > CENT) && months < HORIZON_MONTHS) {
    months += 1;

    // 1) Interest accrues on every outstanding balance.
    for (let i = 0; i < balances.length; i += 1) {
      if (balances[i] > CENT) {
        const interest = balances[i] * monthlyRate(debts[i].apr);
        balances[i] += interest;
        totalInterest += interest;
      }
    }

    // 2) Pay each active debt its minimum; freed minimums roll into the pool.
    let pool = budget;
    for (let i = 0; i < balances.length; i += 1) {
      if (balances[i] > CENT) {
        const pay = Math.min(debts[i].minPayment, balances[i]);
        balances[i] -= pay;
        pool -= pay;
      }
    }
    if (pool < -CENT) {
      return { ...base, months, totalInterest, reason: "The minimum payments alone exceed the monthly budget." };
    }

    // 3) Direct the remaining pool at the target debt(s) by strategy.
    for (const i of orderIndices(balances, debts, strategy)) {
      if (pool <= CENT) break;
      const pay = Math.min(pool, balances[i]);
      balances[i] -= pay;
      pool -= pay;
    }

    // 4) Record any debts cleared this month.
    for (let i = 0; i < balances.length; i += 1) {
      if (balances[i] <= CENT && !order.includes(debts[i].name)) order.push(debts[i].name);
    }
  }

  const feasible = balances.every((b) => b <= CENT);
  if (!feasible) {
    return { ...base, months, totalInterest, reason: `Balances do not clear within ${HORIZON_MONTHS} months — the budget barely covers interest.` };
  }

  const principal = debts.reduce((sum, d) => sum + Math.max(0, d.balance), 0);
  return {
    strategy,
    feasible: true,
    months,
    totalInterest: Number(totalInterest.toFixed(2)),
    totalPaid: Number((principal + totalInterest).toFixed(2)),
    order,
  };
}

export type PayoffComparison = {
  avalanche: PayoffResult;
  snowball: PayoffResult;
  recommended: PayoffStrategy | null; // the one that clears sooner / cheaper, or null if infeasible
  interestSaved: number; // avalanche vs snowball interest gap (>=0), 0 if either infeasible
};

export function comparePayoff(debts: Debt[], extraMonthly: number): PayoffComparison {
  const avalanche = simulatePayoff(debts, extraMonthly, "avalanche");
  const snowball = simulatePayoff(debts, extraMonthly, "snowball");

  let recommended: PayoffStrategy | null = null;
  let interestSaved = 0;
  if (avalanche.feasible && snowball.feasible) {
    // Avalanche is never worse on interest; prefer it unless snowball ties.
    recommended = avalanche.totalInterest <= snowball.totalInterest ? "avalanche" : "snowball";
    interestSaved = Number(Math.abs(avalanche.totalInterest - snowball.totalInterest).toFixed(2));
  } else if (avalanche.feasible) {
    recommended = "avalanche";
  } else if (snowball.feasible) {
    recommended = "snowball";
  }

  return { avalanche, snowball, recommended, interestSaved };
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function months(n: number): string {
  const years = Math.floor(n / 12);
  const rem = n % 12;
  const parts = [];
  if (years) parts.push(`${years} yr${years > 1 ? "s" : ""}`);
  if (rem) parts.push(`${rem} mo`);
  return parts.join(" ") || "0 mo";
}

/** Deterministic, sourced-by-arithmetic write-up of a payoff comparison. */
export function formatDebtPlan(
  comparison: PayoffComparison,
  opts: { assumedMinimums?: boolean } = {},
): string {
  const { avalanche, snowball, recommended } = comparison;

  if (!recommended) {
    const reason = avalanche.reason || snowball.reason || "the numbers don't support a payoff plan";
    return `I can't build a payoff plan from these numbers: **${reason}**. If the monthly budget only covers interest, the balances never clear — increase the amount you can put toward the debt, and I'll recompute.`;
  }

  const best = recommended === "avalanche" ? avalanche : snowball;
  const other = recommended === "avalanche" ? snowball : avalanche;
  const lines = [
    `**Recommended: ${recommended === "avalanche" ? "Avalanche" : "Snowball"} method.**`,
    "",
    `- Debt-free in **${months(best.months)}** (${best.months} payments)`,
    `- Total interest paid: **${money(best.totalInterest)}**`,
    `- Total paid: **${money(best.totalPaid)}**`,
    `- Payoff order: ${best.order.join(" → ")}`,
  ];

  if (other.feasible) {
    const label = recommended === "avalanche" ? "Snowball" : "Avalanche";
    const interestGap = Number((other.totalInterest - best.totalInterest).toFixed(2));
    lines.push(
      "",
      `Versus **${label}**: ${months(other.months)}, ${money(other.totalInterest)} interest` +
        (interestGap > 0 ? ` — the recommended plan saves **${money(interestGap)}** in interest.` : `.`),
    );
  }

  lines.push(
    "",
    "These figures are a deterministic simulation of your inputs — not a model estimate.",
  );
  if (opts.assumedMinimums) {
    lines.push(
      "",
      "_Note: for any debt where you didn't give a minimum, I assumed the greater of 2% of the balance or 25/month. Tell me the real minimums to tighten this._",
    );
  }
  return lines.join("\n");
}
