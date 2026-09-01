/**
 * How people actually open a travel chat, with the answer written down.
 *
 * This file exists because "reliable" had no number attached to it. Every gate
 * in this repo checked whether a control was reachable; none checked whether
 * the desk understood the person using it. So comprehension could only be
 * assessed anecdotally — a screenshot arrives, a hole is patched, and the next
 * differently-shaped sentence fails exactly the same way.
 *
 * A corpus turns that into two measurable quantities:
 *
 *   PRECISION — of the places we report, how many were really said?
 *               A miss here is the desk INVENTING a destination. It is the
 *               unforgivable failure and its floor is 100%.
 *
 *   RECALL    — of the places really said, how many did we hear?
 *               A miss here is the desk asking "Where are you heading?" at
 *               someone who just told it. Annoying, not dangerous, and the
 *               number we are trying to move.
 *
 * Add a case whenever a real message is mishandled — but add its NEIGHBOURS
 * too, not just the exact sentence, or this becomes the same patch-per-bug
 * cycle with a nicer file name.
 *
 * `dest`/`origin` are the place a competent human reader would extract, or
 * null where the honest answer is that nothing was named. `null` cases are as
 * important as the rest: they are what stops recall being bought with
 * invention.
 */

/** Sentences that name a destination plainly. Failing these is deafness. */
export const NAMES_A_PLACE = [
  { text: 'help me book tickets to Bali from Singapore', dest: 'Bali', origin: 'Singapore' },
  { text: 'book me a ticket to Bali', dest: 'Bali', origin: null },
  { text: 'need tickets to Bali', dest: 'Bali', origin: null },
  { text: 'tickets to Bali', dest: 'Bali', origin: null },
  { text: 'get me to Bali', dest: 'Bali', origin: null },
  { text: 'flights to Bali from Singapore', dest: 'Bali', origin: 'Singapore' },
  { text: 'I want to go to Tokyo', dest: 'Tokyo', origin: null },
  { text: 'planning a trip to Lisbon', dest: 'Lisbon', origin: null },
  { text: 'we are travelling to Rome in October', dest: 'Rome', origin: null },
  { text: 'thinking of visiting Kyoto', dest: 'Kyoto', origin: null },
  { text: 'hotels in Barcelona', dest: 'Barcelona', origin: null },
  { text: 'places to stay in Amsterdam', dest: 'Amsterdam', origin: null },
  { text: 'book me a flight from Kuala Lumpur to Tokyo', dest: 'Tokyo', origin: 'Kuala Lumpur' },

  // Phrasings the cue list has never seen. These are the deafness cases found
  // by probing the merged parser — every one returned "Where are you heading?"
  { text: 'me and my wife want to see the northern lights in Tromso', dest: 'Tromso', origin: null },
  { text: 'whats the cheapest way to get to Bali in December', dest: 'Bali', origin: null },
  { text: 'planning our honeymoon, thinking Maldives', dest: 'Maldives', origin: null },
  { text: 'we land in Tokyo on the 4th', dest: 'Tokyo', origin: null },
  { text: 'can you find me somewhere in Bali with a pool', dest: 'Bali', origin: null },
  { text: 'I have a conference in Berlin, need a hotel nearby', dest: 'Berlin', origin: null },
  { text: 'is Bali good in March', dest: 'Bali', origin: null },
  { text: 'heading to Seoul for work next month', dest: 'Seoul', origin: null },
  { text: 'any recommendations for Porto', dest: 'Porto', origin: null },
  { text: 'whats there to do in Hanoi', dest: 'Hanoi', origin: null },
  { text: 'we want to spend a week in Sri Lanka', dest: 'Sri Lanka', origin: null },
  { text: 'looking at Iceland for the summer', dest: 'Iceland', origin: null },
  { text: 'family holiday, probably Phuket', dest: 'Phuket', origin: null },
  { text: 'need to be in Dubai by the 12th', dest: 'Dubai', origin: null },
  { text: 'can we do Paris on a budget', dest: 'Paris', origin: null },
  { text: 'i fly out of Chennai next week, want to end up in Bangkok', dest: 'Bangkok', origin: 'Chennai' },
  { text: 'show me stays around Ubud', dest: 'Ubud', origin: null },
  { text: 'whats the weather like in Reykjavik in january', dest: 'Reykjavik', origin: null },
  { text: 'trip to New York City with the kids', dest: 'New York City', origin: null },
  { text: 'weekend break somewhere in Portugal', dest: 'Portugal', origin: null },
  { text: 'flying into Singapore, staying 3 nights', dest: 'Singapore', origin: null },
  { text: 'want to visit Osaka in the spring', dest: 'Osaka', origin: null },
];

