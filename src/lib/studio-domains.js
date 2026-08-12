/** Topic / domain focus chips (what the user is working on). Separate from studio output mode. */

export const STUDIO_DOMAINS = [
  {
    id: 'travel',
    label: 'Travel',
    description: 'Trips, itineraries, destinations',
    placeholder: 'Where would you like to go? I\'ll help plan it with you...',
  },
  {
    id: 'education',
    label: 'Education',
    description: 'Learn, study plans, explain concepts',
    placeholder: 'What would you like to learn or understand?',
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Budgets, savings, money decisions',
    placeholder: 'What financial question or goal can I help with?',
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Deep dive, compare, investigate',
    placeholder: 'What topic should we research together?',
  },
];

export const STUDIO_OUTPUT_MODES = [
  { id: 'ask', label: 'Chat', description: 'Natural conversation and advice' },
  { id: 'build', label: 'Build', description: 'Generate runnable HTML preview' },
  { id: 'plan', label: 'Plan app', description: 'Software architecture plan (JSON)' },
];

export function getDomainById(id) {
  return STUDIO_DOMAINS.find((d) => d.id === id) || null;
}

export function getOutputModeLabel(id) {
  return STUDIO_OUTPUT_MODES.find((m) => m.id === id)?.label || 'Chat';
}

export function getPromptPlaceholder({ studioMode, studioDomain, boundRepoName }) {
  const domain = getDomainById(studioDomain);
  if (domain) return domain.placeholder;
  if (studioMode === 'build') return 'Describe what you want to build — Quantora will generate runnable HTML...';
  if (studioMode === 'plan') return 'Describe your app or feature — Quantora will output an architecture plan (JSON)...';
  if (boundRepoName) return `Ask about ${boundRepoName} — code, architecture, or changes...`;
  return 'Ask anything — plan a trip, research an idea, or build an app...';
}
