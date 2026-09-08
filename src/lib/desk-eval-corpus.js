/**
 * WHAT THE DESK IS ASKED, AND HOW A MACHINE KNOWS IT ANSWERED.
 *
 * Every browser gate in this repo drives the desk against a STUBBED model, so
 * all 36 of them prove the platform works and none of them prove a real build
 * turn produces what was asked for. The deployed golden runs real turns, but a
 * fixed two-to-eight of them. Nobody drives a SPREAD of prompts and records
 * what breaks — so the platform's failures were being found by its owner, in
 * screenshots, one at a time.
 *
 * THE PROPERTY THAT MAKES THIS WORK. A prompt only belongs here if a machine
 * can check the answer without asking another model. "Build me a nice
 * dashboard" is unjudgeable and would need an LLM judge, which is a second
 * thing that can be confidently wrong. "A heading that says Hello and a button
 * that changes it to Goodbye" is a contract: drive the button, read the
 * heading. Every case below states its expectations as things to find, click,
 * type and re-read in the rendered preview.
 *
 * Selectors are STRUCTURAL, never prose (§6). These artifacts are written by a
 * model and carry no data-quantora-* hooks, so the only durable anchors are
 * roles and shapes — a button, an input, a heading. Where a case must pick one
 * of several, it matches on the visible words the PROMPT asked for, which is
 * the one string the model is contractually bound to produce.
 *
 * TIERS EXIST FOR COST, NOT TASTE. Each case is a real model turn against a
 * real deployment and spends real provider credit. `smoke` is what you run on
 * a whim; `full` is what you run before letting people in.
 */

/**
 * ADVERSARIAL CASES ARE THE INCIDENTS, WRITTEN DOWN.
 *
 * Each one is a defect this platform actually shipped, phrased as the user
 * phrased it. A corpus containing only the cases that motivated a fix reads
 * 100% for a parser that got more dangerous (see travel-comprehension), so the
 * adversarial tier deliberately holds asks the desk should REFUSE to treat as
 * builds, next to the ones it should.
 */
