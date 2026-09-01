import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * The chat feed must stay cheap while someone is typing.
 *
 * AiStudio renders the whole conversation from one 790-line block. It is wrapped
 * in React.useMemo, and that memo is the only thing standing between a keystroke
 * and re-rendering every message in the thread. Nothing enforced it: adding
 * inputText to the dependency array, or adding a dependency that is rebuilt on
 * every render, silently restores the cost and no test notices.
 *
 * This is a guard on work already done (#421), not a new capability. It exists
 * because the expensive property here is invisible — the feed looks identical
 * either way, and the only symptom is that typing feels heavy in a long thread.
 */

const source = fs.readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');

/** The props AiStudio accepts, so a dependency can be followed to its parent. */
function propsOfAiStudio() {
  const match = source.match(/export default function AiStudio\(\{([\s\S]*?)\}\)/);
  assert.ok(match, 'could not read AiStudio props');
  return match[1].split(',').map((p) => p.split(':')[0].trim()).filter(Boolean);
}

/** The dependency array of the `renderedChatFeed` memo, as written. */
function chatFeedDeps() {
  const start = source.indexOf('const renderedChatFeed');
  assert.notEqual(start, -1, 'renderedChatFeed memo is missing — the chat feed is no longer memoised');
  // The memo closes with `}, [ ... ]);` — take the first such array after it.
  const tail = source.slice(start);
  const match = tail.match(/\}\s*,\s*\[([\s\S]*?)\]\s*\)\s*;/);
  assert.ok(match, 'could not read the renderedChatFeed dependency array');
  return match[1].split(',').map((d) => d.trim()).filter(Boolean);
}

test('the chat feed is memoised at all', () => {
  assert.match(source, /const renderedChatFeed = React\.useMemo\(/);
});

test('typing does not invalidate the chat feed', () => {
  /*
   * inputText changes on every keystroke. If it ever becomes a dependency of
   * this memo — directly, or via a value derived from it — every message in the
   * thread re-renders per character typed.
   */
  const deps = chatFeedDeps();
  assert.equal(deps.includes('inputText'), false, 'inputText must never be a chat-feed dependency');
  for (const dep of deps) {
    assert.doesNotMatch(dep, /^inputText/, `"${dep}" is derived from the draft text`);
  }
});

test('every function passed to the chat feed has a stable identity', () => {
  /*
   * A dependency rebuilt on each render defeats the memo completely: the feed
   * recomputes every time AiStudio renders, which is what the memo exists to
   * prevent. Handlers reach the feed through chatFeedHandlersRef +
   * useCallback([], …) precisely so their identity never changes.
   */
  const deps = chatFeedDeps();
  const handlerDeps = deps.filter((d) => /^(feed|handle|update|fork|on)[A-Z]/.test(d));
  assert.ok(handlerDeps.length >= 3, `expected the feed to take handlers, saw ${handlerDeps.length}`);

  for (const dep of handlerDeps) {
    const declared = new RegExp(`const\\s+${dep}\\s*=\\s*useCallback`).test(source);
    const fromHook = new RegExp(`^\\s*${dep},\\s*$`, 'm').test(source); // destructured from a hook
    if (declared || fromHook) continue;

    /*
     * A dependency can also arrive as a PROP, in which case its stability is
     * the parent's to keep and this file cannot see it. Follow it there rather
     * than exempting it: onOpenAuth was exactly this case — a plain arrow in
     * App.jsx, rebuilt on every App render, quietly invalidating the memo.
     */
    assert.ok(propsOfAiStudio().includes(dep), `"${dep}" is neither declared here nor a prop — cannot judge its stability`);
    const app = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    const passed = app.match(new RegExp(`${dep}=\\{([A-Za-z_$][\\w$]*)\\}`));
    assert.ok(passed, `"${dep}" must be passed a named value in App.jsx, never an inline arrow`);
    assert.match(
      app,
      new RegExp(`const ${passed[1]} = useCallback\\(`),
      `App.jsx must keep ${passed[1]} (passed as ${dep}) a useCallback — a plain function here silently defeats the chat-feed memo`,
    );
  }
});

test('the feed handlers keep their permanent identity through the handler ref', () => {
  // useCallback(..., []) over a ref is what makes these stable for the life of
  // the component; deps on those callbacks would reintroduce churn.
  assert.match(source, /const chatFeedHandlersRef = useRef\(/);
  for (const name of ['feedOpenCanvasWithCode', 'feedHandleSendMessage', 'feedCommitStudySyllabusChip']) {
    const re = new RegExp(`const ${name} = useCallback\\([^;]*chatFeedHandlersRef\\.current[^;]*,\\s*\\[\\]\\s*\\)`);
    assert.match(source, re, `${name} must stay a useCallback(..., []) over the handler ref`);
  }
});
