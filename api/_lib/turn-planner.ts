/*
 * PHASE 7, FIRST CUT — ONE MODEL-OWNED DECISION PER TURN.
 *
 * Until now a turn's lane was decided by regexes on the client before any
 * model read the request: a word ("excel") sent a website brief to the Excel
 * generator; a word ("trip") moved a chat to Travel. Cursor and Claude Code do
 * not work that way — the model reads the whole brief and decides what to
 * make, and tools are chosen in context.
 *
 * This module is the planner. Given the message, what is attached, a bounded
 * history and the desk the chat is pinned to, it asks one model for a lane —
 * build, office, advisor or chat — and reconciles the answer with the
 * deterministic rules that used to decide alone. Those rules are now the
 * fallback (when no model answers, or answers without confidence) and the
 * corpus the planner is measured against; they never decide on their own
 * when a confident plan exists. Two invariants hold whatever the model says:
 * a pinned desk never changes, and a build the desk already owns is never
 * vetoed into chat.
 */
import { detectBuildIntent, resolveIsCodingRequest } from '../../shared/build-intent.js';
import { isBuildSessionActive, turnBelongsToBuild } from '../../shared/build-session.js';
import { inferStudioDomain } from '../../shared/studio/domain-inference.js';
import { detectOfficeIntent } from '../../shared/office-intent.js';

export type TurnLane = 'build' | 'office' | 'advisor' | 'chat';
export type TurnDesk = 'coding' | 'travel' | 'finance' | 'education' | 'research';
export type OfficeKind = 'powerpoint' | 'excel' | 'word' | 'pdf';

export type TurnPlan = {
  lane: TurnLane;
  desk: TurnDesk | null;
  officeKind: OfficeKind | null;
  buildMode: boolean;
  confidence: number;
  reason: string;
};

export type ReconciledTurnPlan = TurnPlan & {
  source: 'planner' | 'fallback';
  /** True when the model and the deterministic rules named the same lane. */
  agreed: boolean;
};

export type TurnPlanInput = {
  message: string;
  attachments?: Array<{ name?: string; kind?: string }>;
  history?: Array<{ sender?: string; text?: string }>;
  pinnedDesk?: TurnDesk | null;
  codingDeskOpen?: boolean;
  hasDeskFiles?: boolean;
  activeOfficeKind?: string | null;
};

const LANES: TurnLane[] = ['build', 'office', 'advisor', 'chat'];
const DESKS: TurnDesk[] = ['coding', 'travel', 'finance', 'education', 'research'];
const ADVISOR_DESKS: TurnDesk[] = ['travel', 'finance', 'education', 'research'];
const OFFICE_KINDS: OfficeKind[] = ['powerpoint', 'excel', 'word', 'pdf'];

/** Below this the model's answer is advice, and the deterministic rules decide. */
export const TURN_PLAN_CONFIDENCE_FLOOR = 0.7;
export const TURN_PLAN_HISTORY_TURNS = 6;
export const TURN_PLAN_HISTORY_CHARS = 600;

export const TURN_PLAN_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    lane: { type: 'string', enum: LANES },
    desk: { type: 'string', enum: [...DESKS, 'none'] },
    officeKind: { type: 'string', enum: [...OFFICE_KINDS, 'none'] },
    buildMode: { type: 'boolean' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['lane', 'desk', 'officeKind', 'buildMode', 'confidence', 'reason'],
  additionalProperties: false,
});

function asDesk(value: unknown): TurnDesk | null {
  const text = String(value || '').toLowerCase();
  return (DESKS as string[]).includes(text) ? (text as TurnDesk) : null;
}

function asOfficeKind(value: unknown): OfficeKind | null {
  const text = String(value || '').toLowerCase();
  return (OFFICE_KINDS as string[]).includes(text) ? (text as OfficeKind) : null;
}

/**
 * A model's answer, made consistent: a build is on the coding desk, an office
 * turn names its kind or is not an office turn, an advisor turn names an
 * advisor desk or is chat, and confidence is a number in [0, 1]. Anything
 * unreadable is null — the caller then uses the deterministic plan.
 */
