/**
 * History budget — stop a good session from becoming an unsendable one.
 *
 * WHY THIS EXISTS
 *
 * Every request to /api/chat carries the whole conversation. `MAX_HISTORY_ITEMS`
 * on the server caps the COUNT at 100 and nothing anywhere caps the SIZE — and
 * in a Coding Desk session the size is what matters, because each assistant
 * turn carries the full HTML document it built. A handful of pages, or one page
 * with inline data-URI images, and the body passes the platform's request limit.
 *
 * Past that limit the request is rejected BEFORE the function runs, so there is
 * no handler to write a JSON error and nothing in any log. The browser reads a
 * non-JSON body, `res.json().catch(() => ({}))` yields `{}`, and the user is
 * told "The AI gateway could not complete the request with <model>".
 *
 * Which is why every model appeared to fail at once, including one that talks
 * straight to Google and had been proved working an hour earlier. Nothing was
 * wrong with any provider. The turn never reached one.
 *
 * The failure mode is the cruel part: a session gets MORE broken every time you
 * retry, because each attempt adds turns, and the only escape — start a new
 * chat and lose the work — is the one thing nobody is told.
 *
 * WHAT THIS DOES
 *
 * Trims oldest-first, and trims bulk before it drops anything. An old assistant
 * turn's giant code block is the least valuable thing in the transcript: the
 * built files travel separately in the VFS, so the transcript copy is a
 * duplicate. Summarising those recovers most of the space while keeping the
 * conversation's shape. Only if that is not enough do whole turns go, oldest
 * first, and the most recent exchange is never dropped — without it there is no
 * turn to answer.
 */

/**
 * A conservative ceiling for the serialized history.
 *
 * Serverless request bodies are commonly capped around 4.5MB and the history is
 * only part of what we send: the message, the VFS, session context, images and
 * routing all share that budget. 1.2MB leaves room for the rest and still holds
 * a long conversation.
 */
export const HISTORY_BYTE_BUDGET = 1_200_000;

/** How many recent turns keep their full text no matter what. */
const VERBATIM_TAIL = 6;

/** Text longer than this in an OLDER turn is bulk, not conversation. */
const BULK_TEXT = 4_000;

const sizeOf = (value) => {
  try { return JSON.stringify(value).length; } catch { return 0; }
};

/**
 * Replace the body of a long old message with a marker naming what was there.
 *
 * Never silent. A turn that reads as if the assistant said less than it did
 * would make the model contradict its own history, and the person scrolling
 * back deserves to know why the text is shorter than they remember.
 */
function summarizeBulk(message) {
  const text = String(message?.text || '');
  if (text.length <= BULK_TEXT) return message;
  const head = text.slice(0, 600).trimEnd();
  return {
    ...message,
    text: `${head}\n\n…[${(text.length - 600).toLocaleString()} characters of this earlier turn were trimmed to keep the conversation sendable. The files it produced are still on the desk.]`,
    __trimmed: true,
  };
}

/**
 * Older turns beyond this many are carried as one-line digests, whatever their
 * size. The server keeps the last 100 items and silently cuts the rest; this
 * keeps the request under that line with the shape of the conversation intact.
 */
export const HISTORY_ITEM_BUDGET = 80;
export const HISTORY_DIGEST_ID = 'history-digest';
const DIGEST_LINE_CHARS = 140;

function digestLine(message) {
  const who = message?.sender === 'user' ? 'You' : 'Quantora';
  const text = String(message?.text || '').replace(/\s+/g, ' ').trim();
  const body = text.length > DIGEST_LINE_CHARS ? `${text.slice(0, DIGEST_LINE_CHARS - 1)}…` : text;
  return `- ${who}: ${body || '(no text)'}`;
}

/*
 * COMPACTION, NOT DELETION (2026-09-06).
 *
 * Turns past the budget used to be dropped whole, and the person was told "I
 * left out the earliest 5 messages". A long build session loses its opening
 * brief that way — the one message that says what the site is for — and every
 * later answer drifts. Now the oldest turns fold into one digest message at the
 * head of the history: one line each, who said it and the first 140 characters.
 * The model keeps the shape of the conversation; the request stays small.
 */
