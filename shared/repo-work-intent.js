/*
 * Does this message ask for work on the code that is already open?
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * The first reading of the measurement below was wrong, and recording that is
 * more useful than the fix, because it is the easy mistake to make here.
 *
 * `shouldRefineRunningDesk` hears 2 of 28 ordinary developer requests with a
 * repository open on the desk. That number is real. It does NOT mean the desk
 * failed to treat those requests as coding work: `turnBelongsToBuild` answers
 * yes to any message once the desk holds files, so `buildMode` on the request
 * was never wrong. Reading the first number as "the platform cannot hear a
 * developer" would have been a claim about one function mistaken for a claim
 * about the product -- measured on the composite, the turn was always a coding
 * turn.
 *
 * WHAT THE DEAFNESS ACTUALLY COSTS
 *
 * `refineDesk` is the signal that says this turn CHANGES CODE THAT ALREADY
 * EXISTS, rather than asking for something new. It sets the turn's studio mode,
 * rides on the request as `refineMode`, reaches model resolution, and sets the
 * repair flag. Measured on the same desk with the same files:
 *
 *   "make the header blue"                studioMode build, refineMode true
 *   "add a test for the retry path"       studioMode ASK,   refineMode ABSENT
 *
 * The same desk, the same files, one turn described as a change and the other
 * as a fresh ask -- separated only by whether the person phrased it as a
 * product or as a repository.
 *
 * WHY THE VOCABULARY MISSED IT
 *
 * Every intent signal here was written for somebody who wants software MADE.
 * `detectBuildIntent` needs a build verb and a product noun; the desk's
 * retention check needs an edit verb and a noun from a list of UI parts --
 * button, layout, header, colour. That is right for the person it was written
 * for, and it is not the vocabulary of somebody working on a repository they
 * already have, whose nouns are tests, endpoints and migrations.
 *
 * The two that did pass are worth more than the twenty-six misses, because they
 * are what a number built on the wrong reason looks like: "migrate the users
 * TABLE" matched the UI-parts list on an HTML table, and "can you fix THEM"
 * matched the rule for iterating on a preview.
 *
 * WHY IT IS ITS OWN DOOR AND NOT A WIDER LIST IN THE OLD ONE
 *
 * `shouldKeepWorkspaceForPrompt` also decides retention for presentations,
 * spreadsheets and documents. Teaching it the word `test` or `migration` would
 * reach every one of those surfaces. This vocabulary is only ever consulted
 * where code is open, so a mistake in it cannot change what a spreadsheet turn
 * does.
 *
 * THE FAILURE THIS MUST NOT TRADE FOR
 *
 * The travel desk learned this the expensive way: recall bought by loosening a
 * parser shows up as an invention. Here the invention is a WRITE. Reading a
 * question about the code as an instruction to change it means files move while
 * someone was only asking. So a change verb alone is never enough: the message
 * must also name something that lives in a repository, and anything shaped like
 * a question is refused outright, however many code words it contains.
 *
 * `src/lib/repo-work-comprehension.test.js` holds both numbers and the floors.
 */

/*
 * A question is a question however technical it is. "Why does the handler
 * throw?" names a handler and asks for an explanation, and answering it by
 * rewriting the handler is the one mistake here that costs someone their work.
 *
 * `can you explain` is spelled out rather than a bare `can you`, because "can
 * you fix the failing tests" is a request, not a question. That distinction is
 * inherited from the existing rule in workspace-intent.js and matters more
 * here, where the consequence of getting it wrong is a write.
 */
const QUESTION_ONLY = /^(how|what|why|when|where|which|who|should|could|would|is|are|was|were|does|do|did|can you explain|explain|tell me|help me understand|any idea|thoughts on)\b/i;

/*
 * The same refusal for a question that does not START with its question word.
 * "Just wondering, should I add a test for the parser?" opens with neither, and
 * every other signal in it says edit the repository -- a prefix check alone
 * reads it as an instruction and writes a file on somebody thinking aloud.
 *
 * Only consulted when the message actually ends in a question mark, and the
 * list deliberately excludes polite request openers: "can you fix the failing
 * tests?" is a request wearing a question mark, and refusing it would cost
 * exactly the recall this door exists to provide.
 */
const QUESTION_ANYWHERE = /\b(why|how|what|which|who|where|when|whether|should i|should we|do you think|is it (?:safe|ok|okay|worth|better)|are we|do i need)\b/i;

/*
 * Asking to change something. Deliberately generous, because it is the NOUN
 * that carries precision here -- every one of these verbs is ordinary English
 * that appears constantly outside a repository, and none of them fires alone.
 */
const CHANGE_VERB = new RegExp(
  '\\b('
  + 'add|added|adding|fix|fixed|fixing|remove|delete|drop|rename|refactor|extract|inline'
  + '|move|update|upgrade|bump|downgrade|pin|revert|implement|wire|handle|guard|validate'
  + '|migrate|port|patch|write|rewrite|replace|split|document|cover|simplify|dedupe'
  + '|deduplicate|expose|install|uninstall|disable|enable|silence|cache|paginate|refine'
  + '|change|edit|modify|convert|swap|introduce|extend|clean up|tidy|roll back|hook up'
  + '|optimise|optimize|annotate|throw|catch|stub|mock|parameterise|parameterize'
  + ')\\b',
  'i',
);

