/**
 * Deterministic skill execution for Coding Desk.
 * Intelligence is not "call the model and hope" — available skills RUN.
 */

import { ensureShopDeskInVfs } from './studio-preview-helpers.js';
import { buildStudioJobCard, jobNeedsProductPhotos } from './studio-job-card.js';
import { pickPreviewEntryPath } from './preview-utils.js';
import { countRealPreviewPhotos } from './preview-images.js';
import { previewHtmlHasAddToCartControl } from './shop-preview-ui.js';
import { platformSkillAssignment } from '../../shared/platform-skill-registry.js';

/**
 * Run every *available* required skill for this plan against the desk VFS.
 * Missing/unavailable skills are never faked here — the planner already interrupted.
 *
 * @returns {{
 *   vfs: object,
 *   changed: boolean,
 *   ran: string[],
 *   assignedSkill: object|null,
 *   proof: { photos: number, hasCart: boolean, hasHtml: boolean },
 * }}
 */
function normalizeSkillIds(skillsRequired = []) {
  return (skillsRequired || []).map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object' && entry.id) return entry.id;
    return null;
  }).filter(Boolean);
}

function assignmentForPlan(plan, message = '') {
  if (!plan?.intent?.kind || plan.mode === 'pass') return null;
  return platformSkillAssignment({
    workspace: 'coding',
    intentKind: plan.intent.kind,
    message: message || plan.displayUserText || plan.messageForModel || '',
  });
}

/**
 * Build a minimal plan shape from a chat message's codingTurnPlan snapshot.
 */
export function planFromMessageSnapshot(snapshot, { messageForModel = '', displayUserText = '' } = {}) {
  if (!snapshot?.intent) return null;
  // The local acknowledgement exit must survive message snapshot restoration.
  const acknowledgement = snapshot.intent.kind === 'acknowledgement';
  const restored = {
    mode: acknowledgement ? 'pass' : 'execute',
    isCodingTurn: !acknowledgement,
    intent: snapshot.intent,
    skillsRequired: normalizeSkillIds(snapshot.skillsRequired).map((id) => ({
      id,
      available: true,
    })),
    messageForModel,
    displayUserText,
    runSkillsFirst: !acknowledgement && snapshot.runSkillsFirst !== false,
  };
  return {
    ...restored,
    assignedSkill: assignmentForPlan(restored, displayUserText || messageForModel),
  };
}

export function runCodingTurnSkills({
  plan = null,
  vfs = {},
  job = null,
  brief = '',
} = {}) {
  const assignedSkill = assignmentForPlan(plan, brief);
  if (!plan || plan.mode === 'interrupt' || plan.mode === 'pass') {
    return {
      vfs: vfs || {},
      changed: false,
      ran: [],
      assignedSkill,
      proof: { photos: 0, hasCart: false, hasHtml: false },
    };
  }
  if (plan.isCodingTurn === false) {
    return {
      vfs: vfs || {},
      changed: false,
      ran: [],
      assignedSkill,
      proof: { photos: 0, hasCart: false, hasHtml: false },
    };
  }

  const skillIds = normalizeSkillIds(plan.skillsRequired);
  const availableIds = new Set(
    (plan.skillsRequired || [])
      .filter((skill) => {
        if (typeof skill === 'string') return true;
        return skill && skill.available !== false;
      })
      .map((skill) => (typeof skill === 'string' ? skill : skill.id))
      .filter(Boolean),
  );

  const wantsShop = plan.intent?.kind?.startsWith('shop')
    || availableIds.has('shop_catalog_photos')
    || availableIds.has('shop_commerce_ui')
    || skillIds.includes('shop_catalog_photos');

  let next = { ...(vfs || {}) };
  const ran = [];
  let changed = false;

  const deskJob = job || buildStudioJobCard({
    brief: brief || plan.messageForModel || '',
    vfs: next,
  });

  if (wantsShop && (jobNeedsProductPhotos(deskJob) || plan.intent?.kind?.startsWith('shop'))) {
    const ensured = ensureShopDeskInVfs(next, deskJob, {
      brief: brief || plan.messageForModel || plan.displayUserText || '',
    });
    if (ensured.changed || ensured.vfs !== next) {
      next = ensured.vfs;
      changed = Boolean(ensured.changed) || changed;
      ran.push('shop_catalog_photos', 'shop_commerce_ui', 'preview_html');
    }
  }

  const htmlPath = pickPreviewEntryPath(next);
  const html = htmlPath && next[htmlPath]?.content ? String(next[htmlPath].content) : '';
  return {
    vfs: next,
    changed,
    ran: [...new Set(ran)],
    assignedSkill,
    proof: {
      photos: countRealPreviewPhotos(html),
      hasCart: previewHtmlHasAddToCartControl(html),
      hasHtml: Boolean(htmlPath),
    },
  };
}
