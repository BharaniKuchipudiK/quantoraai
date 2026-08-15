/** One-click starter prompts for common Quantora outcomes. */

export const STARTER_TEMPLATES = [
  {
    id: 'bakery',
    label: 'Local bakery site',
    emoji: '🥐',
    domain: null,
    mode: 'build',
    prompt: 'Build a warm, modern website for a neighborhood bakery. Ask about the shop name and what they offer before generating the preview.',
  },
  {
    id: 'tuition',
    label: 'Tuition center',
    emoji: '📚',
    domain: 'education',
    mode: 'build',
    prompt: 'Create a tuition center landing page. Ask about the center name, subjects, and audience before building the first draft.',
  },
  {
    id: 'portfolio',
    label: 'Personal portfolio',
    emoji: '✨',
    domain: null,
    mode: 'build',
    prompt: 'Build a clean personal portfolio site. Ask what name to use, what work to showcase, and the vibe before building.',
  },
  {
    id: 'travel-blog',
    label: 'Travel plan',
    emoji: '✈️',
    domain: 'travel',
    mode: 'ask',
    prompt: 'Help me plan a relaxing coastal trip. Ask one clarifying question about timing or budget, then suggest 2–3 destinations with direct website links.',
  },
];
