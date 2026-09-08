/*
 * THE PREVIEW UPDATES ITSELF, OR SAYS WHY IT DID NOT.
 *
 * Quantora made you press a button. No other tool in this class does —
 * Cursor, Claude and ChatGPT all apply the result and let you undo it. The
 * button existed for a real reason, and the reason was never the user's
 * problem to solve: a snippet from a chat reply can overwrite a working build
 * with a fragment, so somebody had to decide whether this particular code was
 * safe to apply.
 *
 * deskCommitRegressesPreview has been able to make that decision the whole
 * time. It already answers "would committing this break the page that is
 * running?" — and the desk's own build path has consulted it for months. Only
 * the chat path asked a human instead.
 *
 * So the rule is: apply it when the guard says it is safe; keep the running
 * page and SAY SO when it is not. A click is not a safety mechanism, it is a
 * safety mechanism the user has to perform.
 */
import { deskCommitRegressesPreview } from './desk-commit-guard.js';

/**
 * Whether a previewable reply should land on the desk without being asked.
 *
 * Returns a decision, never a side effect, so the rule is testable without a
 * desk, a browser, or a model — which is why the button survived this long.
 */
export function decidePreviewCommit({ before = {}, after = {}, canPreview = true, hasHtml = true } = {}) {
  /* Some desks are not previewable at all (a research or finance workspace);
   * there is nothing to update and nothing to explain. */
  if (!canPreview) return { apply: false, tell: false, reason: 'not-a-preview-desk' };

  /* The reply carried no page. This is the ordinary case — most turns are
   * conversation — and must stay silent, or every answer grows a notice. */
  if (!hasHtml) return { apply: false, tell: false, reason: 'no-page-in-reply' };

  const guard = deskCommitRegressesPreview(before, after);
  if (guard.reject) {
    /*
     * The one case that still needs a human: applying this would replace a
     * working page with something broken or truncated. The running build is
     * kept, and the person is TOLD -- silently declining looks identical to
     * the platform ignoring them, which is how the old button felt.
     */
    return { apply: false, tell: true, reason: guard.reason };
  }
  return { apply: true, tell: false, reason: 'safe' };
}

/**
 * What to say when a page was held back.
 *
 * Names the reason in the user's terms. "incoming-entry-truncated" means the
 * reply was cut off — which is a fact about the turn, not about their code.
 */
export function describeHeldPreview(reason) {
  switch (reason) {
    case 'incoming-entry-truncated':
      return 'That reply was cut off mid-page, so your running preview was kept. Ask again and it will finish.';
    case 'incoming-entry-empty':
      return 'That reply carried no page, so your running preview was kept.';
    case 'incoming-entry-not-runnable':
      return 'That page would not run, so your working preview was kept. Nothing was lost.';
    default:
      return 'Your running preview was kept.';
  }
}
