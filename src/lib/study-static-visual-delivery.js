import { studyMicroVisualKind } from './study-micro-visuals.js';
import { studyVisualKind } from './study-pictures.js';

export const STUDY_STATIC_VISUAL_DELIVERY_VERSION = 'study-static-visual-delivery-2026-09-10.1';

const STATIC_CLASSES = new Set(['static_diagram', 'micro_visual']);
const VISUAL_TAG_RE = /<(?:quantora-study-picture|quantora-study-lab)\b[^>]*\/?>/gi;

function cleanCaption(value = '') {
  return String(value || '')
    .replace(/[<>"\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deliveredKind(caption = '') {
  return studyMicroVisualKind(caption) || studyVisualKind(caption) || null;
}

/**
 * Resolve only the already-server-selected per-message static contract.
 * No topic inference occurs here: rendererKind + caption must agree with the
 * existing native renderers or the contract fails closed.
 */
export function resolveStudyStaticVisualContract(routing = null) {
  const plan = routing?.representation || null;
  if (!plan
    || plan.rendererRequired !== true
    || plan.fallback !== 'none'
    || !STATIC_CLASSES.has(plan.deliveryClass)
    || typeof plan.rendererKind !== 'string') return null;
  const caption = cleanCaption(plan.renderCaption);
  if (!caption || deliveredKind(caption) !== plan.rendererKind) return null;
  return {
    version: STUDY_STATIC_VISUAL_DELIVERY_VERSION,
    rendererKind: plan.rendererKind,
    deliveryClass: plan.deliveryClass,
    caption,
  };
}

// Correct only a blanket platform limitation once a validated routed static
// visual is guaranteed. Quoted material, code fences and scientific limits stay.
function withoutStaticPlatformDenial(source = '') {
  let fence = '';
  const denial = /^(?:I|We)\s+(?:cannot|can't|can’t|am unable to|are unable to)\s+(?:show|render|display|create|provide|draw)\s+(?:(?:a|an)\s+)?(?:image|picture|diagram|visual|graph)\s+(?:directly\s+)?(?:inside|in|within|on)\s+(?:this|the)\s+(?:text desk|text chat|chat interface|chat|interface|platform)\b[^.!?]*(?:[.!?](?=\s|$)|$)\s*/i;
  return String(source || '').split('\n').map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
      return line;
    }
    if (fence || /^(?: {4}|\t|\s*>)/.test(line)) return line;
    return line.replace(denial, '');
  }).join('\n');
}

/**
 * When a static route is authoritative, model-authored visual tags are not.
 * Strip competing picture/lab tags and leave written content intact. The
 * validated routed visual is rendered directly by StudyMarkdown, so omission,
 * duplication or an unrelated model tag cannot change the selected renderer.
 */
export function enforceStudyStaticVisualText(text = '', routing = null) {
  const contract = resolveStudyStaticVisualContract(routing);
  if (!contract) return String(text || '');
  return withoutStaticPlatformDenial(String(text || '').replace(VISUAL_TAG_RE, ' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
