/**
 * Phase 04 — a build too big for one turn becomes a job.
 *
 * WHY THIS EXISTS
 *
 * Everything before this assumed a build fits in one reply. Real work does
 * not. A user asked to rename a storefront and the turn hit the 175-second
 * ceiling; anything genuinely complex — a dashboard, a scheduler, a multi-file
 * app — exceeds one turn before it has finished thinking, and the platform's
 * only answer was to lose the whole thing and charge for it.
 *
 * A job is the unit that survives that: a goal, an ordered list of steps, and
 * the files each step must leave behind.
 *
 * THE RULE THAT MAKES THIS DIFFERENT FROM A PROGRESS BAR
 *
 * A step is complete when THE FILES IT PROMISED EXIST. Never when the model
 * says it is done, never when a turn ends without an error.
 *
 * That distinction is the whole point. A model that writes "Step 3 complete!"
 * and produces nothing must move the job zero millimetres, because a progress
 * indicator that advances on assertion is the most expensive lie this platform
 * can tell: the user watches 7 of 7 go green and ends with four files.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not promise to resume by itself. capability-doors already carries the
 * scar of a resume promise nothing performed — copy that said "I'll pick this
 * up exactly where we left it" over a parked ask no code ever read. The job is
 * persisted with the session and the next step is offered; the person presses
 * it. Saying so is cheaper than owing somebody a continuation that never comes.
 */

/** A step must name at least one file, or its completion is unfalsifiable. */
const MAX_STEPS = 12;
const MAX_TITLE = 120;

