/**
 * Coding Turn Planner — the turn owner for Coding Desk.
 *
 * Cursor-shaped contract:
 *   analyse → required skills → feasibility → interrupt | (model + execute + proof)
 *
 * Nothing in useChatStream should call the model for a coding turn without this plan.
 */

import { resolveCodingDeskModel } from './coding-desk-auto-model.js';
import {
  SHOP_INTAKE_CATALOG_SIZE,
  assessShopBuildAsk,
  expandShopIntakeAccept,
  messageLooksLikeShopBuild,
} from './shop-catalog-scale.js';
import { assessPartnerInterrupt } from './studio-partner-interrupt.js';
import { advisorBlocksPreviewBuild, resolveIsCodingRequest } from './build-intent.js';
import { isBuildAcknowledgement, isBuildSessionActive, turnBelongsToBuild } from './build-session.js';
import { lessonsToPlannerHints } from './coding-turn-memory.js';
import { requestedDeliverablePaths } from './requested-deliverables.js';
import { messageNeedsDebugSkill, platformSkillAssignment } from '../../shared/platform-skill-registry.js';

/** @typedef {{ id: string, label: string, available: boolean, why: string }} CodingSkill */

export const CODING_SKILLS = Object.freeze({
  python_runtime: {
    id: 'python_runtime',
    label: 'Python 3 execution in an isolated browser worker',
    available: true,
    why: 'Requested Python files can be executed and verified without substituting a web page.',
  },
  preview_html: {
    id: 'preview_html',
    label: 'Runnable HTML/CSS/JS in Preview',
    available: true,
    why: 'Coding Desk Preview only runs web pages (or a React VFS), not native binaries.',
  },
  shop_catalog_photos: {
    id: 'shop_catalog_photos',
    label: 'Deterministic catalog photos (~10–24)',
    available: true,
    why: 'We inject loadable product photos; we do not run an image factory.',
  },
  shop_commerce_ui: {
    id: 'shop_commerce_ui',
    label: 'Currency + Add to Cart on Preview',
    available: true,
    why: 'Commerce controls are desk skills, not chat claims.',
  },
  multi_file_vfs: {
    id: 'multi_file_vfs',
    label: 'Multi-file project on the desk',
    available: true,
    why: 'Files land in the Coding Desk VFS and Preview assembly.',
  },
  unique_ai_mockups_at_scale: {
    id: 'unique_ai_mockups_at_scale',
    label: 'Dozens of unique AI product mockups in one turn',
    available: false,
    why: 'Not a Coding Desk capability — times out or ships SVG fakes.',
  },
});

/**
 * @typedef {{
 *   mode: 'execute' | 'interrupt' | 'pass',
 *   isCodingTurn: boolean,
 *   intent: { kind: string, summary: string },
 *   assignedSkill: object|null,
 *   skillsRequired: CodingSkill[],
 *   skillsMissing: CodingSkill[],
 *   feasible: boolean,
 *   messageForModel: string,
 *   displayUserText: string,
 *   statusLabel: string,
 *   modelPlan: { modelId: string|null, modelName: string|null, reason: string } | null,
 *   interrupt: null | { kind: string, reply: string, chips: Array<object>, assessment?: object },
 *   proof: { mustHave: string[], how: string[] },
 *   shop: object | null,
 *   intakeAccept: object | null,
 *   runSkillsFirst: boolean,
 *   hints: object,
 * }} CodingTurnPlan
 */

function skill(id) {
  return CODING_SKILLS[id] || {
    id,
    label: id,
    available: false,
    why: 'Unknown skill',
  };
}

function summarizeIntent({ message, isCodingTurn, shopAsk, intakeAccept, refineDesk }) {
  if (!isCodingTurn) return { kind: 'non_coding', summary: 'Not a Coding Desk build turn.' };
  if (intakeAccept?.expanded) {
    return {
      kind: 'shop_catalog_slice',
      summary: `Agreed smaller shop catalog (~${intakeAccept.catalogTarget || SHOP_INTAKE_CATALOG_SIZE} photos).`,
    };
  }
  if (shopAsk?.oversize) {
    return {
      kind: 'shop_oversize',
      summary: `Oversize merchandise ask (${shopAsk.userAsked} unique images) — not feasible in one turn.`,
    };
  }
  if (requestedDeliverablePaths(message).some((path) => /\.py$/i.test(path))) {
    return { kind: 'python_build', summary: 'Build and verify the explicitly requested Python files.' };
  }
  if (refineDesk && messageNeedsDebugSkill(message)) {
    return { kind: 'refine_desk', summary: 'Refine the running desk / Preview.' };
  }
  if (messageLooksLikeShopBuild(message) || shopAsk?.imageAskCount) {
    return { kind: 'shop_build', summary: 'Shop / merchandise build for Preview.' };
  }
  if (refineDesk) return { kind: 'refine_desk', summary: 'Refine the running desk / Preview.' };
  return { kind: 'app_build', summary: 'Build or change a runnable Preview app.' };
}

