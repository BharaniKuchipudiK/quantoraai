import { advisorBlocksPreviewBuild } from './build-intent.js';
import { asksForRepositoryWork } from './repo-work-intent.js';
import { isBuildAcknowledgement } from './build-session.js';

const WORKSPACE_NOUN = /\b(app|application|website|site|home ?page|homepage|landing page|page|code|component|preview|workspace|canvas|presentation|deck|slide|document|spreadsheet|workbook)\b/i;
const BUILD_INTENT = /\b(build|create|develop|design|implement|code|prototype)\b/i;
const EDIT_INTENT = /\b(fix|change|update|edit|refine|modify|add|include|put|remove|rename|restyle|format|make|improve|enhance|polish|upgrade|better|redesign|revamp|tweak|adjust)\b/i;
const UI_TARGET = /\b(button|layout|header|footer|form|screen|navigation|navbar|sidebar|color|font|spacing|chart|table|roadmap|slide|section)\b/i;
const EXPLICIT_REFERENCE = /\b(this|that|the|current|same|existing|above)\s+(app|application|website|site|page|code|component|preview|workspace|canvas|presentation|deck|slide|document|spreadsheet|workbook)\b/i;
const ARTIFACT_ITERATION = /\b(it|this|that|them|those|the preview|the page|the site|the ui|look|feel|theme|style|layout|design|dark mode|light mode|mobile|desktop)\b/i;
const DESK_FEATURE = /\b(currency|converter|cart|checkout|payment|photos?|images?|pictures?|visuals?|usd|inr|price|broken)\b/i;
const QUESTION_ONLY = /^(how|what|why|when|where|which|who|should|can you explain|explain|is |are |does |do |tell me|help me understand)\b/i;

export function shouldKeepWorkspaceForPrompt({ prompt = '', hasWorkspace = false, officeKind = null } = {}) {
  if (!hasWorkspace) return false;
  const text = String(prompt || '').trim();
  if (!text) return true;
  // Keep the current preview visible without treating thanks as an edit.
  if (isBuildAcknowledgement(text)) return true;
  if (EXPLICIT_REFERENCE.test(text)) return true;
  if (BUILD_INTENT.test(text) && WORKSPACE_NOUN.test(text)) return true;
  if (EDIT_INTENT.test(text) && (WORKSPACE_NOUN.test(text) || UI_TARGET.test(text) || ARTIFACT_ITERATION.test(text) || DESK_FEATURE.test(text))) return true;
  if (DESK_FEATURE.test(text) && !QUESTION_ONLY.test(text)) return true;
  if (officeKind && EDIT_INTENT.test(text) && /\b(it|this|same|cleaner|professional|format|formatting|visual|look|feel)\b/i.test(text)) return true;
  return false;
}

/**
 * A 4.5 desk: a change request on a running site must update Preview, not only
 * chat.
 *
 * Two doors, because there are two people here. The nouns above are a product
 * being iterated on -- the header, the layout, the cart. The second door is
 * somebody working on a repository they already have, whose nouns are tests,
 * endpoints and migrations and whose files are named outright. Before it
 * existed this returned false for 26 of 28 ordinary developer requests, and the
 * two it did return were accidents: `table` from the UI-parts list meaning an
 * HTML table, and `them` from the rule for iterating on a preview.
 *
 * What that cost is narrower than it first looks, and repo-work-intent.js
 * records the corrected measurement: those turns were still coding turns, since
 * turnBelongsToBuild covers any message once the desk holds files. What they
 * were not is REFINEMENTS -- so "add a test for the retry path" went out as
 * studioMode `ask` with no refineMode, while "make the header blue" on the same
 * files went out as `build`.
 *
 * Order matters. The advisor guard runs first and still wins, so a finance desk
 * asked to fix its model is not editing a file, and neither door is consulted
 * until there is actually code open.
 */
export function shouldRefineRunningDesk({ prompt = '', hasDeskFiles = false, studioDomain = null } = {}) {
  if (!hasDeskFiles || isBuildAcknowledgement(prompt)) return false;
  if (advisorBlocksPreviewBuild(studioDomain)) return false;
  if (shouldKeepWorkspaceForPrompt({ prompt, hasWorkspace: true })) return true;
  return asksForRepositoryWork(prompt);
}
