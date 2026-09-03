import { requestIsAnalysisNotBuild } from './request-kind.js';
/**
 * When should Studio generate a runnable artifact vs run website intake?
 *
 * Coffee-shop sites need a short designer intake. A specified tool
 * (calculator, timer, todo) is already a complete brief — build it now.
 */

const QUESTION_PREFIX = /^(how|what|why|when|where|which|who|should|can you explain|explain|is |are |does |do |tell me|help me understand)/i;

const BUILD_VERB = /\b(build|create|make|generate|design|develop|code|prototype|clone|scaffold)\b/i;
/*
 * The vocabulary of software people actually pay to have built.
 *
 * The original list was consumer-shaped — website, landing page, calculator,
 * portfolio, game — so six of eight real business asks were NOT recognised as
 * builds at all:
 *
 *   "Build a production scheduling board"   missed
 *   "Build a shift scheduler for my cafe"   missed
 *   "Build a booking system for my salon"   missed
 *   "Build an inventory management screen"  missed
 *   "Build a CRM for my agency"             missed
 *   "Build a kanban board for my team"      missed
 *
 * That is why the Coding Desk looked like it only did calculators and coffee
 * shops: those were the only nouns it could hear. A verb is still required
 * alongside, so the broader list cannot turn ordinary conversation into a build.
 */
const BUILD_NOUN = /\b(app|application|web ?site|website|landing page|web ?page|page|ui|interface|component|dashboard|game|tool|calculator|form|portfolio|site|widget|animation|simulator|editor|tracker|generator|clone|agent|bot|crawler|automation|organizer|script|service|workflow|extension|plugin|macos|ios|desktop|board|scheduler|schedule|planner|system|screen|portal|console|admin|panel|crm|erp|inventory|roster|rota|timeline|kanban|gantt|booking|checkout|catalogue|catalog|directory|wizard|viewer|table|chart|map|feed|inbox|queue|pipeline|report|invoice|quote|ledger|calendar|marketplace|storefront|builder|manager|monitor|analyzer|analyser)\b/i;

const SPECIFIED_TOOL = /\b(calculator|calc\b|todo(?:s| list)?|to-do list|timer|stopwatch|pomodoro|counter|unit converter|tip calculator|bmi(?: calculator)?|quiz|flash ?cards?|notepad|markdown editor|tic-?tac-?toe|snake(?: game)?|pong|weather (?:app|widget)|password generator|color picker|habit tracker|kanban|clock|alarm|notes app|drawing (?:app|pad)|whiteboard|kanban board)\b/i;
/*
 * "quiz" and "flashcards" are ambiguous product words: in Coding, "build a
 * flashcard app" is software; in Study, "make a few flashcards for Newton's
 * laws" is a teaching activity. The legacy classifier used SPECIFIED_TOOL as an
 * unconditional shortcut, so the Study ask above became a Coding turn before
 * the education-domain guard had a chance to protect it. Provider exhaustion
 * then rendered Preview/catalog recovery copy inside Study Tutor.
 *
 * Keep learning activities conversational unless the same sentence also names
 * an actual software artifact. This is deliberately semantic, not
 * domain-hardcoded: a learner can ask for flashcards anywhere, while "build a
 * quiz app" still reaches Coding.
 */
const LEARNING_ACTIVITY = /\b(quiz|flash ?cards?)\b/i;

const WEBSITE_INTAKE = /\b(website|web ?site|landing page|online shop|storefront|e-?commerce|brochure|web ?page for|site for)\b/i;
const BUSINESS_INTAKE = /\b(coffee shop|caf[eé]|bakery|restaurant|salon|clinic|boutique|real estate|tuition|agency|my business|our company)\b/i;
const DESK_OPEN_BUILD_HINT = /\b(macos|ios|android|windows|native|python|swift|google drive|drive|filesystem|file system|folder|crawl)\b/i;

export function detectBuildIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (QUESTION_PREFIX.test(t)) return false;
  return BUILD_VERB.test(t) && BUILD_NOUN.test(t);
}

/**
 * Coding Desk + a product-build ask must produce VFS files.
 * Broadens slightly when the desk is already open so niche nouns lag less.
 */
export function resolveIsCodingRequest(text, {
  codingDeskOpen = false,
  refineDesk = false,
} = {}) {
  if (refineDesk) return true;
  if (isSpecifiedRunnableTool(text)) {
    const explicitSoftwareBuild = detectBuildIntent(text);
    if (LEARNING_ACTIVITY.test(String(text || '')) && !explicitSoftwareBuild && !codingDeskOpen) return false;
    return true;
  }
  /*
   * A request for judgement is not a request for software.
   *
   * A board decision paper — "determine whether we should proceed", "identify
   * at least 12 contradictions", "produce a decision paper" — was routed here
   * because the phrase "Create a portfolio showing CONTINUE, ACCELERATE" (a
   * TABLE in a document) matched a build verb and a build noun. The model then
   * emitted native iOS files, Preview died, and the reply offered travel chips.
   *
   * Checked BEFORE detectBuildIntent, because the whole point is that the
   * noun-match is what gets it wrong.
   */
  if (requestIsAnalysisNotBuild(text)) return false;
  if (detectBuildIntent(text)) return true;
  if (!codingDeskOpen || !text || typeof text !== 'string') return false;
  const t = text.trim();
  if (QUESTION_PREFIX.test(t)) return false;
  return BUILD_VERB.test(t) && (BUILD_NOUN.test(t) || DESK_OPEN_BUILD_HINT.test(t));
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
 * Who may speak Coding Preview recovery, or journal a QIR model attempt.
 *
 * `isCodingRequest` is necessary but not sufficient. Study "make flashcards"
 * once classified as a runnable tool, then provider death rendered
 * "the model died before Preview was ready" inside Study Tutor. The advisor
 * room owns that failure even if the classifier misfires.
 */
export function codingFailureSpineOwnsTurn({
  isCodingRequest = false,
  studioDomain = null,
} = {}) {
  return Boolean(isCodingRequest) && !advisorBlocksPreviewBuild(studioDomain);
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
  // A person who pressed Build gets a build (handled above). Everyone else asking
  // for analysis gets analysis, rather than a preview that cannot exist.
  if (requestIsAnalysisNotBuild(message)) return false;
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
