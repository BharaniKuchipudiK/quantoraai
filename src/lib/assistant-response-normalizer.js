import { extractContextFromAssistantText } from './session-context.js';
import { extractChoicesFromAssistantText, stripPartialAssistantMarkers } from './studio-choices.js';
import { extractContinuesFromAssistantText } from './studio-continues.js';

const CLEAR_WORKSPACE_MARKER = /<clear-workspace\s*\/?\s*>/gi;
const PARTIAL_CLEAR_WORKSPACE_MARKER = /<clear-workspace[^>]*$/i;

function stripClearWorkspaceMarker(text) {
  return text
    .replace(CLEAR_WORKSPACE_MARKER, '')
    .replace(PARTIAL_CLEAR_WORKSPACE_MARKER, '')
    .trimEnd();
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
  return stripClearWorkspaceMarker(partialSafe);
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
  // Parse from the last protocol stage to the first. The legacy choices parser
  // intentionally hides any later partial marker for streaming safety; running
  // it first at completion would therefore discard valid continuation/context
  // metadata before those parsers could read it.
  const { displayText: afterContext, contextUpdate } = extractContextFromAssistantText(protocolText);
  const { displayText: afterContinues, continueSet } = extractContinuesFromAssistantText(afterContext);
  const { displayText, choiceSet } = extractChoicesFromAssistantText(afterContinues);

  return {
    displayText,
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
}import { extractContextFromAssistantText } from './session-context.js';
import { extractChoicesFromAssistantText, stripPartialAssistantMarkers } from './studio-choices.js';
import { extractContinuesFromAssistantText } from './studio-continues.js';

/**
 * Presentation boundary for model output while it is still streaming.
 *
 * Quantora's conversation protocol appends machine-readable HTML comments to
 * assistant text. Providers can split those comments across arbitrary chunks,
 * so no streaming surface may render the raw accumulated text directly.
 */
export function sanitizeAssistantStream(text) {
  return stripPartialAssistantMarkers(typeof text === 'string' ? text : '');
}

/**
 * Converts provider output into user-visible text plus Quantora metadata.
 * Every model and every UI mode must pass through this function before the
 * response is persisted or displayed.
 */
export function normalizeAssistantResponse(text) {
  const rawText = typeof text === 'string' ? text : '';
  // Parse from the last protocol stage to the first. The legacy choices parser
  // intentionally hides any later partial marker for streaming safety; running
  // it first at completion would therefore discard valid continuation/context
  // metadata before those parsers could read it.
  const { displayText: afterContext, contextUpdate } = extractContextFromAssistantText(rawText);
  const { displayText: afterContinues, continueSet } = extractContinuesFromAssistantText(afterContext);
  const { displayText, choiceSet } = extractChoicesFromAssistantText(afterContinues);

  return {
    displayText,
    choiceSet,
    continueSet,
    contextUpdate,
  };
}

/**
 * Defensive display sanitizer for historical messages written before the
 * normalization boundary existed.
 */
export function getAssistantDisplayText(text) {
  return normalizeAssistantResponse(text).displayText;
}
