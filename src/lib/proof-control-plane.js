/**
 * Proof Control Plane — single owner of Coding Desk turn completion.
 *
 * Cursor contract:
 *   ASK → PLAN → SKILLS → MODEL(gaps) → ASSEMBLE → PROVE → PASS | REPAIR | FAIL
 *
 * Nothing may claim success until this module says pass.
 * Theater, sticky chrome, and chat claims are not proof.
 */

import { runCodingTurnSkills } from './coding-turn-skills.js';
import { SHOP_INTAKE_CATALOG_SIZE } from './shop-catalog-scale.js';
import { pickPreviewEntryPath } from './preview-utils.js';
import { countRealPreviewPhotos } from './preview-images.js';
import { previewHtmlHasAddToCartControl } from './shop-preview-ui.js';
import { rememberCodingTurnLesson } from './coding-turn-memory.js';
import { lessonKindFromOutcome } from './coding-turn-lesson-kinds.js';

/** @typedef {'pending'|'pass'|'repair'|'fail'} ProofStatus */

/**
 * @typedef {{
 *   photos: number,
 *   hasCart: boolean,
 *   hasHtml: boolean,
 *   photoTarget: number,
 *   shopTurn: boolean,
 *   embedReady?: boolean,
 *   livePhotoCount?: number|null,
 * }} ProofEvidence
 */

/**
 * @typedef {{
 *   status: ProofStatus,
 *   ok: boolean,
 *   gaps: string[],
 *   evidence: ProofEvidence,
 *   repaired: boolean,
 *   ran: string[],
 *   vfs: object,
 *   outcomeKind: string|null,
 *   detail: string,
 * }} ProofVerdict
 */

function isShopPlan(plan) {
  const kind = plan?.intent?.kind || '';
  return kind.startsWith('shop') || Boolean(plan?.shop) || Boolean(plan?.intakeAccept?.expanded);
}

function photoTargetFor(plan) {
  return Number(
    plan?.intakeAccept?.catalogTarget
    || plan?.shop?.catalogTarget
    || plan?.shop?.proposedCatalogSize
    || SHOP_INTAKE_CATALOG_SIZE,
  ) || SHOP_INTAKE_CATALOG_SIZE;
}

function readHtml(vfs = {}) {
  const path = pickPreviewEntryPath(vfs);
  if (!path || !vfs[path]?.content) return { path: null, html: '' };
  return { path, html: String(vfs[path].content) };
}

/**
 * Evaluate artifact (VFS/HTML) against the plan's proof contract.
 * Live DOM facts are optional and can only strengthen, never weaken HTML proof
 * when live is still warming (null).
 */
export function evaluateProofEvidence(plan, {
  vfs = {},
  embedReady = null,
  liveFacts = null,
} = {}) {
  const shopTurn = isShopPlan(plan);
  const target = photoTargetFor(plan);
  const { html } = readHtml(vfs);
  const photos = countRealPreviewPhotos(html);
  const hasCart = previewHtmlHasAddToCartControl(html);
  const hasHtml = Boolean(html && /<!DOCTYPE html>|<html[\s>]/i.test(html));

  const livePhotoCount = liveFacts && typeof liveFacts.photoCount === 'number'
    ? liveFacts.photoCount
    : (liveFacts && typeof liveFacts.productPhotoCount === 'number'
      ? liveFacts.productPhotoCount
      : null);
  const liveCart = liveFacts?.hasCart === true || liveFacts?.bagIncremented === true;

  const evidence = {
    photos,
    hasCart,
    hasHtml,
    photoTarget: target,
    shopTurn,
    embedReady: embedReady == null ? undefined : Boolean(embedReady),
    livePhotoCount,
  };

  const gaps = [];
  if (!hasHtml) gaps.push('runnable Preview HTML');
  if (shopTurn) {
    const effectivePhotos = livePhotoCount != null ? Math.max(photos, livePhotoCount) : photos;
    if (effectivePhotos < Math.min(target, 10)) {
      gaps.push(`at least ${Math.min(target, 10)} loadable catalog photos (have ${effectivePhotos})`);
    }
    if (!hasCart && !liveCart) gaps.push('Add to Cart on Preview');
  }
  if (embedReady === false) gaps.push('Preview shell embed-ready');

  return { evidence, gaps, ok: gaps.length === 0 };
}

/**
 * Run skills → evaluate → if shop gaps, repair once with skills → re-evaluate.
 * This is the Cursor "tool then prove" loop for deterministic capabilities.
 *
 * @returns {ProofVerdict & { vfs: object }}
 */