function digestMessage(compacted) {
  const n = compacted.length;
  return {
    id: HISTORY_DIGEST_ID,
    sender: 'ai',
    text: `Earlier in this conversation (${n} turn${n === 1 ? '' : 's'} compacted to keep the request sendable; the files they produced are still on the desk):\n${compacted.map(digestLine).join('\n')}`,
    __digest: true,
    __compacted: n,
  };
}

/** Fold the oldest `count` non-digest turns of `working` into its digest. */
function compactOldest(working, compacted, count) {
  const moved = working.slice(0, count);
  const rest = working.slice(count);
  const all = [...compacted, ...moved];
  return { working: [digestMessage(all), ...rest], compacted: all };
}

/**
 * Fit a transcript inside the byte and item budgets, losing as little meaning as possible.
 *
 * @returns {{ history: object[], trimmed: number, dropped: number, compacted: number, bytes: number }}
 *   `dropped` counts the turns no longer sent verbatim — they live on in the
 *   digest, and the name is kept so older readers of this result still work.
 */
export function budgetHistory(messages = [], { maxBytes = HISTORY_BYTE_BUDGET, maxItems = HISTORY_ITEM_BUDGET } = {}) {
  const all = Array.isArray(messages) ? messages : [];
  if (!all.length) return { history: [], trimmed: 0, dropped: 0, compacted: 0, bytes: 0 };

  let working = all;
  let compacted = [];
  let trimmed = 0;
  let bytes = sizeOf(working);

  // 1. Summarise bulk in everything but the recent tail.
  if (bytes > maxBytes) {
    const tailStart = Math.max(0, working.length - VERBATIM_TAIL);
    working = working.map((message, index) => {
      if (index >= tailStart) return message;
      const next = summarizeBulk(message);
      if (next !== message) trimmed += 1;
      return next;
    });
    bytes = sizeOf(working);
  }

  // 2. Too many items: fold the oldest into the digest so the server never cuts silently.
  if (working.length > maxItems) {
    ({ working, compacted } = compactOldest(working, compacted, working.length - maxItems + 1));
    bytes = sizeOf(working);
  }

  // 3. Still too large: fold the oldest whole turns, never the last exchange.
  const turnsBeyondDigest = () => working.length - (compacted.length ? 1 : 0);
  while (turnsBeyondDigest() > 2 && bytes > maxBytes) {
    const digestOffset = compacted.length ? 1 : 0;
    const moved = working.slice(digestOffset, digestOffset + 1);
    compacted = [...compacted, ...moved];
    working = [digestMessage(compacted), ...working.slice(digestOffset + 1)];
    bytes = sizeOf(working);
  }

  /*
   * 4. A single turn can still exceed the budget on its own — one enormous
   * pasted file, or an image inlined as a data URI. Summarising the last
   * exchange is a real loss, and it is a smaller loss than a request that
   * cannot be sent at all.
   */
  if (bytes > maxBytes) {
    working = working.map((message) => {
      if (message.__digest) return message;
      const next = summarizeBulk(message);
      if (next !== message) trimmed += 1;
      return next;
    });
    bytes = sizeOf(working);
  }

  return { history: working, trimmed, dropped: compacted.length, compacted: compacted.length, bytes };
}

/**
 * What to tell the person, when anything was lost.
 *
 * This was deleted on the reasoning that the handover chip now carries
 * continuity. The chip is an OFFER — "start a fresh session" — shown once and
 * then suppressed until pressure worsens, and its label never mentions that
 * anything was dropped. A fact and an offer are different things: the fact that
 * part of their conversation is no longer being sent has to be reported every
 * time it happens, or the platform is quietly forgetting and letting somebody
 * wonder why it stopped remembering.
 */
export function describeHistoryBudget({ trimmed = 0, dropped = 0, compacted = null } = {}) {
  const folded = compacted === null ? dropped : compacted;
  if (!trimmed && !folded) return '';
  const parts = [];
  if (folded) parts.push(`folded the earliest ${folded} message${folded === 1 ? '' : 's'} into one-line summaries`);
  if (trimmed) parts.push(`shortened the long output of ${trimmed} earlier turn${trimmed === 1 ? '' : 's'}`);
  return `This conversation got large enough to stop sending as it was, so I ${parts.join(' and ')}. Nothing is forgotten outright, and everything built is still on the desk.`;
}
