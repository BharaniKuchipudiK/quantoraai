/**
 * When should Studio generate a runnable artifact vs run website intake?
 *
 * Coffee-shop sites need a short designer intake. A specified tool
 * (calculator, timer, todo) is already a complete brief — build it now.
 */

const QUESTION_PREFIX = /^(how|what|why|when|where|which|who|should|can you explain|explain|is |are |does |do |tell me|help me understand)/i;

const BUILD_VERB = /\b(build|create|make|generate|design|develop|code|prototype|clone|scaffold)\b/i;
const BUILD_NOUN = /\b(app|application|web ?site|website|landing page|web ?page|page|ui|interface|component|dashboard|game|tool|calculator|form|portfolio|site|widget|animation|simulator|editor|tracker|generator|clone)\b/i;

const SPECIFIED_TOOL = /\b(calculator|calc\b|todo(?:s| list)?|to-do list|timer|stopwatch|pomodoro|counter|unit converter|tip calculator|bmi(?: calculator)?|quiz|flash ?cards?|notepad|markdown editor|tic-?tac-?toe|snake(?: game)?|pong|weather (?:app|widget)|password generator|color picker|habit tracker|kanban|clock|alarm|notes app|drawing (?:app|pad)|whiteboard|kanban board)\b/i;

const WEBSITE_INTAKE = /\b(website|web ?site|landing page|online shop|storefront|e-?commerce|brochure|web ?page for|site for)\b/i;
const BUSINESS_INTAKE = /\b(coffee shop|caf[eé]|bakery|restaurant|salon|clinic|boutique|real estate|tuition|agency|my business|our company)\b/i;

export function detectBuildIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (QUESTION_PREFIX.test(t)) return false;
  return BUILD_VERB.test(t) && BUILD_NOUN.test(t);
}

/** The user already named a self-contained tool. Intake would only delay the outcome. */
export function isSpecifiedRunnableTool(text) {
  if (!text || typeof text !== 'string') return false;
  return SPECIFIED_TOOL.test(text);
}

/** Advisors are not a coding studio. Never force Live Preview HTML recovery. */
export function advisorBlocksPreviewBuild(studioDomain) {
  return studioDomain === 'travel'
    || studioDomain === 'education'
    || studioDomain === 'finance'
    || studioDomain === 'research';
}

/**
 * Whether this turn must emit a runnable web artifact.
 * Study "make flashcards" is a tutor move, not a quiz app to preview.
 */
export function resolveEffectiveBuildMode({
  message = '',
  studioDomain = null,
  studioMode = 'ask',
  studioModeExplicit = false,
  buildMode = false,
} = {}) {
  if (advisorBlocksPreviewBuild(studioDomain)) return false;
  const explicitBuild = studioModeExplicit && studioMode === 'build';
  const explicitAsk = studioModeExplicit && studioMode === 'ask';
  const toolBuild = isSpecifiedRunnableTool(message);
  if (explicitAsk && !toolBuild) return false;
  if (explicitBuild || toolBuild) return true;
  return Boolean(buildMode);
}

export function needsGuidedWebsiteIntake(text) {
  if (!text || typeof text !== 'string') return false;
  if (isSpecifiedRunnableTool(text)) return false;
  return WEBSITE_INTAKE.test(text) || BUSINESS_INTAKE.test(text);
}

/**
 * Guided (designer) intake is only for unfinished *websites*.
 * Build mode, Plan mode, an existing preview, or a named tool skip it.
 */
export function shouldStartGuidedBuild({
  text,
  hasPreview = false,
  isWorkspace = false,
  studioMode = 'ask',
  isVisionQuestion = false,
} = {}) {
  if (isVisionQuestion || hasPreview || isWorkspace) return false;
  if (studioMode === 'plan' || studioMode === 'build') return false;
  if (isSpecifiedRunnableTool(text)) return false;
  if (!detectBuildIntent(text)) return false;
  return needsGuidedWebsiteIntake(text);
}

/** Server-side: never keep a calculator (etc.) trapped in website intake. */
export function shouldHonorGuidedBuild({ guidedBuild, message, studioMode } = {}) {
  if (!guidedBuild) return false;
  if (studioMode === 'build' || studioMode === 'plan') return false;
  if (isSpecifiedRunnableTool(message)) return false;
  return true;
}
