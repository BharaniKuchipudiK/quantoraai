import { studyNativeLabForRenderer } from '../../shared/study-native-labs.js';

// Native Study renderers are authoritative for the current turn. When one is
// actually being delivered, generic model prose claiming that this interface
// cannot show the animation is false and must not appear beside the renderer.
const FALSE_NATIVE_CAPABILITY_DENIAL = /\b(?:I|we)\s+(?:cannot|can't|can’t|am unable to|are unable to|do not have the ability to|don't have the ability to|don’t have the ability to)\s+(?:run|render|play|show|display|create|provide)\b[^.!?\n]{0,180}\b(?:animations?|simulations?|interactive\s+(?:canvas|lab|visual)|dynamic\s+video|live\s+video)\b[^.!?\n]{0,120}\b(?:here|text desk|text chat|chat interface|chat|interface|platform|workspace)\b/i;
const GENERIC_RESOURCE_REDIRECT = /^(?:However|Instead|Alternatively|But)\b[^.!?\n]{0,220}\b(?:guide|point|direct|help|resources?|links?|websites?|find)\b[^.!?\n]{0,220}\b(?:animations?|simulations?|resources?|links?|websites?)\b/i;
const SENTENCE_CHUNKS = /(?:[^.!?]|[.!?](?!\s|$))+(?:[.!?]+(?=\s|$)|$)\s*/g;

function routeDeliversSupportedNativeLab(routing = null) {
  const plan = routing?.representation || null;
  if (
    !plan
    || plan.rendererRequired !== true
    || plan.fallback !== 'none'
    || plan.primaryRepresentation !== 'simulation_or_lab'
  ) {
    return false;
  }
  return Boolean(studyNativeLabForRenderer(plan.rendererKind));
}

function stripFalseDenialFromLine(line = '') {
  const sentences = String(line || '').match(SENTENCE_CHUNKS) || [String(line || '')];
  const kept = [];
  let removedDenial = false;

  for (const sentence of sentences) {
    const plain = sentence.trim();
    if (!plain) continue;
    if (FALSE_NATIVE_CAPABILITY_DENIAL.test(plain)) {
      removedDenial = true;
      continue;
    }
    if (removedDenial && GENERIC_RESOURCE_REDIRECT.test(plain)) continue;
    removedDenial = false;
    kept.push(sentence);
  }

  return kept.join('');
}

export function stripFalseNativeCapabilityDenial(text = '', routing = null) {
  const source = String(text || '');
  if (!routeDeliversSupportedNativeLab(routing)) return source;

  let fence = '';
  return source.split('\n').map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
      return line;
    }
    if (fence || /^(?: {4}|\t|\s*>)/.test(line)) return line;
    return stripFalseDenialFromLine(line);
  }).join('\n');
}