function requiredSkillsForIntent(intent, shopAsk) {
  const required = intent.kind === 'python_build'
    ? [skill('python_runtime'), skill('multi_file_vfs')]
    : [skill('preview_html'), skill('multi_file_vfs')];
  if (intent.kind === 'shop_oversize' || intent.kind === 'shop_build' || intent.kind === 'shop_catalog_slice') {
    required.push(skill('shop_catalog_photos'), skill('shop_commerce_ui'));
  }
  if (intent.kind === 'shop_oversize' || (shopAsk?.oversize && intent.kind !== 'shop_catalog_slice')) {
    required.push(skill('unique_ai_mockups_at_scale'));
  }
  return required;
}

function proofForIntent(intent) {
  if (intent.kind === 'python_build') {
    return {
      mustHave: ['Every requested Python/source file on the desk', 'Successful Python execution evidence'],
      how: ['Write the requested files to the VFS', 'Run pytest when tests exist; otherwise compile every requested Python source file'],
    };
  }
  if (intent.kind.startsWith('shop')) {
    return {
      mustHave: [
        'index.html (or runnable Preview entry)',
        'about 10–24 loadable catalog photos',
        'Add to Cart + currency on Preview',
      ],
      how: [
        'Assemble Preview from desk files',
        'Inject catalog photos if the model leaves empty frames',
        'Inject commerce UI if missing',
        'Desk probes must see photos + cart',
      ],
    };
  }
  if (intent.kind === 'refine_desk') {
    return {
      mustHave: ['Updated Preview still runs', 'Prior working behavior preserved where required'],
      how: ['Write files to VFS', 'Re-run Preview', 'Reject regressions on job checks'],
    };
  }
  return {
    mustHave: ['Runnable page in Preview', 'Files on the Coding Desk'],
    how: ['Model writes HTML/JS or React VFS', 'Preview shell loads', 'Verify build / probes'],
  };
}

function withAssignmentStatus(assignedSkill, label) {
  if (!assignedSkill?.name || !label) return label || '';
  return `Assigned: ${assignedSkill.name} · ${label}`;
}

