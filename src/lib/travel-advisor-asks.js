/**
 * Travel-only asks. Never import Study flashcards/quiz into this file.
 */
export function travelIcebreakerAsk() {
  return [
    'Give one true, checkable icebreaker about this trip or destination — one short beat, like a surprising first or a place fact.',
    'Then STOP. Ask me to tap or say “I’m with you” before any itinerary, flights, or hotels.',
    'Do not teach school subjects, Newton, kinematics, quizzes, or flashcards.',
    'Do not invent fares, hotels, or ratings.',
  ].join(' ');
}

export function travelFlightsAsk() {
  return 'Help me choose live flights. I will give from-airport, to-airport, and dates.';
}

export function travelHotelsAsk() {
  return [
    'Look up live places to stay with search_hotels (Google Places).',
    'I will name the city or neighbourhood.',
    'For each property: Google user rating ★ x/5 (review count), a website or Maps link, and keep it in chat.',
    'Do not invent ratings. Do not call map routing. Do not claim rooms are available.',
  ].join(' ');
}

export function travelAttractionsAsk() {
  return 'Suggest attractions that fit this trip. Keep it in chat — not a website.';
}

export function travelItineraryAsk() {
  return 'Draft a balanced day-by-day itinerary for this trip.';
}
