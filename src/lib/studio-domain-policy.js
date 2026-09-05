export const STUDIO_DOMAIN = Object.freeze({
  TRAVEL: 'travel',
  FINANCE: 'finance',
  EDUCATION: 'education',
  RESEARCH: 'research',
});

const BASE = Object.freeze({
  title: 'Quantora',
  hero: 'What would you like to build today?',
  supporting: 'Ask, create, analyse, or build with Quantora.',
  capabilities: [],
  placeholder: 'Ask Quantora anything, or describe what you want to build…',
  showModelControls: true,
  showArena: true,
  showGenericCanvasNavigation: true,
  autoOpenCodeWorkspace: true,
  explicitCodePreview: true,
  mediaCanvas: true,
  /*
   * Plan/Build and the GitHub destination belong to the desk that writes code.
   *
   * `null` — the generic Quantora — covers BOTH Normal Chat and the Coding
   * Desk, which is why one flag scopes them correctly: the four advisor desks
   * are the only named domains, and none of them can write to a repository or
   * open a workspace (`autoOpenCodeWorkspace: false` on every one). A repo
   * picker on the Travel desk is a control whose every outcome is "nothing
   * happens" — the painted door this repo has an incident for.
   */
  showStudioModeToggle: true,
  showGithubControls: true,
});

const POLICIES = Object.freeze({
  [STUDIO_DOMAIN.TRAVEL]: Object.freeze({
    title: 'Travel Advisor',
    hero: 'Where should Quantora take you?',
    supporting: 'Plan the trip from intent to itinerary without exposing implementation plumbing.',
    capabilities: ['Flights', 'Hotels', 'Attractions', 'Itineraries'],
    placeholder: 'Where would you like to go? Tell me a destination, dates, or just the kind of trip you want…',
    showModelControls: false,
    showArena: true,
    showGenericCanvasNavigation: false,
    autoOpenCodeWorkspace: false,
    explicitCodePreview: false,
    mediaCanvas: false,
    showStudioModeToggle: false,
    showGithubControls: false,
  }),
  [STUDIO_DOMAIN.FINANCE]: Object.freeze({
    title: 'Finance Advisor',
    hero: 'What financial outcome are you working towards?',
    supporting: 'Work through the numbers, trade-offs, risks and decisions in one focused workspace.',
    /*
     * Named for what the desk can actually answer, not what sounds complete.
     * "Portfolio" was advertised here and on the landing page with no holdings
     * store, no gateway and no arithmetic behind it — a painted door on the
     * front of the workspace. "Cash flow" came out with it: the balance-sheet
     * work that would honour it is not merged. Both come back when the code
     * that answers them does, and capability-claims.js is what makes that the
     * only way back.
     */
    capabilities: ['Currency', 'Debt', 'Savings', 'Decisions'],
    placeholder: 'What financial decision should we work through? Currency, debt, savings, or whether you can afford something.',
    showModelControls: false,
    showArena: true,
    showGenericCanvasNavigation: false,
    autoOpenCodeWorkspace: false,
    explicitCodePreview: false,
    mediaCanvas: false,
    showStudioModeToggle: false,
    showGithubControls: false,
  }),
  [STUDIO_DOMAIN.EDUCATION]: Object.freeze({
    title: 'Study Tutor',
    hero: 'What would you like to understand better?',
    supporting: 'Learn through explanation, guided practice, planning and review. Learning media opens only when you choose it.',
    capabilities: ['Explain', 'Practise', 'Plan', 'Review'],
    placeholder: 'What would you like to learn or understand better?',
    showModelControls: false,
    showArena: true,
    showGenericCanvasNavigation: false,
    autoOpenCodeWorkspace: false,
    explicitCodePreview: false,
    mediaCanvas: true,
    showStudioModeToggle: false,
    showGithubControls: false,
  }),
  [STUDIO_DOMAIN.RESEARCH]: Object.freeze({
    title: 'Research Analyst',
    hero: 'What should Quantora investigate?',
    supporting: 'Structure the question, compare evidence, test claims and move toward a defensible conclusion.',
    capabilities: ['Research', 'Compare', 'Evidence', 'Decide'],
    placeholder: 'What should I investigate, compare, or validate?',
    /*
     * The one advisor desk with the engine picker (2026-09-02): Auto routed a
     * research turn to an engine that ignored the desk's contracts, and the
     * analyst watching the board asked to steer which engine answers. Auto
     * stays the default. A desk with showModelControls false also IGNORES a
     * pinned engine (useChatStream) — a pin set where the picker is visible
     * must not silently steer desks that give no way to see or undo it.
     */
    showModelControls: true,
    showArena: true,
    showGenericCanvasNavigation: false,
    autoOpenCodeWorkspace: false,
    explicitCodePreview: false,
    mediaCanvas: false,
    showStudioModeToggle: false,
    showGithubControls: false,
  }),
});

export function normalizeDomain(domain) {
  return Object.values(STUDIO_DOMAIN).includes(domain) ? domain : null;
}

export function studioDomainPolicy(domain) {
  const normalized = normalizeDomain(domain);
  return Object.freeze({
    ...BASE,
    ...(normalized ? POLICIES[normalized] : {}),
    domain: normalized,
  });
}

export function canAutoOpenCodeWorkspace(domain) {
  return studioDomainPolicy(domain).autoOpenCodeWorkspace === true;
}

export function canExplicitlyPreviewCode(domain) {
  return studioDomainPolicy(domain).explicitCodePreview === true;
}

/** Plan/Build is a coding control. Advisor desks do not offer it. */
export function canChooseStudioMode(domain) {
  return studioDomainPolicy(domain).showStudioModeToggle === true;
}

/** The GitHub account chip, the repository picker, and the paperclip entry. */
export function canUseGithubControls(domain) {
  return studioDomainPolicy(domain).showGithubControls === true;
}

/*
 * The mode a turn actually runs in, given where the person is standing.
 *
 * Hiding the toggle is not enough on its own. `studioModeChoice` survives a
 * workspace switch, and the send path reads it from a ref — so choosing Plan on
 * the Coding Desk and then clicking Travel Advisor left the travel turn a plan
 * turn, with `guardPlanTurn` discarding the reply, and no visible control to
 * undo it. That is the exact failure the Research policy above already names
 * for a pinned engine: a choice made where it is visible must not steer a desk
 * that gives no way to see or unset it.
 *
 * So the neutralisation lives here, on the read, where it cannot drift from the
 * flag that hides the control.
 */
export function studioModeChoiceForDomain(chosen, domain) {
  return canChooseStudioMode(domain) ? (chosen ?? null) : null;
}