export function cleanTurnPlan(raw: unknown): TurnPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const laneText = String(value.lane || '').toLowerCase();
  if (!(LANES as string[]).includes(laneText)) return null;
  let lane = laneText as TurnLane;
  let desk = asDesk(value.desk);
  let officeKind = asOfficeKind(value.officeKind);
  const confidenceRaw = Number(value.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
  if (lane === 'build') { desk = 'coding'; officeKind = null; }
  if (lane === 'office' && !officeKind) lane = 'chat';
  if (lane === 'advisor' && !(desk && (ADVISOR_DESKS as string[]).includes(desk))) lane = 'chat';
  if (lane === 'chat') { desk = null; officeKind = null; }
  if (lane === 'office') desk = null;
  return {
    lane,
    desk,
    officeKind,
    buildMode: lane === 'build',
    confidence,
    reason: String(value.reason || '').slice(0, 300),
  };
}

function boundedHistory(history: TurnPlanInput['history']) {
  return (Array.isArray(history) ? history : [])
    .filter((item) => item && typeof item.text === 'string' && item.text.trim())
    .slice(-TURN_PLAN_HISTORY_TURNS)
    .map((item) => ({ sender: item.sender === 'user' ? 'user' : 'ai', text: String(item.text).slice(0, TURN_PLAN_HISTORY_CHARS) }));
}

/**
 * The rules that used to decide alone, as one plan. Office first (an
 * artifact noun is the explicit ask unless the message builds a web page and
 * only borrows the noun as a look), then build, then an advisor desk from the
 * message, else chat. Confidence is fixed at the floor: these rules are the
 * fallback, and they are what the planner is measured against.
 */
export function planTurnDeterministically(input: TurnPlanInput): TurnPlan {
  const message = String(input?.message || '');
  const pinnedDesk = asDesk(input?.pinnedDesk);
  const officeKind = asOfficeKind(detectOfficeIntent({ messages: [{ sender: 'user', text: message }] }));
  if (officeKind) {
    return { lane: 'office', desk: null, officeKind, buildMode: false, confidence: TURN_PLAN_CONFIDENCE_FLOOR, reason: 'the message asks for an Office file' };
  }
  // A live desk owns its follow-ups the way the client's build session does:
  // "make the header blue" after a build is a build, "why did it fail?" is not.
  const buildSessionActive = isBuildSessionActive({
    priorUserMessages: boundedHistory(input?.history).filter((item) => item.sender === 'user').map((item) => item.text),
    codingDeskOpen: Boolean(input?.codingDeskOpen),
    hasDeskFiles: Boolean(input?.hasDeskFiles),
    isCodingRequest: (candidate: string) => resolveIsCodingRequest(candidate, { codingDeskOpen: true }),
  });
  const buildAsk = turnBelongsToBuild({ text: message, buildSessionActive })
    || resolveIsCodingRequest(message, { codingDeskOpen: Boolean(input?.codingDeskOpen) })
    || detectBuildIntent(message);
  if (buildAsk && (!pinnedDesk || pinnedDesk === 'coding')) {
    return { lane: 'build', desk: 'coding', officeKind: null, buildMode: true, confidence: TURN_PLAN_CONFIDENCE_FLOOR, reason: 'the message asks to build software' };
  }
  // A pinned coding chat never becomes an advisor desk; a pinned advisor desk is the desk.
  const desk = pinnedDesk === 'coding'
    ? null
    : pinnedDesk
      ? pinnedDesk
      : asDesk(inferStudioDomain({
        explicit: null,
        pinned: false,
        message,
        history: boundedHistory(input?.history),
        codingWorkspace: Boolean(input?.hasDeskFiles) || Boolean(input?.codingDeskOpen),
      }));
  if (desk && desk !== 'coding') {
    return { lane: 'advisor', desk, officeKind: null, buildMode: false, confidence: TURN_PLAN_CONFIDENCE_FLOOR, reason: `the message belongs to the ${desk} desk` };
  }
  return { lane: 'chat', desk: null, officeKind: null, buildMode: false, confidence: TURN_PLAN_CONFIDENCE_FLOOR, reason: 'a conversational turn' };
}

