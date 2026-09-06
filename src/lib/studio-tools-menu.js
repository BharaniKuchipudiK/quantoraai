import {
  studyApplicationAsk,
  studyActionVisibleText,
  studyFlashcardAsk,
  studyIcebreakerAsk,
  studyNotesAsk,
  studyPlanAsk,
} from './study-learning-resources.js';
import { withStudySyllabusAsk } from './study-syllabus-overlay.js';
import {
  travelAttractionsAsk,
  travelFlightsAsk,
  travelHotelsAsk,
  travelIcebreakerAsk,
  travelItineraryAsk,
} from './travel-advisor-asks.js';

export const STUDIO_PLUS_ACTION = Object.freeze({
  FRESH_THREAD: 'fresh-thread',
  OPEN_DOMAIN: 'open-domain',
  PROMPT: 'prompt',
});

/*
 * Deep Research and Travel are deliberately NOT listed here.
 *
 * Travel has its own desk in the left navigation, so a second door into it
 * from the composer's plus menu offered the same destination twice and made
 * the general menu read as a feature list rather than a set of things to do
 * with this chat. Deep Research came out alongside it while it is still Beta.
 *
 * Neither capability is deleted: `resolveStudioPlusAction` still answers for
 * both ids, so re-listing either is a one-line change here and nothing
 * downstream has to be rebuilt. Travel remains reachable from the sidebar.
 */
const STUDIO_GENERAL = [
  { id: 'Search', title: 'Search', subtitle: 'Auto-browse the web, YouTube & X', icon: 'globe' },
  { id: 'Podcast', title: 'Podcast', subtitle: 'Turn content into a podcast', icon: 'mic' },
];

const STUDIO_OFFICE = [
  { id: 'PowerPoint', title: 'PowerPoint', subtitle: 'Create & edit presentations', icon: 'slides', badge: 'Beta', iconColor: '#ef4444' },
  { id: 'Excel', title: 'Excel', subtitle: 'Create & edit spreadsheets', icon: 'table', badge: 'Beta', iconColor: '#10b981' },
  { id: 'Word', title: 'Word', subtitle: 'Create & edit documents', icon: 'word', badge: 'Beta', iconColor: '#3b82f6' },
  { id: 'PDF', title: 'PDF', subtitle: 'Create & edit PDFs', icon: 'pdf', badge: 'Beta', iconColor: '#ef4444' },
];

/**
 * Plus-menu catalog. Travel and Study never share items.
 * Studio keeps Search / Office. Picking Travel opens the Travel advisor — it does not stay in Studio chat.
 */
export function studioToolsMenuGroups(studioDomain, topic = '') {
  if (studioDomain === 'travel') {
    return [
      {
        heading: 'THIS TRIP',
        items: [
          { id: 'new-trip', title: 'New trip', subtitle: 'Start fresh. This thread stays in the list.', icon: 'plus' },
          { id: 'travel-icebreaker', title: 'Icebreaker', subtitle: 'One true hook, then pause so you stay focused.', icon: 'spark' },
          { id: 'travel-flights', title: 'Flights', subtitle: 'Live options when you give airports and dates.', icon: 'plane' },
          { id: 'travel-hotels', title: 'Hotels', subtitle: 'Shortlist stays. We do not invent ratings.', icon: 'hotel' },
          { id: 'travel-attractions', title: 'Attractions', subtitle: 'Places that fit this trip, in chat.', icon: 'pin' },
          { id: 'travel-itinerary', title: 'Itinerary', subtitle: 'A balanced day-by-day plan.', icon: 'route' },
        ],
      },
    ];
  }

  if (studioDomain === 'education') {
    return [
      {
        heading: 'THIS TOPIC',
        items: [
          { id: 'new-topic', title: 'New topic', subtitle: 'Start a fresh Study thread.', icon: 'plus' },
          { id: 'study-icebreaker', title: 'Icebreaker', subtitle: 'Open the idea with one context-aware hook.', icon: 'spark' },
          { id: 'study-flashcards', title: 'Flashcards', subtitle: 'Recall from what this conversation established.', icon: 'cards' },
          { id: 'study-apply', title: 'Apply', subtitle: 'Use the idea in a relevant real situation.', icon: 'spark' },
          { id: 'study-plan', title: 'Plan', subtitle: 'Choose the next useful learning steps.', icon: 'route' },
          { id: 'study-notes', title: 'Notes', subtitle: 'Summarize established ideas and open gaps.', icon: 'word' },
        ],
      },
    ];
  }

  if (studioDomain === 'finance' || studioDomain === 'research') {
    return [
      {
        heading: studioDomain === 'finance' ? 'THIS MONEY QUESTION' : 'THIS RESEARCH',
        items: [
          {
            id: 'new-advisor-chat',
            title: 'New conversation',
            subtitle: 'Start fresh in this advisor. The current thread stays in your list.',
            icon: 'plus',
          },
        ],
      },
    ];
  }

  return [
    { heading: 'GENERAL', items: STUDIO_GENERAL },
    { heading: 'OFFICE', items: STUDIO_OFFICE },
  ];
}

