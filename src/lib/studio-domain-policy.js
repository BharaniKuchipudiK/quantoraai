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
  }),
  [STUDIO_DOMAIN.FINANCE]: Object.freeze({
    title: 'Finance Advisor',
    hero: 'What financial outcome are you working towards?',
    supporting: 'Work through the numbers, trade-offs, risks and decisions in one focused workspace.',
    capabilities: ['Portfolio', 'Cash flow', 'Debt', 'Decisions'],
    placeholder: 'What financial decision or portfolio question should we work through?',
    showModelControls: false,
    showArena: true,
    showGenericCanvasNavigation: false,
    autoOpenCodeWorkspace: false,
    explicitCodePreview: false,
    mediaCanvas: false,
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
  }),
  [STUDIO_DOMAIN.RESEARCH]: Object.freeze({
    title: 'Research Analyst',
    hero: 'What should Quantora investigate?',
    supporting: 'Structure the question, compare evidence, test claims and move toward a defensible conclusion.',
    capabilities: ['Research', 'Compare', 'Evidence', 'Decide'],
    placeholder: 'What should I investigate, compare, or validate?',
    showModelControls: false,
    showArena: true,
    showGenericCanvasNavigation: false,
    autoOpenCodeWorkspace: false,
    explicitCodePreview: false,
    mediaCanvas: false,
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

