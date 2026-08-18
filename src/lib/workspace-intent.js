const WORKSPACE_NOUN = /\b(app|application|website|site|page|code|component|preview|workspace|canvas|presentation|deck|slide|document|spreadsheet|workbook)\b/i;
const BUILD_INTENT = /\b(build|create|develop|design|implement|code|prototype)\b/i;
const EDIT_INTENT = /\b(fix|change|update|edit|refine|modify|add|remove|rename|restyle|format|make)\b/i;
const UI_TARGET = /\b(button|layout|header|footer|form|screen|navigation|navbar|sidebar|color|font|spacing|chart|table|roadmap|slide|section)\b/i;
const EXPLICIT_REFERENCE = /\b(this|that|the|current|same|existing|above)\s+(app|application|website|site|page|code|component|preview|workspace|canvas|presentation|deck|slide|document|spreadsheet|workbook)\b/i;

export function shouldKeepWorkspaceForPrompt({ prompt = '', hasWorkspace = false, officeKind = null } = {}) {
  if (!hasWorkspace) return false;
  const text = String(prompt || '').trim();
  if (!text) return true;
  if (EXPLICIT_REFERENCE.test(text)) return true;
  if (BUILD_INTENT.test(text) && WORKSPACE_NOUN.test(text)) return true;
  if (EDIT_INTENT.test(text) && (WORKSPACE_NOUN.test(text) || UI_TARGET.test(text))) return true;
  if (officeKind && EDIT_INTENT.test(text) && /\b(it|this|same|cleaner|professional|format|formatting|visual|look|feel)\b/i.test(text)) return true;
  return false;
}
