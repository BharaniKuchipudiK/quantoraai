import { advisorBlocksPreviewBuild } from './build-intent.js';

const WORKSPACE_NOUN = /\b(app|application|website|site|page|code|component|preview|workspace|canvas|presentation|deck|slide|document|spreadsheet|workbook)\b/i;
const BUILD_INTENT = /\b(build|create|develop|design|implement|code|prototype)\b/i;
const EDIT_INTENT = /\b(fix|change|update|edit|refine|modify|add|include|put|remove|rename|restyle|format|make)\b/i;
const UI_TARGET = /\b(button|layout|header|footer|form|screen|navigation|navbar|sidebar|color|font|spacing|chart|table|roadmap|slide|section)\b/i;
const EXPLICIT_REFERENCE = /\b(this|that|the|current|same|existing|above)\s+(app|application|website|site|page|code|component|preview|workspace|canvas|presentation|deck|slide|document|spreadsheet|workbook)\b/i;
const ARTIFACT_ITERATION = /\b(it|this|that|them|those|the preview|the page|the site|the ui|look|feel|theme|style|layout|design|dark mode|light mode|mobile|desktop)\b/i;
const DESK_FEATURE = /\b(currency|converter|cart|checkout|payment|photos?|images?|pictures?|visuals?|usd|inr|price|broken)\b/i;
const QUESTION_ONLY = /^(how|what|why|when|where|which|who|should|can you explain|explain|is |are |does |do |tell me|help me understand)\b/i;

export function shouldKeepWorkspaceForPrompt({ prompt = '', hasWorkspace = false, officeKind = null } = {}) {
  if (!hasWorkspace) return false;
  const text = String(prompt || '').trim();
  if (!text) return true;
  if (EXPLICIT_REFERENCE.test(text)) return true;
  if (BUILD_INTENT.test(text) && WORKSPACE_NOUN.test(text)) return true;
  if (EDIT_INTENT.test(text) && (WORKSPACE_NOUN.test(text) || UI_TARGET.test(text) || ARTIFACT_ITERATION.test(text) || DESK_FEATURE.test(text))) return true;
  if (DESK_FEATURE.test(text) && !QUESTION_ONLY.test(text)) return true;
  if (officeKind && EDIT_INTENT.test(text) && /\b(it|this|same|cleaner|professional|format|formatting|visual|look|feel)\b/i.test(text)) return true;
  return false;
}

/** A 4.5 desk: a change request on a running site must update Preview, not only chat. */
export function shouldRefineRunningDesk({ prompt = '', hasDeskFiles = false, studioDomain = null } = {}) {
  if (!hasDeskFiles) return false;
  if (advisorBlocksPreviewBuild(studioDomain)) return false;
  return shouldKeepWorkspaceForPrompt({ prompt, hasWorkspace: true });
}
