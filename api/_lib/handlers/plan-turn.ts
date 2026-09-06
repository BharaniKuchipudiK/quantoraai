import { applyCors, isRateLimited } from '../rate-limit.js';
import { requireActiveSession } from '../authz.js';
import { fetchApiGatewayKey } from '../../autocomplete.js';
import { recordTurnPlanEvent } from '../store.js';
import { routeJson } from '../semantic-router.js';
import {
  TURN_PLAN_SCHEMA,
  cleanTurnPlan,
  planTurnDeterministically,
  plannerPrompt,
  reconcileTurnPlan,
  type TurnDesk,
  type TurnPlanInput,
} from '../turn-planner.js';

const REQUESTS_PER_MINUTE = 90;
const PLANNER_TIMEOUT_MS = 6_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`turn planner exceeded ${ms}ms`)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

/*
 * POST /api/plan-turn — the one model-owned decision per turn (Phase 7).
 *
 * Always answers 200 with a plan. When no provider answers in time, or the
 * answer is unreadable or unconfident, the plan is the deterministic one and
 * `source` says so; a planner that could take a turn down would be worse than
 * the regexes it replaces.
 */
export default async function handler(req: any, res: any) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;
  if (isRateLimited(`plan-turn:user:${sessionUser.sub}`, REQUESTS_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: 'Too many requests.' });
  }

  const body = req.body || {};
  if (typeof body.message !== 'string') return res.status(400).json({ error: 'Message must be text.' });
  const input: TurnPlanInput = {
    message: body.message,
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    history: Array.isArray(body.history) ? body.history : [],
    pinnedDesk: (body.pinnedDesk as TurnDesk) || null,
    codingDeskOpen: body.codingDeskOpen === true,
    hasDeskFiles: body.hasDeskFiles === true,
    activeOfficeKind: typeof body.activeOfficeKind === 'string' ? body.activeOfficeKind : null,
  };
  const buildOwned = body.buildOwned === true;
  const deterministic = planTurnDeterministically(input);

  let model = null;
  let error: string | null = null;
  const plannerStartedAt = Date.now();
  try {
    const geminiGatewayKey = process.env.GEMINI_API_KEY ? null : await fetchApiGatewayKey('GEMINI').catch(() => null);
    const keys = {
      anthropic: process.env.ANTHROPIC_API_KEY || null,
      gemini: process.env.GEMINI_API_KEY || geminiGatewayKey || null,
      openRouter: process.env.OPENROUTER_API_KEY || null,
    };
    const raw = await withTimeout(
      routeJson(plannerPrompt(input), TURN_PLAN_SCHEMA, keys, { system: 'Return the turn plan as the requested JSON object.', schemaName: 'quantora_turn_plan' }),
      PLANNER_TIMEOUT_MS,
    );
    model = cleanTurnPlan(raw);
  } catch (err: any) {
    error = String(err?.message || err || 'turn planner failed').slice(0, 200);
    console.warn('Turn planner unavailable, deterministic plan used:', error);
  }

  const plan = reconcileTurnPlan({ model, deterministic, pinnedDesk: input.pinnedDesk, buildOwned });
  // Measured, every time (Phase 7, second cut): lanes, source, agreement,
  // latency and the error class — never the message. See turn-plan-ledger.ts.
  recordTurnPlanEvent({
    lane: plan.lane,
    desk: plan.desk ?? null,
    officeKind: plan.officeKind ?? null,
    source: plan.source,
    agreed: plan.agreed === true,
    confidence: plan.confidence,
    deterministicLane: deterministic.lane,
    plannerMs: Date.now() - plannerStartedAt,
    plannerError: error,
    pinnedDesk: input.pinnedDesk ?? null,
  });
  return res.status(200).json({ plan, deterministic, model, ...(error ? { error } : {}) });
}