export function proveCodingTurn({
  plan = null,
  vfs = {},
  job = null,
  brief = '',
  embedReady = null,
  liveFacts = null,
  allowRepair = true,
  sessionId = null,
} = {}) {
  if (!plan?.isCodingTurn || plan.mode === 'pass') {
    return {
      status: 'pass',
      ok: true,
      gaps: [],
      evidence: {
        photos: 0,
        hasCart: false,
        hasHtml: false,
        photoTarget: 0,
        shopTurn: false,
      },
      repaired: false,
      ran: [],
      vfs: vfs || {},
      outcomeKind: null,
      detail: 'non-coding',
    };
  }

  if (plan.mode === 'interrupt') {
    return {
      status: 'fail',
      ok: false,
      gaps: (plan.skillsMissing || []).map((s) => s.label || s.id || 'missing skill'),
      evidence: {
        photos: 0,
        hasCart: false,
        hasHtml: false,
        photoTarget: photoTargetFor(plan),
        shopTurn: isShopPlan(plan),
      },
      repaired: false,
      ran: [],
      vfs: vfs || {},
      outcomeKind: 'interrupt',
      detail: 'turn interrupted before model',
    };
  }

  let nextVfs = vfs || {};
  let ran = [];
  let repaired = false;

  const first = runCodingTurnSkills({
    plan,
    vfs: nextVfs,
    job,
    brief: brief || plan.messageForModel || '',
  });
  nextVfs = first.vfs;
  ran = [...first.ran];

  let evalResult = evaluateProofEvidence(plan, {
    vfs: nextVfs,
    embedReady,
    liveFacts,
  });

  if (!evalResult.ok && allowRepair && isShopPlan(plan)) {
    repaired = true;
    const second = runCodingTurnSkills({
      plan: {
        ...plan,
        intent: { ...(plan.intent || {}), kind: plan.intent?.kind || 'shop_catalog_slice' },
        skillsRequired: [
          { id: 'shop_catalog_photos', available: true },
          { id: 'shop_commerce_ui', available: true },
          { id: 'preview_html', available: true },
        ],
      },
      vfs: nextVfs,
      job,
      brief: brief || plan.messageForModel || plan.displayUserText || '',
    });
    nextVfs = second.vfs;
    ran = [...new Set([...ran, ...second.ran, 'repair_shop_skills'])];
    evalResult = evaluateProofEvidence(plan, {
      vfs: nextVfs,
      embedReady,
      liveFacts,
    });
  }

  if (evalResult.ok) {
    return {
      status: 'pass',
      ok: true,
      gaps: [],
      evidence: evalResult.evidence,
      repaired,
      ran,
      vfs: nextVfs,
      outcomeKind: null,
      detail: repaired ? 'passed after skill repair' : 'passed',
    };
  }

  const shopTurn = isShopPlan(plan);
  const outcomeKind = !evalResult.evidence.hasHtml
    ? 'no-preview'
    : (shopTurn && evalResult.evidence.photos < 1 ? 'svg_only' : 'empty_photos');

  if (sessionId) {
    rememberCodingTurnLesson(sessionId, {
      kind: lessonKindFromOutcome({ outcomeKind }),
      detail: evalResult.gaps.join('; ').slice(0, 240),
      intentKind: plan.intent?.kind,
    });
  }

  return {
    status: repaired ? 'fail' : 'repair',
    ok: false,
    gaps: evalResult.gaps,
    evidence: evalResult.evidence,
    repaired,
    ran,
    vfs: nextVfs,
    outcomeKind,
    detail: `proof failed: ${evalResult.gaps.join(', ')}`,
  };
}

/**
 * Build user-facing failure text when proof fails after repair.
 */
export function proofFailureCopy(verdict, plan = null) {
  const gaps = (verdict?.gaps || []).join(', ') || 'required Preview proof';
  const target = photoTargetFor(plan);
  return (
    `I will not claim this turn is done — Preview proof failed (${gaps}).\n\n`
    + `**What failed:** ${verdict?.detail || 'proof contract unmet'}.\n`
    + `**What I’ll do:** keep the desk honest — ship a working page with about ${target} `
    + `catalog photos and Add to Cart, or say so if I still cannot prove it.\n\n`
    + `Tap **Start with ${target}** if you want the capped shop, or tell me the next slice.`
  );
}

/**
 * Whether an AI message may be treated as a successful coding turn.
 */
export function codingTurnMayClaimSuccess(verdict) {
  return Boolean(verdict?.ok && verdict.status === 'pass');
}
