import { extractContextFromAssistantText } from './session-context.js';
import { extractChoicesFromAssistantText, stripPartialAssistantMarkers } from './studio-choices.js';
import { extractContinuesFromAssistantText } from './studio-continues.js';
import { polishOfficeUiCopy } from './office-ui-copy.js';
import { stripPlanMarker } from './build-job.js';

const CLEAR_WORKSPACE_MARKER = /<clear-workspace\s*\/?\s*>/gi;
const PARTIAL_CLEAR_WORKSPACE_MARKER = /<clear-workspace[^>]*$/i;
const STRUCTURED_MARKDOWN = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|~~~|\|)/m;

function stripClearWorkspaceMarker(text) {
  return text
    .replace(CLEAR_WORKSPACE_MARKER, '')
    .replace(PARTIAL_CLEAR_WORKSPACE_MARKER, '')
    .trimEnd();
}

/**
 * Readability fallback for providers that return an essay as one giant
 * paragraph. This only changes whitespace in long, plain prose. Markdown,
 * code, tables, protocol comments and already-paragraphed answers are left
 * untouched so Quantora never damages structured output.
 */
export function formatConversationalProse(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (value.length < 420 || value.includes('\n\n')) return value;
  if (STRUCTURED_MARKDOWN.test(value) || /```|~~~|<!--|<quantora-|<clear-workspace/i.test(value)) return value;

  const rawSentences = value.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
  if (rawSentences.length < 4) return value;

  // Keep common short fragments/abbreviations attached to surrounding prose.
  const sentences = [];
  for (const sentence of rawSentences) {
    if (sentence.length < 28 && sentences.length) {
      sentences[sentences.length - 1] = `${sentences[sentences.length - 1]} ${sentence}`.trim();
    } else {
      sentences.push(sentence);
    }
  }
  if (sentences.length < 3) return value;

  const paragraphs = [];
  let paragraph = '';
  let sentenceCount = 0;
  for (const sentence of sentences) {
    paragraph = paragraph ? `${paragraph} ${sentence}` : sentence;
    sentenceCount += 1;
    if (sentenceCount >= 2 || paragraph.length >= 320) {
      paragraphs.push(paragraph);
      paragraph = '';
      sentenceCount = 0;
    }
  }
  if (paragraph) paragraphs.push(paragraph);

  return paragraphs.length > 1 ? paragraphs.join('\n\n') : value;
}

/**
 * Presentation boundary for model output while it is still streaming.
 *
 * Quantora's conversation protocol appends machine-readable HTML comments to
 * assistant text. Providers can split those comments across arbitrary chunks,
 * so no streaming surface may render the raw accumulated text directly.
 */
export function sanitizeAssistantStream(text) {
  const partialSafe = stripPartialAssistantMarkers(typeof text === 'string' ? text : '');
  // The build plan is metadata like every other marker — the steps are rendered
  // as a checklist, not pasted into the reply as raw JSON.
  return stripPlanMarker(polishOfficeUiCopy(stripClearWorkspaceMarker(partialSafe)));
}

/**
 * Converts provider output into user-visible text plus Quantora metadata.
 * Every model and every UI mode must pass through this function before the
 * response is persisted or displayed.
 */
export function normalizeAssistantResponse(text) {
  const rawText = typeof text === 'string' ? text : '';
  const clearWorkspace = /<clear-workspace\s*\/?\s*>/i.test(rawText);
  const protocolText = stripClearWorkspaceMarker(rawText);
  // Parse from the last protocol stage to the first. The protocol is metadata,
  // never user-visible content.
  const { displayText: afterContext, contextUpdate } = extractContextFromAssistantText(protocolText);
  const { displayText: afterContinues, continueSet } = extractContinuesFromAssistantText(afterContext);
  const { displayText, choiceSet } = extractChoicesFromAssistantText(afterContinues);

  return {
    displayText: stripPlanMarker(formatConversationalProse(polishOfficeUiCopy(displayText))),
    choiceSet,
    continueSet,
    contextUpdate,
    clearWorkspace,
  };
}

/**
 * Defensive display sanitizer for historical messages written before the
 * normalization boundary existed.
 */
export function getAssistantDisplayText(text) {
  return normalizeAssistantResponse(text).displayText;
}