export const DESK_EVAL_CASES = Object.freeze([
  // ---------------------------------------------------------------- simple
  {
    id: 'hello-goodbye',
    tier: 'simple',
    prompt: 'Build me a single page with a heading that says Hello and a button that changes it to Goodbye. Plain HTML and JavaScript, one file.',
    expect: {
      showsText: ['Hello'],
      steps: [{ click: { textLike: 'goodbye|change|toggle|click' }, thenShows: ['Goodbye'] }],
    },
  },
  {
    id: 'counter',
    tier: 'simple',
    prompt: 'Build a single page with a number starting at 0 and a button labelled Add one that increases it by one each click. Plain HTML and JavaScript.',
    expect: {
      showsText: ['0'],
      steps: [
        { click: { textLike: 'add one|add|\\+' }, thenShows: ['1'] },
        { click: { textLike: 'add one|add|\\+' }, thenShows: ['2'] },
      ],
    },
  },
  {
    id: 'dark-toggle',
    tier: 'simple',
    prompt: 'Build a single page with a paragraph of text and a button labelled Toggle theme that switches the page between light and dark. Plain HTML, CSS and JavaScript.',
    expect: {
      steps: [{ click: { textLike: 'toggle|theme|dark|light' }, thenBackgroundChanges: true }],
    },
  },
  {
    id: 'name-greeter',
    tier: 'simple',
    prompt: 'Build a single page with a text box and a button labelled Greet. When I type a name and press Greet, show "Hello, <name>!" below. Plain HTML and JavaScript.',
    expect: {
      steps: [{ fill: { value: 'Quantora' }, click: { textLike: 'greet' }, thenShows: ['Hello, Quantora'] }],
    },
  },

  // ---------------------------------------------------------------- medium
  {
    id: 'todo-list',
    tier: 'medium',
    prompt: 'Build a to-do list page: a text box, an Add button, and a list. Adding an item puts it in the list. Each item has a Delete button that removes it. Plain HTML and JavaScript.',
    expect: {
      steps: [
        { fill: { value: 'Buy milk' }, click: { textLike: 'add' }, thenShows: ['Buy milk'] },
        { click: { textLike: 'delete|remove|×|x' }, thenHides: ['Buy milk'] },
      ],
    },
  },
  {
    id: 'tip-calculator',
    tier: 'medium',
    prompt: 'Build a tip calculator: a box for the bill amount, a box for the tip percentage, and a Calculate button that shows the tip and the total. Use plain HTML and JavaScript.',
    expect: {
      steps: [
        { fillAll: ['100', '10'], click: { textLike: 'calculate|total|tip' }, thenShows: ['110'] },
      ],
    },
  },
  {
    id: 'unit-converter',
    tier: 'medium',
    prompt: 'Build a page that converts kilometres to miles. One input for kilometres, a Convert button, and the answer shown below. 10 km should give 6.21 miles. Plain HTML and JavaScript.',
    expect: {
      steps: [{ fill: { value: '10' }, click: { textLike: 'convert' }, thenShows: ['6.2'] }],
    },
  },
  {
    id: 'filterable-table',
    tier: 'medium',
    prompt: 'Build a page with a table of five products (name and price) and a search box above it that filters the rows as I type. Plain HTML and JavaScript.',
    expect: {
      minRows: 5,
      steps: [{ fill: { value: 'zzzznomatch' }, thenRowsAtMost: 1 }],
    },
  },

  // --------------------------------------------------------------- complex
  {
    id: 'expense-splitter',
    tier: 'complex',
    prompt: 'Build a flat expense splitter: add flatmates by name, add expenses with a description and amount paid by one flatmate, and show who owes whom so the totals settle exactly. Plain HTML and JavaScript.',
    expect: {
      steps: [
        { fill: { value: 'Alex' }, click: { textLike: 'add' }, thenShows: ['Alex'] },
      ],
      absentText: ['lorem ipsum', 'TODO', 'placeholder'],
    },
  },
  {
    id: 'quiz-scoring',
    tier: 'complex',
    prompt: 'Build a three-question multiple-choice quiz. After answering all three, show a score out of 3. Include a Restart button that clears the answers. Plain HTML and JavaScript.',
    expect: {
      showsText: ['1', '2', '3'],
      absentText: ['lorem ipsum', 'TODO'],
    },
  },
  {
    id: 'multi-file-project',
    tier: 'complex',
    prompt: 'Build a small recipe site with a home page listing three recipes and a separate stylesheet. Use index.html and styles.css as separate files.',
    expect: {
      files: ['index.html', 'styles.css'],
      absentText: ['lorem ipsum'],
    },
  },

  // ----------------------------------------------------------- adversarial
  {
    id: 'second-build-same-chat',
    tier: 'adversarial',
    incident: '2026-09-08 — a second build in one chat shipped as hello.html beside an improved index.html; Preview kept rendering the old page and said nothing about which file it was running.',
    turns: [
      { prompt: 'Build a single-page flat expense splitter. Plain HTML and JavaScript, one file.', expect: { showsText: ['xpense'] } },
      {
        prompt: 'Build me a single page with a heading that says Hello and a button that changes it to Goodbye. Plain HTML and JavaScript, one file.',
        expect: {
          // Either Preview shows the new page, or the desk offers a way to reach
          // it. Both are honest; only silence is the defect.
          showsTextOrEntryChoice: ['Hello'],
        },
      },
    ],
  },
  {
    id: 'refine-keeps-product',
    tier: 'adversarial',
    incident: 'A refine must change the thing on the desk, not replace it with a different product.',
    turns: [
      { prompt: 'Build a single page with a heading that says Quantora Desk and a button labelled Start. Plain HTML and JavaScript.', expect: { showsText: ['Quantora Desk'] } },
      { prompt: 'Make the heading blue.', expect: { showsText: ['Quantora Desk'], headingColorChanged: true } },
    ],
  },
  {
    id: 'question-is-not-an-edit',
    tier: 'adversarial',
    incident: '2026-09-07 — developer questions were read as instructions to change code; a question moved files while somebody was only asking.',
    turns: [
      { prompt: 'Build a single page with a heading that says Ledger and a button labelled Refresh. Plain HTML and JavaScript.', expect: { showsText: ['Ledger'] } },
      { prompt: 'What does the Refresh button do in this page?', expect: { filesUnchanged: true } },
    ],
  },
  {
    id: 'rate-limit-is-a-refusal',
    tier: 'adversarial',
    incident: '2026-09-08 — a 429 was diagnosed as a dead route and retried once per engine: eight requests for one message, each spending the budget it was waiting on.',
    prompt: 'Build a single page that says Budget Check. Plain HTML and JavaScript.',
    expect: { showsText: ['Budget'] },
    // The assertion that matters is not the artifact but the traffic: one user
    // message must not become a ladder of requests. Enforced by the driver.
    maxChatRequests: 3,
  },
]);

export const TIERS = Object.freeze({
  smoke: ['simple'],
  standard: ['simple', 'medium'],
  full: ['simple', 'medium', 'complex', 'adversarial'],
  adversarial: ['adversarial'],
});

/** Model turns a case costs: one per prompt, and a multi-turn case pays per turn. */
export function turnsForCase(testCase) {
  return Array.isArray(testCase?.turns) ? testCase.turns.length : 1;
}

export function casesForTier(tier = 'smoke', cases = DESK_EVAL_CASES) {
  const wanted = TIERS[tier];
  if (!wanted) throw new Error(`Unknown tier "${tier}". Known: ${Object.keys(TIERS).join(', ')}`);
  return cases.filter((testCase) => wanted.includes(testCase.tier));
}

/**
 * What a run will cost before it runs.
 *
 * Printed up front and never estimated silently: this repo lost roughly six
 * dollars in twelve hours to gates whose spend nobody had counted, and the
 * owner is funding a student pilot on borrowed money. A number you have to
 * read is the cheapest guard there is.
 */
export function estimateRun(tier = 'smoke', costPerTurnUsd = 0.03, cases = DESK_EVAL_CASES) {
  const selected = casesForTier(tier, cases);
  const turns = selected.reduce((total, testCase) => total + turnsForCase(testCase), 0);
  return {
    tier,
    cases: selected.length,
    turns,
    estimatedUsd: Number((turns * costPerTurnUsd).toFixed(2)),
  };
}
