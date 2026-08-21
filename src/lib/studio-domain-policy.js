export const STUDIO_DOMAIN = Object.freeze({
  TRAVEL: 'travel',
  FINANCE: 'finance',
  EDUCATION: 'education',
  RESEARCH: 'research',
});

const BASE = Object.freeze({
  title: 'Quantora',
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
    placeholder: 'What financial decision or portfolio question should we work through?',
    showModelControls: false,
    showArena: true,
    showGenericCanvasNavigation: true,
    autoOpenCodeWorkspace: false,
    explicitCodePreview: true,
    mediaCanvas: true,
  }),
  [STUDIO_DOMAIN.EDUCATION]: Object.freeze({
    title: 'Study Tutor',
    placeholder: 'What would you like to learn or understand better?',
    showModelControls: false,
    showArena: true,
    showGenericCanvasNavigation: true,
    autoOpenCodeWorkspace: false,
    explicitCodePreview: true,
    mediaCanvas: true,
  }),
  [STUDIO_DOMAIN.RESEARCH]: Object.freeze({
    title: 'Research Analyst',
    placeholder: 'What should I investigate, compare, or validate?',
    showModelControls: false,
    showArena: true,
    showGenericCanvasNavigation: true,
    autoOpenCodeWorkspace: false,
    explicitCodePreview: true,
    mediaCanvas: true,
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

export function canUseMediaCanvas(domain) {
  return studioDomainPolicy(domain).mediaCanvas === true;
}