/**
 * Sentences that name NO place. Reporting one here is invention — the failure
 * that must stay at zero however much recall improves.
 */
export const NAMES_NO_PLACE = [
  { text: 'I want to plan a trip' },
  { text: 'help me plan a holiday' },
  { text: 'take me somewhere warm' },
  { text: 'somewhere warm in January' },
  { text: 'anywhere cheap' },
  { text: 'take me home' },
  { text: 'I am flying from there' },
  { text: 'we could go anywhere really' },
  { text: 'thinking about a beach holiday' },
  { text: 'I can travel from Monday to Friday' },
  { text: 'I am available from May to August' },
  { text: 'free from Tuesday to Thursday' },
  { text: 'we can go from June to September' },
  { text: 'available from tomorrow to the weekend' },
  { text: 'from morning to evening works' },
  { text: 'thinking about Japan or Korea, not sure yet' },
  { text: 'what can you help me with' },
  { text: 'convert 2000 USD to SGD for the trip' },
  { text: 'whats my baggage allowance' },
  { text: 'do I need a visa' },
];

/** Real routes, held against a stop list that over-blocks. */
export const REAL_ROUTES = [
  { text: 'book me a flight from Kuala Lumpur to Tokyo', dest: 'Tokyo', origin: 'Kuala Lumpur' },
  { text: 'flying from Nice to Reading', dest: 'Reading', origin: 'Nice' },
  { text: 'trip to March', dest: 'March', origin: null },
  { text: 'from Bath to Cambridge', dest: 'Cambridge', origin: 'Bath' },
];

/**
 * Proper nouns that are NOT places. The single most valuable block in this file.
 *
 * A first attempt at the deafness problem read any capitalised word as a place
 * and offered hotels in "Sarah", "Emirates", "Marriott" and "Deloitte" —
 * fourteen of these fifteen became destinations. Recall had gone from 51% to
 * 100% on the corpus above while the parser quietly got far more dangerous,
 * because the corpus contained nothing it could fail on.
 *
 * That is the whole argument for a holdout: a fix measured only against the
 * cases that motivated it will always look perfect. These are held apart on
 * purpose — names, airlines, hotel chains, card networks, employers, festivals
 * and guidebooks all arrive capitalised in a travel chat.
 */
export const NOT_PLACES = [
  "I'm travelling with Sarah and the kids",
  'my name is Priya, can you help',
  'flying Emirates, need a hotel',
  'can I use my Amex points',
  'is Skyscanner cheaper',
  'we booked through Expedia already',
  'staying at a Marriott',
  'my passport is British',
  'I speak English and Tamil',
  'can you check Google Flights',
  'my company is Deloitte, its a work trip',
  'I have a Visa card',
  'we celebrated Diwali last week',
  'reading Lonely Planet for ideas',
  'my flight is on Singapore Airlines',
];

/**
 * Places phrased in ways the fix was not built against. Held out to measure
 * whether recall generalises or was merely fitted to the cases above.
 */
export const HOLDOUT_PLACES = [
  { text: 'just got back from Rome, want to go to Athens next', dest: 'Athens' },
  { text: 'Vienna or bust', dest: 'Vienna' },
  { text: 'Copenhagen. thoughts?', dest: 'Copenhagen' },
  { text: 'ive always wanted to see Petra', dest: 'Petra' },
  { text: 'whats good near Zurich', dest: 'Zurich' },
];