/*
 * Something that lives in a repository.
 *
 * Every word here had to survive one question: does it also mean something else
 * on another desk? `table` did not -- it is an HTML table, a spreadsheet table
 * and a database table, and it is the word that produced one of the two
 * accidental passes above. `flag`, `model`, `view`, `store` and `template` went
 * the same way: each is a code word and each is also a word a shop, a finance
 * desk or a presentation uses. `build` is left out for a different reason -- it
 * is the build VERB the older signal already owns, and claiming it here would
 * put two rules on one word.
 */
const CODE_NOUN = new RegExp(
  '\\b('
  + 'tests?|specs?|test suite|unit tests?|assertions?|fixtures?|snapshots?|coverage'
  + '|functions?|methods?|classes|class|interfaces?|enums?|constants?|variables?'
  + '|modules?|imports?|exports?|dependency|dependencies|packages?|lockfile|lock file'
  + '|endpoints?|routes?|router|handlers?|controllers?|middleware|hooks?|helpers?'
  + '|configs?|schemas?|migrations?|queries|query|readme|changelog|docstrings?'
  + '|comments?|lint|linter|eslint|prettier|typecheck|types?|typings?|regexe?s?'
  + '|ci|pipelines?|workflows?|branch|branches|commits?|pull requests?|prs?|pr'
  + '|merge conflicts?|stack traces?|tracebacks?|exceptions?|bugs?|regressions?'
  + '|null checks?|edge cases?|race conditions?|memory leaks?|typos?'
  + '|apis?|sdks?|cli|scripts?|workers?|cron|secrets?|env vars?|environment variables?'
  + '|repo|repos|repository|codebase|error handling|validation|parser|serialiser|serializer'
  + '|reducers?|selectors?|components?|props?|state|callbacks?|promises?|async'
  // What a developer calls the things that go wrong across a network. Left out
  // of the first cut, which is why "handle the 429 from the provider with a
  // backoff" was the last miss standing: `provider` is a finance and travel
  // word too, and these are not.
  + '|retry|retries|backoff|back-off|timeouts?|rate limits?|status codes?|4\\d\\d|5\\d\\d'
  + ')\\b',
  'i',
);

/*
 * Naming a file is naming something in the repository, and it is the strongest
 * signal available -- nobody types `auth.ts` about anything else. The extension
 * list is what the desk can actually hold, plus the config and doc files that
 * sit beside them.
 */
const FILE_PATH = /(^|[\s"'`([])[\w.-]*[\w-][./][\w./-]*\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|c|cc|cpp|h|hpp|cs|swift|kt|kts|sql|json|ya?ml|toml|ini|env|md|mdx|css|scss|less|html|sh|bash|zsh|dockerfile|lock)\b/i
  // A bare filename with no directory is just as strong: `auth.ts`, `App.jsx`.
  ;
const BARE_FILE = /\b[\w-]+\.(ts|tsx|jsx|mjs|cjs|py|go|rs|java|rb|php|cpp|hpp|cs|swift|kts|sql|ya?ml|toml|scss|less|sh|bash|zsh|mdx)\b/i;

/*
 * A symbol as a developer writes one: in backticks, or with call parentheses.
 * Bare camelCase is deliberately NOT here -- product names, brands and ordinary
 * capitalised words would all qualify, which is how a travel parser once
 * offered hotels in "Sarah".
 */
const CODE_SYMBOL = /`[^`\n]+`|\b[A-Za-z_$][\w$]*\s*\(\s*\)/;

/*
 * Git and review work on an open repository. These are complete asks on their
 * own -- "open a PR", "commit this", "push to main" name no code noun and are
 * unambiguously work on the repository rather than conversation about it.
 */
const REPO_ACTION = /\b(open (?:a |the )?(?:pr|pull request)|raise (?:a |the )?(?:pr|pull request)|commit (?:this|these|it|them|the changes)|push (?:this|these|it|them|to|the)|stage (?:this|these|the changes)|create (?:a |the )?branch|check ?out (?:a |the )?branch|rebase|cherry-?pick|stash|git (?:add|commit|push|pull|status|diff|log|merge|rebase))\b/i;

/*
 * An Office artifact is not a repository, and it is the one surface this door
 * can reach that the advisor-domain guard does not cover. "Add a slide about
 * our API strategy" carries a change verb and a code noun and is a deck edit,
 * so the artifact noun settles it before the code noun is ever consulted.
 *
 * `document` must be the NOUN. Written as a bare word it also swallowed
 * "document the exported functions", which is the imperative verb and ordinary
 * repository work -- the same one-word-two-meanings mistake as the `table` that
 * produced an accidental pass above, caught here by the corpus rather than in
 * production.
 */
const OFFICE_ARTIFACT = /\b(slides?|deck|presentation|spreadsheet|workbook|worksheet|documents|(?:the|this|that|a|my|our|your)\s+document|\.docx?|pptx?|xlsx?|paragraph|bullet points?)\b/i;

/**
 * True when this message asks for a change to the code that is open.
 *
 * Callers must only consult it where code is actually open -- it answers
 * "is this repository work?", never "is there a repository?".
 *
 * @param {string} text the person's message
 * @returns {boolean}
 */
export function asksForRepositoryWork(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;
  if (QUESTION_ONLY.test(t)) return false;
  if (t.endsWith('?') && QUESTION_ANYWHERE.test(t)) return false;
  if (OFFICE_ARTIFACT.test(t)) return false;
  if (REPO_ACTION.test(t)) return true;
  if (!CHANGE_VERB.test(t)) return false;
  return CODE_NOUN.test(t) || FILE_PATH.test(t) || BARE_FILE.test(t) || CODE_SYMBOL.test(t);
}
