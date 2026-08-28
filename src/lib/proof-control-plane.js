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
import { createInlineReactRuntimeVfs, isProjectRuntimeVfs } from './project-runtime-preview.js';
import { describeBuildTruth, inspectBuildTruth } from './build-truth.js';

/** @typedef {'pending'|'pass'|'repair'|'fail'} ProofStatus */

/** A turn with nothing to inspect has found nothing — not "found it clean". */
const NO_TRUTH = { findings: [], skipped: [], checked: 0 };

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
  const { path, html } = readHtml(vfs);
  const photos = countRealPreviewPhotos(html);
  const hasCart = previewHtmlHasAddToCartControl(html);
  const hasHtmlDoc = Boolean(html && /<!DOCTYPE html>|<html[\s>]/i.test(html));
  const hasReactRuntime = isProjectRuntimeVfs(vfs)
    || Boolean(createInlineReactRuntimeVfs('', vfs))
    || /\.(jsx|tsx)$/i.test(String(path || ''));
  // Shop desks must be HTML Preview. Ordinary builds may use the React project runtime.
  const hasRunnable = shopTurn ? hasHtmlDoc : (hasHtmlDoc || hasReactRuntime);

  const livePhotoCount = liveFacts && typeof liveFacts.photoCount === 'number'
    ? liveFacts.photoCount
    : (liveFacts && typeof liveFacts.productPhotoCount === 'number'
      ? liveFacts.productPhotoCount
      : null);
  const liveCart = liveFacts?.hasCart === true || liveFacts?.bagIncremented === true;

  /*
   * Build truth runs on EVERY turn, and its findings never join `gaps`.
   *
   * `gaps` decide pass/fail and drive the repair loop; these are observations.
   * Mixing them would make a dead button fail a turn, and a turn that fails on
   * a check this new - over a page nobody has judged yet - is how the platform
   * started deleting good work in the first place. It also has to run when
   * proof PASSES, because that is exactly the case it exists for: a page with
   * a runnable HTML file and twelve buttons wired to nothing passes today.
   */
  const truth = inspectBuildTruth(html, { files: Object.keys(vfs || {}) });

  const evidence = {
    photos,
    hasCart,
    hasHtml: hasRunnable,
    photoTarget: target,
    shopTurn,
    embedReady: embedReady == null ? undefined : Boolean(embedReady),
    livePhotoCount,
  };

  const gaps = [];
  if (!hasRunnable) {
    gaps.push(shopTurn ? 'runnable Preview HTML' : 'runnable Preview (HTML or React VFS)');
  }
  if (shopTurn) {
    const effectivePhotos = livePhotoCount != null ? Math.max(photos, livePhotoCount) : photos;
    if (effectivePhotos < Math.min(target, 10)) {
      gaps.push(`at least ${Math.min(target, 10)} loadable catalog photos (have ${effectivePhotos})`);
    }
    if (!hasCart && !liveCart) gaps.push('Add to Cart on Preview');
  }
  if (embedReady === false) gaps.push('Preview shell embed-ready');

  return { evidence, gaps, truth, ok: gaps.length === 0 };
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
      truth: NO_TRUTH,
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
      truth: NO_TRUTH,
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
      truth: evalResult.truth,
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
    truth: evalResult.truth,
    vfs: nextVfs,
    outcomeKind,
    detail: `proof failed: ${evalResult.gaps.join(', ')}`,
  };
}

/**
 * Build the note shown ALONGSIDE a build whose proof did not pass.
 *
 * This used to be written as replacement text for the whole turn, and it spoke
 * about catalog photos and Add to Cart no matter what had been asked for - so a
 * storage dashboard, a task tracker, anything at all, came back as advice about
 * a shop. Shop wording now appears only on a shop turn, and the copy says
 * plainly that the build is still there, because it is.
 */
export function proofFailureCopy(verdict, plan = null) {
  const gaps = (verdict?.gaps || []).join(', ') || 'required Preview proof';
  const lines = [
    `**Preview proof did not pass** — missing: ${gaps}.`,
    '',
    'The build above is exactly what the model produced. Nothing was replaced or '
    + 'removed. Open Preview and judge it yourself — this is a warning about what '
    + 'I could not verify, not a verdict on the work.',
  ];
  if (isShopPlan(plan)) {
    const target = photoTargetFor(plan);
    lines.push(
      '',
      `For a shop I check for about ${target} loadable catalog photos and an Add to `
      + `Cart control. Tap **Start with ${target}** for a capped catalog, or tell me `
      + 'the next slice.',
    );
  }
  return lines.join('\n');
}

/**
 * Whether an AI message may be treated as a successful coding turn.
 */
export function codingTurnMayClaimSuccess(verdict) {
  return Boolean(verdict?.ok && verdict.status === 'pass');
}

/**
 * The note shown alongside a build that WORKED, naming what does not work in it.
 *
 * Separate from proofFailureCopy on purpose. That one explains why proof could
 * not be completed; this one is the product: concrete, checkable statements
 * about the page a person is looking at, in words they can act on without
 * knowing what a selector is.
 *
 * Returns '' when there is nothing to say. Silence is the right answer to a
 * page with nothing wrong — a clean bill of health would be a claim, and these
 * checks are narrow enough that it would be an overclaim.
 */
export function buildTruthNote(verdict) {
  return describeBuildTruth(verdict?.truth || NO_TRUTH);
}
