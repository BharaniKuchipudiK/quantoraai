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
 * Fit a transcript inside the byte budget, losing as little meaning as possible.
 *
 * @returns {{ history: object[], trimmed: number, dropped: number, bytes: number }}
 */
export function budgetHistory(messages = [], { maxBytes = HISTORY_BYTE_BUDGET } = {}) {
  const all = Array.isArray(messages) ? messages : [];
  if (!all.length) return { history: [], trimmed: 0, dropped: 0, bytes: 0 };

  let working = all;
  let bytes = sizeOf(working);
  if (bytes <= maxBytes) return { history: working, trimmed: 0, dropped: 0, bytes };

  // 1. Summarise bulk in everything but the recent tail.
  const tailStart = Math.max(0, working.length - VERBATIM_TAIL);
  let trimmed = 0;
  working = working.map((message, index) => {
    if (index >= tailStart) return message;
    const next = summarizeBulk(message);
    if (next !== message) trimmed += 1;
    return next;
  });
  bytes = sizeOf(working);
  if (bytes <= maxBytes) return { history: working, trimmed, dropped: 0, bytes };

  // 2. Still too large: drop oldest whole turns, never the last exchange.
  let dropped = 0;
  while (working.length > 2 && bytes > maxBytes) {
    working = working.slice(1);
    dropped += 1;
    bytes = sizeOf(working);
  }

  /*
   * 3. A single turn can still exceed the budget on its own — one enormous
   * pasted file, or an image inlined as a data URI. Summarising the last
   * exchange is a real loss, and it is a smaller loss than a request that
   * cannot be sent at all.
   */
  if (bytes > maxBytes) {
    working = working.map((message) => {
      const next = summarizeBulk(message);
      if (next !== message) trimmed += 1;
      return next;
    });
    bytes = sizeOf(working);
  }

  return { history: working, trimmed, dropped, bytes };
}
