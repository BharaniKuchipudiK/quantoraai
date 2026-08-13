/**
 * A prompt enhancement may update the editor only while the request still
 * belongs to the same chat and the user has not changed the draft.
 */
export function shouldApplyPromptPolishResult({
  requestSessionId,
  currentSessionId,
  draftAtStart,
  currentDraft,
} = {}) {
  return Boolean(requestSessionId)
    && requestSessionId === currentSessionId
    && draftAtStart === currentDraft;
}