/** Plan one Coding Desk turn before any model burn. */
export function planCodingTurn({
  message = '',
  priorUserMessages = [],
  codingDeskOpen = false,
  refineDesk = false,
  studioDomain = null,
  history = [],
  autoMode = true,
  availableModels = [],
  vfsFileCount = 0,
  lessons = [],
  allowPaid = false,
} = {}) {
  const raw = String(message || '').trim();
  const prior = Array.isArray(priorUserMessages) ? priorUserMessages : [];
  const intakeAccept = expandShopIntakeAccept(raw, prior);
  const displayUserText = raw;
  const messageForModel = intakeAccept.expanded ? intakeAccept.text : raw;
  const hasExplicitPythonDeliverable = requestedDeliverablePaths(messageForModel)
    .some((path) => /\.py$/i.test(path));
  const hints = lessonsToPlannerHints(lessons);

  const shopAsk = assessShopBuildAsk(intakeAccept.expanded ? messageForModel : raw);
  const interrupt = assessPartnerInterrupt({ message: raw, priorUserMessages: prior });

  const buildSessionActive = isBuildSessionActive({
    priorUserMessages: prior,
    codingDeskOpen: Boolean(codingDeskOpen),
    hasDeskFiles: Number(vfsFileCount) > 0,
    isCodingRequest: (candidate) => resolveIsCodingRequest(candidate, { codingDeskOpen: Boolean(codingDeskOpen) }),
  });

  if (buildSessionActive && !advisorBlocksPreviewBuild(studioDomain)
    && !intakeAccept.expanded && isBuildAcknowledgement(raw)) {
    return {
      mode: 'interrupt',
      isCodingTurn: false,
      intent: { kind: 'acknowledgement', summary: 'Acknowledgement only; no changes requested.' },
      assignedSkill: null,
      skillsRequired: [],
      skillsMissing: [],
      feasible: true,
      messageForModel: raw,
      displayUserText,
      statusLabel: '',
      modelPlan: null,
      interrupt: { kind: 'acknowledgement', reply: 'Thank you. No further changes made.', chips: [] },
      proof: { mustHave: [], how: [] },
      shop: null,
      intakeAccept: null,
      runSkillsFirst: false,
      hints,
    };
  }

  const isCodingTurn = (
    resolveIsCodingRequest(messageForModel, {
      codingDeskOpen: Boolean(codingDeskOpen),
      refineDesk: Boolean(refineDesk),
    })
    || turnBelongsToBuild({ text: messageForModel, buildSessionActive })
    || Boolean(shopAsk?.oversize)
    || Boolean(interrupt?.blockModel)
    || hasExplicitPythonDeliverable
  ) && !advisorBlocksPreviewBuild(studioDomain);

  if (!isCodingTurn) {
    return {
      mode: 'pass',
      isCodingTurn: false,
      intent: { kind: 'non_coding', summary: 'Pass-through (advisor or ordinary chat).' },
      assignedSkill: null,
      skillsRequired: [],
      skillsMissing: [],
      feasible: true,
      messageForModel: raw,
      displayUserText,
      statusLabel: '',
      modelPlan: null,
      interrupt: null,
      proof: { mustHave: [], how: [] },
      shop: null,
      intakeAccept: intakeAccept.expanded ? intakeAccept : null,
      runSkillsFirst: false,
      hints,
    };
  }

  const intent = summarizeIntent({
    message: messageForModel,
    isCodingTurn: true,
    shopAsk,
    intakeAccept,
    refineDesk,
  });
  const assignedSkill = platformSkillAssignment({
    workspace: 'coding',
    intentKind: intent.kind,
    message: messageForModel,
  });
  const skillsRequired = requiredSkillsForIntent(intent, shopAsk);
  const skillsMissing = skillsRequired.filter((entry) => !entry.available);
  const proof = proofForIntent(intent);

  const forceInterrupt = Boolean(
    hints.reinforceInterrupt
    && shopAsk?.oversize
    && !intakeAccept.expanded
  );

  if (interrupt?.blockModel || forceInterrupt || (skillsMissing.length > 0 && intent.kind === 'shop_oversize')) {
    const partner = interrupt || {
      kind: 'shop-catalog-oversize',
      reply: (
        `Hold on — this ask needs skills we do not have in one Coding Desk turn `
        + `(${skillsMissing.map((s) => s.label).join(', ') || 'unique AI mockups at scale'}).\n\n`
        + (hints.lastLesson
          ? `Last time this class of ask failed (${hints.lastLesson.kind}). I'm not repeating that.\n\n`
          : '')
        + `**Proposal:** ship a working shop with about ${SHOP_INTAKE_CATALOG_SIZE} real catalog photos, `
        + `cart, and currency — then expand.\n\nAgree?`
      ),
      chips: shopAsk?.chips || [],
      assessment: shopAsk,
    };
    const waitStatus = hints.lastLesson
      ? `Learned from ${hints.lastLesson.kind} — waiting for your agree before we act.`
      : 'Waiting for your agree — not burning a model turn on a lie.';
    return {
      mode: 'interrupt',
      isCodingTurn: true,
      intent,
      assignedSkill,
      skillsRequired,
      skillsMissing: skillsMissing.length ? skillsMissing : [skill('unique_ai_mockups_at_scale')],
      feasible: false,
      messageForModel,
      displayUserText,
      statusLabel: withAssignmentStatus(assignedSkill, waitStatus),
      modelPlan: null,
      interrupt: {
        kind: partner.kind,
        reply: partner.reply,
        chips: partner.chips || [],
        assessment: partner.assessment || shopAsk,
      },
      proof,
      shop: shopAsk,
      intakeAccept: intakeAccept.expanded ? intakeAccept : null,
      runSkillsFirst: false,
      hints,
    };
  }

  let modelPlan = null;
  if (autoMode) {
    const resolved = resolveCodingDeskModel({
      task: 'coding',
      message: messageForModel,
      hasVFS: vfsFileCount > 0,
      refineMode: Boolean(refineDesk) || hints.escalateModel,
      availableModels: availableModels || [],
      qualityHints: {
        fileCount: vfsFileCount,
        shopImageOversize: Boolean(shopAsk?.oversize),
        repair: Boolean(refineDesk) || hints.escalateModel,
      },
      allowPaid: Boolean(allowPaid),
    });
    modelPlan = {
      modelId: resolved.modelId || null,
      modelName: resolved.model?.name || resolved.modelId || null,
      reason: hints.escalateModel
        ? `${resolved.reason || 'auto'}+lesson_escalate`
        : (resolved.reason || 'auto'),
    };
  }

  const catalogTarget = intakeAccept.catalogTarget
    || shopAsk.catalogTarget
    || shopAsk.proposedCatalogSize
    || SHOP_INTAKE_CATALOG_SIZE;

  const runSkillsFirst = Boolean(
    intent.kind.startsWith('shop')
    || intakeAccept.expanded
    || hints.preferDeterministicShopSkills
  );

  const workStatus = intent.kind === 'shop_catalog_slice' || intakeAccept.expanded
    ? `Running shop skills then building ~${catalogTarget} catalog photos — proving Preview`
    : intent.kind === 'shop_build'
      ? `Building the shop for Preview (~${catalogTarget} catalog photos max)`
      : intent.kind === 'refine_desk'
        ? 'Updating the running desk — Preview must still run'
        : 'Building a result you can open in Preview';

  return {
    mode: 'execute',
    isCodingTurn: true,
    intent,
    assignedSkill,
    skillsRequired,
    skillsMissing: [],
    feasible: true,
    messageForModel,
    displayUserText,
    statusLabel: withAssignmentStatus(assignedSkill, workStatus),
    modelPlan,
    interrupt: null,
    proof,
    shop: shopAsk.imageAskCount || shopAsk.oversize ? shopAsk : null,
    intakeAccept: intakeAccept.expanded ? intakeAccept : null,
    runSkillsFirst,
    hints,
  };
}