function cleanPath(value) {
  return String(value || '').trim().replace(/^\.\//, '').slice(0, 200);
}

function fileHasContent(vfs, path) {
  const entry = vfs?.[path];
  const text = typeof entry === 'string' ? entry : (entry?.content ?? entry?.code ?? '');
  return String(text || '').trim().length > 0;
}

/**
 * Build a job from a proposed plan.
 *
 * Steps that name no file are DROPPED, not kept as decoration: "polish the
 * design" can never be shown to be done, so tracking it would only ever inflate
 * the denominator with something that can never turn green.
 */
export function createBuildJob({ goal = '', steps = [] } = {}) {
  const cleaned = [];
  for (const raw of Array.isArray(steps) ? steps : []) {
    if (cleaned.length >= MAX_STEPS) break;
    const title = String(raw?.title || '').trim().slice(0, MAX_TITLE);
    const produces = [...new Set((Array.isArray(raw?.produces) ? raw.produces : []).map(cleanPath).filter(Boolean))];
    if (!title || !produces.length) continue;
    cleaned.push({ id: `s${cleaned.length + 1}`, title, produces });
  }
  if (!cleaned.length) return null;
  return {
    goal: String(goal || '').trim().slice(0, 400),
    steps: cleaned,
    startedAt: Date.now(),
  };
}

/** Which of a step's files are still missing from the desk. */
export function missingForStep(step, vfs = {}) {
  return (step?.produces || []).filter((path) => !fileHasContent(vfs, path));
}

/** A step is done when every file it promised exists with content. Nothing else. */
export function stepIsProved(step, vfs = {}) {
  return Boolean(step?.produces?.length) && missingForStep(step, vfs).length === 0;
}

/**
 * Re-judge every step against the desk as it stands.
 *
 * Recomputed from scratch each time rather than latched: a step whose file is
 * later deleted or emptied goes back to not-done, because the job describes the
 * desk that exists, not the history of what was once claimed.
 */
export function advanceBuildJob(job, vfs = {}) {
  if (!job?.steps?.length) return job || null;
  const steps = job.steps.map((step) => ({
    ...step,
    done: stepIsProved(step, vfs),
    missing: missingForStep(step, vfs),
  }));
  return { ...job, steps, updatedAt: Date.now() };
}

/**
 * A fingerprint of the desk as it stands.
 *
 * A verdict must not outlive what it judged. Without this, a pass earned by the
 * calculator would still read as proof after the desk had been replaced by a
 * bakery — the artifact-level version of the stale-locator failure that kept
 * the deployed golden red for weeks while looking like a flake.
 *
 * Content, not just size: two files of equal length are not the same file, and
 * a rename that preserves lengths is exactly the edit a size-only fingerprint
 * would call unchanged. djb2, and deliberately not cryptographic — the question
 * is "is this the same desk?", not "did an adversary forge it".
 */
export function deskFingerprint(vfs = {}) {
  const paths = Object.keys(vfs || {}).sort();
  if (!paths.length) return '';
  let hash = 5381;
  const push = (text) => {
    const value = String(text || '');
    for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  };
  for (const path of paths) {
    const entry = vfs[path];
    push(path);
    push('\u0000');
    push(typeof entry === 'string' ? entry : (entry?.content ?? entry?.code ?? ''));
    push('\u0001');
  }
  return `${paths.length}-${(hash >>> 0).toString(36)}`;
}

/**
 * WHETHER THE FILES ARE THERE IS NOT WHETHER IT WORKS.
 *
 * buildJobIsComplete answers the first question and was never meant to answer
 * the second — the module note above is explicit that a step is done when its
 * files exist, which is a deliberately falsifiable floor and stays exactly as
 * it was. But the desk painted that count GREEN and the user read it as
 * "my app works", while verifyBuild — which exists, runs on every build, and
 * returns `passed` — was consulted by nobody here. A calculator whose four
 * files are all present and whose buttons are wired to nothing scored 4 of 4.
 *
 * That is the same defect as hasCalculatorInteraction checking shape instead of
 * wiring, one layer up, and it is what QIR Phase 5 means by "remove independent
 * DONE paths that bypass verifier evidence".
 *
 * Four states, because collapsing them would put back a lie:
 *
 *   incomplete  — a step's files are still missing
 *   unverified  — every file is present and NOTHING has judged this desk
 *   failed      — every file is present and the check of THIS desk did not pass
 *   proved      — every file is present and the check of THIS desk passed
 *
 * A verdict that cannot say which desk it judged counts as no verdict. That is
 * strict on purpose: a verdict with no fingerprint is either stale or from a
 * caller that does not know what it measured, and both are worse than an
 * honest "not yet checked".
 */
export function buildJobOutcome(job, vfs = {}, verdict = null) {
  if (!buildJobIsComplete(job)) return 'incomplete';
  if (!verdict || typeof verdict.passed !== 'boolean') return 'unverified';
  if (!verdict.desk || verdict.desk !== deskFingerprint(vfs)) return 'unverified';
  return verdict.passed ? 'proved' : 'failed';
}

export function completedCount(job) {
  return (job?.steps || []).filter((step) => step.done).length;
}

export function buildJobIsComplete(job) {
  const steps = job?.steps || [];
  return steps.length > 0 && steps.every((step) => step.done);
}

/** The first step still outstanding, or null. */
export function nextStep(job) {
  return (job?.steps || []).find((step) => !step.done) || null;
}

/**
 * The instruction for the next turn.
 *
 * It names the files still missing so the turn has a falsifiable target, and
 * repeats the goal because a later turn no longer has the opening brief in
 * front of it.
 */
export function nextStepBrief(job) {
  const step = nextStep(job);
  if (!step) return '';
  const missing = step.missing?.length ? step.missing : step.produces;
  return [
    `Continue the build: ${job.goal}`.trim(),
    `Next step — ${step.title}.`,
    `This step is only done when these files exist with real content: ${missing.join(', ')}.`,
    'Emit those files. Do not restate the whole project.',
  ].join('\n');
}

/**
 * What to show the user. Counts and filenames, never adjectives.
 *
 * A step that is not done is shown with the files it is still waiting on, so
 * "not done" is a fact anybody can check against the FILES pane rather than a
 * verdict they have to trust.
 */
export function describeBuildJob(job, { vfs = {}, verdict = null } = {}) {
  if (!job?.steps?.length) return '';
  const done = completedCount(job);
  const total = job.steps.length;
  const outcome = buildJobOutcome(job, vfs, verdict);
  const lines = [`**${done} of ${total} steps done** — judged by the files on the desk, not by what any turn claimed.`];
  for (const step of job.steps) {
    if (step.done) {
      lines.push(`- [x] ${step.title}`);
    } else {
      const missing = step.missing?.length ? step.missing : step.produces;
      lines.push(`- [ ] ${step.title} — waiting on ${missing.join(', ')}`);
    }
  }
  if (outcome === 'incomplete') {
    // No resume is promised, because none is performed. See the module note.
    lines.push('', 'Say **continue** and I will take the next step.');
    return lines.join('\n');
  }
  /*
   * Every file is here. Say what that does and does not establish, in the same
   * register as the counts above: a fact the user can check, never an adjective.
   */
  if (outcome === 'proved') {
    lines.push('', 'Every file is on the desk, and this build passed its check.');
  } else if (outcome === 'failed') {
    const issues = (verdict?.issues || []).slice(0, 3).filter(Boolean);
    lines.push('', 'Every file is on the desk. **The check of this build did not pass** — the files existing is not the same as the app working.');
    for (const issue of issues) lines.push(`- ${issue}`);
  } else {
    lines.push('', 'Every file is on the desk. **Nothing has checked this build yet** — that the files exist is not yet evidence that it works.');
  }
  return lines.join('\n');
}

const PLAN_MARKER = /<!--\s*quantora-plan:\s*(\{[\s\S]*?\})\s*-->/i;

/**
 * Read a plan the model proposed.
 *
 * Parsed defensively and rebuilt through createBuildJob, so a malformed or
 * over-long plan yields null rather than a job whose steps can never complete.
 */
export function readPlanMarker(text = '') {
  const match = String(text || '').match(PLAN_MARKER);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return createBuildJob({ goal: parsed.goal, steps: parsed.steps });
  } catch {
    return null;
  }
}

/** Strip the marker before the reply is shown. */
export function stripPlanMarker(text = '') {
  return String(text || '').replace(PLAN_MARKER, '').trim();
}

/**
 * Is this brief big enough to be worth planning?
 *
 * Deliberately conservative. Turning a calculator into a seven-step job would
 * add ceremony to something that already works in one turn, and the cost of a
 * missed plan (one long turn) is far lower than the cost of a spurious one
 * (six round trips for a page).
 */
const MULTI_SURFACE = /\b(dashboard|admin|portal|multi[- ]?page|several pages|pages for|workflow|pipeline|editor|schedul\w*|planner|planning|tracker|tracking|crm|erp|inventory|booking|kanban|gantt|analytics|board|system|console|marketplace|timeline|roster|rota)\b/i;
const MULTI_PART = /\b(and then|as well as|plus a|along with|also add|with a separate)\b/i;

export function briefNeedsJob(brief = '', { vfs = {} } = {}) {
  const text = String(brief || '');
  if (text.length < 60) return false;
  const surfaces = (text.match(MULTI_SURFACE) || []).length;
  const parts = (text.match(MULTI_PART) || []).length;
  const bullets = (text.match(/^\s*[-*\d]+[.)]?\s+\S/gm) || []).length;
  const existingFiles = Object.keys(vfs || {}).length;
  return surfaces > 0 && (parts > 0 || bullets >= 3 || text.length > 400 || existingFiles >= 4);
}