export function resolveStudioPlusAction(toolId, studioDomain = null, topic = '', overlay = null) {
  const id = String(toolId || '');
  if (id === 'new-trip') return { kind: STUDIO_PLUS_ACTION.FRESH_THREAD, domain: 'travel' };
  if (id === 'new-topic') return { kind: STUDIO_PLUS_ACTION.FRESH_THREAD, domain: 'education' };
  if (id === 'new-advisor-chat') {
    const domain = studioDomain === 'finance' || studioDomain === 'research' ? studioDomain : null;
    return domain
      ? { kind: STUDIO_PLUS_ACTION.FRESH_THREAD, domain }
      : { kind: STUDIO_PLUS_ACTION.PROMPT, text: '' };
  }
  if (id === 'open-travel') return { kind: STUDIO_PLUS_ACTION.OPEN_DOMAIN, domain: 'travel' };

  const prompts = {
    Search: 'Search the web for ',
    'Deep Research': 'Conduct a deep research report on ',
    Podcast: 'Create a podcast script about ',
    PowerPoint: 'Prepare a PowerPoint presentation about ',
    Excel: 'Create an Excel spreadsheet that tracks ',
    Word: 'Draft a formal Word document discussing ',
    PDF: 'Generate a PDF summary of ',
    'travel-icebreaker': travelIcebreakerAsk(),
    'travel-flights': travelFlightsAsk(),
    'travel-hotels': travelHotelsAsk(),
    'travel-attractions': travelAttractionsAsk(),
    'travel-itinerary': travelItineraryAsk(),
    'study-icebreaker': withStudySyllabusAsk(studyIcebreakerAsk(topic), overlay),
    'study-flashcards': withStudySyllabusAsk(studyFlashcardAsk(topic || 'this idea'), overlay),
    'study-apply': withStudySyllabusAsk(studyApplicationAsk(topic || 'this idea'), overlay),
    'study-plan': withStudySyllabusAsk(studyPlanAsk(topic || 'this idea'), overlay),
    'study-notes': withStudySyllabusAsk(studyNotesAsk(topic || 'this idea'), overlay),
  };

  if (Object.prototype.hasOwnProperty.call(prompts, id)) {
    const studyAction = {
      'study-icebreaker': 'icebreaker',
      'study-flashcards': 'flashcards',
      'study-apply': 'application',
      'study-plan': 'plan',
      'study-notes': 'notes',
    }[id];
    return {
      kind: STUDIO_PLUS_ACTION.PROMPT,
      text: prompts[id],
      ...(studyAction ? { visibleText: studyActionVisibleText(studyAction, topic) } : {}),
    };
  }
  return { kind: STUDIO_PLUS_ACTION.PROMPT, text: '' };
}
