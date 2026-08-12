/** One-click starter prompts for common Quantora outcomes. */

export const STARTER_TEMPLATES = [
  {
    id: 'bakery',
    label: 'Local bakery site',
    emoji: '🥐',
    domain: null,
    mode: 'build',
    prompt: 'Build a warm, modern website for a neighborhood bakery — menu, hours, location map, and a simple order form. Ask one question if needed, then generate the preview.',
  },
  {
    id: 'tuition',
    label: 'Tuition center',
    emoji: '📚',
    domain: 'education',
    mode: 'build',
    prompt: 'Create a tuition center landing page with subjects offered, class schedules, teacher bios, and a contact form for parent inquiries.',
  },
  {
    id: 'portfolio',
    label: 'Personal portfolio',
    emoji: '✨',
    domain: null,
    mode: 'build',
    prompt: 'Build a clean personal portfolio site for a creative professional — hero, projects grid, about, and contact. Modern and minimal.',
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