/**
 * The plan the turn runs on. The model's answer is used when it is readable
 * and confident; otherwise the deterministic plan. Two invariants apply after
 * that, whichever source won: a pinned desk never changes (a build ask inside
 * a Travel chat is a Travel turn; an advisor ask inside a Coding chat is a
 * coding chat turn), and a build the desk already owns is never vetoed into
 * chat by the model.
 */
export function reconcileTurnPlan({
  model,
  deterministic,
  pinnedDesk = null,
  buildOwned = false,
}: {
  model: TurnPlan | null | undefined;
  deterministic: TurnPlan;
  pinnedDesk?: TurnDesk | null;
  buildOwned?: boolean;
}): ReconciledTurnPlan {
  const usable = Boolean(model && model.confidence >= TURN_PLAN_CONFIDENCE_FLOOR);
  const base: ReconciledTurnPlan = usable
    ? { ...(model as TurnPlan), source: 'planner', agreed: (model as TurnPlan).lane === deterministic.lane }
    : { ...deterministic, source: 'fallback', agreed: Boolean(model && model.lane === deterministic.lane) };
  const pinned = asDesk(pinnedDesk);
  if (pinned) {
    if (pinned === 'coding') {
      if (base.lane === 'advisor') { base.lane = 'chat'; base.desk = null; base.buildMode = false; }
      if (base.lane === 'build') base.desk = 'coding';
    } else {
      if (base.lane === 'build' || base.lane === 'chat' || base.lane === 'advisor') {
        base.lane = 'advisor';
        base.desk = pinned;
        base.buildMode = false;
        base.officeKind = null;
      }
    }
  }
  if (buildOwned && base.lane === 'chat' && (!pinned || pinned === 'coding')) {
    base.lane = 'build';
    base.desk = 'coding';
    base.buildMode = true;
  }
  return base;
}

export function plannerPrompt(input: TurnPlanInput): string {
  const context = {
    request: String(input?.message || '').slice(0, 6000),
    attachments: (Array.isArray(input?.attachments) ? input.attachments : []).slice(0, 8).map((item) => ({
      name: String(item?.name || '').slice(0, 120),
      kind: String(item?.kind || 'document'),
    })),
    recentHistory: boundedHistory(input?.history),
    pinnedDesk: asDesk(input?.pinnedDesk),
    codingDeskOpen: Boolean(input?.codingDeskOpen),
    hasDeskFiles: Boolean(input?.hasDeskFiles),
    activeOfficeKind: asOfficeKind(input?.activeOfficeKind),
  };
  return [
    "You are Quantora's turn planner. Read the whole request, with its attachments and recent history, and decide what the person wants MADE this turn. Infer from meaning; never from matching words.",
    '',
    'Lanes:',
    '- build: a website, web app, page, portal, dashboard, form, tool or any software to run in the browser — even when it must imitate a spreadsheet, form or document layout, and even when documents are attached as inputs. desk=coding, buildMode=true.',
    '- office: the person wants an actual file produced — a presentation/slide deck, an Excel/spreadsheet file, a Word document or a PDF. Name officeKind. A format named only as a look ("in excel format", "like the attached spreadsheet") is NOT an office turn.',
    '- advisor: a travel, finance/money, study/learning or research question. desk names it.',
    '- chat: anything else — explanation, discussion, a question about the desk, small talk.',
    '',
    'Rules:',
    '- Attachments are inputs to read, never the thing to make.',
    '- If pinnedDesk is set, the desk cannot change: decide only build/office/chat inside it (a coding desk) or office/advisor inside an advisor desk.',
    '- If hasDeskFiles is true and the request changes, fixes or extends what was built, it is a build.',
    '- confidence is your own estimate in [0,1]; be honest — below 0.7 the deterministic rules decide.',
    '- reason: one short sentence naming the object of the ask.',
    '',
    'Return only the JSON object.',
    '',
    `CONTEXT:\n${JSON.stringify(context)}`,
  ].join('\n');
}
