/**
 * The comprehension gate.
 *
 * Every other gate in this repo asks whether something is REACHABLE — is the
 * control wired, is the /api/ path served, is the advertised capability
 * answerable. None of them asks whether the desk understood the person using
 * it, so a parser that was confidently wrong passed all of them, shipped, and
 * was found by a screenshot.
 *
 * This one measures two numbers and refuses to let either slip.
 *
 *   PRECISION must be 100%. A place we report that was never said is an
 *   invented destination, one tap from a live provider search. There is no
 *   acceptable non-zero rate for this and the floor is not negotiable.
 *
 *   RECALL has a floor that may only ever be raised. It measures how often the
 *   desk hears someone who has just told it where they are going; at the time
 *   this gate was written it was 51%, which is what "the board asks Where are
 *   you heading directly under a reply naming the place" looks like as a
 *   number.
 *
 * The two pull against each other on purpose. Recall bought by loosening the
 * parser shows up immediately as an invention here, which is exactly the trade
 * that has to stay visible — the first attempt at this took recall to 100% and
 * would have offered hotels in "Sarah".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTravelBrief } from './travel-board-brief.js';

/*
 * ---------------------------------------------------------------------------
 * THE CORPUS
 *
 * Held in this file rather than beside it on purpose. As an importable module
 * its exports were five dead wires — symbols nothing in production reaches —
 * and the wiring gate was right to fail on them. That gate is a ratchet, and
 * five permanent baseline entries for test data would blunt it for everyone
 * after us. The data and the assertions that read it belong together anyway.
 *
 * `dest`/`origin` are what a competent human reader would extract, or nothing
 * where the honest answer is that no place was named. The nothing-cases carry
 * as much weight as the rest: they are what stops recall being bought with
 * invention.
 *
 * Add a case whenever a real message is mishandled — but add its NEIGHBOURS
 * too, not just the exact sentence, or this becomes the same patch-per-bug
 * cycle with a nicer file name.
 * ---------------------------------------------------------------------------
 */

/** Sentences that name a destination plainly. Failing these is deafness. */
const NAMES_A_PLACE = [
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
const NAMES_NO_PLACE = [
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
const REAL_ROUTES = [
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
const NOT_PLACES = [
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
const HOLDOUT_PLACES = [
  { text: 'just got back from Rome, want to go to Athens next', dest: 'Athens' },
  { text: 'Vienna or bust', dest: 'Vienna' },
  { text: 'Copenhagen. thoughts?', dest: 'Copenhagen' },
  { text: 'ive always wanted to see Petra', dest: 'Petra' },
  { text: 'whats good near Zurich', dest: 'Zurich' },
];

/** Recall may rise, never fall. Raise this when the parser genuinely improves. */
const RECALL_FLOOR = 85;

const brief = (text) => deriveTravelBrief({ messages: [{ sender: 'user', text }] });
const norm = (value) => String(value || '').trim().toLowerCase();
const reported = (b) => b.destinationLabel || b.destination || b.originLabel || b.origin || '';

test('PRECISION: a sentence that names no place yields no place', () => {
  const invented = NAMES_NO_PLACE
    .map((c) => [c.text, reported(brief(c.text))])
    .filter(([, got]) => got);
  assert.deepEqual(invented, [], `invented a place from a sentence with none: ${JSON.stringify(invented)}`);
});

test('PRECISION: a capitalised word is not a place — names, airlines, brands, employers', () => {
  const invented = NOT_PLACES
    .map((text) => [text, reported(brief(text))])
    .filter(([, got]) => got);
  assert.deepEqual(invented, [], `read a non-place proper noun as a place: ${JSON.stringify(invented)}`);
});

test('PRECISION: every place reported was really named', () => {
  const wrong = [...NAMES_A_PLACE, ...REAL_ROUTES, ...HOLDOUT_PLACES]
    .filter((c) => c.dest)
    .map((c) => [c.text, norm(brief(c.text).destinationLabel || brief(c.text).destination), norm(c.dest)])
    .filter(([, got, want]) => got && got !== want);
  assert.deepEqual(wrong, [], `reported a different place than the one named: ${JSON.stringify(wrong)}`);
});

test(`RECALL: the desk hears at least ${RECALL_FLOOR}% of stated destinations`, () => {
  const named = [...NAMES_A_PLACE, ...REAL_ROUTES].filter((c) => c.dest);
  const heard = named.filter((c) => {
    const b = brief(c.text);
    return norm(b.destinationLabel || b.destination) === norm(c.dest);
  });
  const recall = (heard.length / named.length) * 100;
  const deaf = named.filter((c) => !norm(brief(c.text).destinationLabel || brief(c.text).destination))
    .map((c) => c.text);
  assert.ok(
    recall >= RECALL_FLOOR,
    `recall ${recall.toFixed(1)}% is below the ${RECALL_FLOOR}% floor. Deaf to: ${JSON.stringify(deaf, null, 2)}`,
  );
});

test('RECALL generalises: places phrased in ways the fix was not built against', () => {
  const missed = HOLDOUT_PLACES
    .map((c) => [c.text, norm(brief(c.text).destinationLabel || brief(c.text).destination), norm(c.dest)])
    .filter(([, got, want]) => got !== want);
  // A holdout miss is a recall gap, not an invention, so this asserts a budget
  // rather than perfection — the parser is allowed not to understand a
  // phrasing, and is never allowed to guess at one.
  assert.ok(missed.length <= 1, `holdout recall regressed: ${JSON.stringify(missed, null, 2)}`);
});

test('ORIGIN: a stated origin is heard, and never invented from a date range', () => {
  assert.equal(brief('help me book tickets to Bali from Singapore').originLabel, 'Singapore');
  assert.equal(brief('I can travel from Monday to Friday').originLabel || '', '');
  assert.equal(brief('I am available from May to August').originLabel || '', '');
});
