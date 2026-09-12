import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/*
 * The deployed golden gate drives the real deployment through the landing page.
 * It used to find that page by the CTA's words; the copy changed to "Try
 * Quantora" and the gate went permanently red, was labelled flaky, and was
 * muted — which is how a production ESM outage stayed invisible.
 *
 * These tests keep the two ends of that contract tied together, so the failure
 * mode cannot recur silently: the landing page must keep publishing the hook,
 * and the gate must keep anchoring on it rather than on prose.
 */
test('the landing page publishes the durable Studio entry hook', () => {
  const landing = read('src/components/LandingPage.jsx');
  assert.match(landing, /data-quantora-enter-studio="true"/);
});

test('the hero Try Quantora CTA opens auth, not a guest Building animation', () => {
  const landing = read('src/components/LandingPage.jsx');
  assert.match(landing, /landing-hero__submit[\s\S]*?data-quantora-login=\{user \? undefined : 'true'\}/);
  assert.match(landing, /landing-hero__submit[\s\S]*?onClick=\{\(\) => startBuild\(\)\}/);
  assert.doesNotMatch(landing, /setGuestRun\('running'\)/);
  assert.doesNotMatch(landing, /Building…/);
});

test('the deployed golden gate anchors on that hook, never on button copy', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /\[data-quantora-enter-studio="true"\]/);
  // Strip comments first: the fix documents the old locator in prose, and the
  // ban is on executing it, not on explaining why it was wrong.
  const code = gate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /getByRole\([^)]*Studio\$/);
});

test('the desk publishes a durable hook for a terminally failed turn', () => {
  const studio = read('src/components/AiStudio.jsx');
  /*
   * The desk always knew the last turn had failed, but kept it to itself, so
   * the golden gate waited out its full 150s timeout on a turn that died in
   * seconds and then reported only that the artifact "never reached the
   * preview". That message fits a dozen causes and named none of them.
   */
  assert.match(studio, /data-quantora-last-turn-failed=/);
});

test('the failed-turn hook excludes error turns that still land an artifact', () => {
  const studio = read('src/components/AiStudio.jsx');
  /*
   * A stream can die after emitting complete fenced files; the workspace-apply
   * path deliberately lands those, so such a turn can still render and pass.
   * Publishing the bare isError would make the deployed gate abort a
   * transaction that was about to succeed. Found in review of #430.
   */
  const bound = studio.match(/data-quantora-last-turn-failed=\{([^}]*)\}/);
  assert.ok(bound, 'the shell must publish the failed-turn hook');
  const expression = bound[1];
  assert.doesNotMatch(
    expression,
    /^\s*lastTurnFailed\s*\?/,
    'the hook must not be the bare isError fact — it must exclude turns that still produce an artifact',
  );
  // The narrowing has to use the same predicate the apply path uses, or the
  // hook and the behaviour it describes can drift apart.
  assert.match(studio, /lastTurnFailedWithoutArtifact\s*=\s*lastTurnFailed\s*\n?\s*&&\s*!messageHasExtractableWorkspaceCode\(/);
});

test('the golden gate fails fast on that hook rather than on the failure copy', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /\[data-quantora-last-turn-failed="true"\]/);
  // Anchoring on the words of the failure message would repeat the exact
  // mistake that made this gate permanently red: copy changes, hooks do not.
  const code = gate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /no healthy AI route|died before Preview/);
});

test('the deterministic readiness gate stays free of browser and model calls', () => {
  const gate = read('scripts/deployed-readiness-gate.mjs');
  // Its whole value is being unambiguous: no browser, no provider spend, so a
  // failure always means the deployment is broken and is never worth muting.
  assert.doesNotMatch(gate, /playwright|chromium/i);
  assert.match(gate, /\/api\/inference-health/);
  assert.match(gate, /FUNCTION_INVOCATION_FAILED/);
});

test('every runtime-import-gate failure is a structured, actionable object', () => {
  const gate = read('scripts/runtime-import-gate.mjs');
  // The reporter prints failure.file/.line/.specifier/.why, so a failure pushed
  // as a bare string renders "undefined:undefined 'undefined'". The gate still
  // fails, but tells nobody what to fix — and an unactionable gate is one
  // someone mutes. Found by review after the default-export rule shipped
  // exactly that bug, so the shape is pinned here.
  const pushes = gate.match(/failures\.push\(\s*\{/g) || [];
  const allPushes = gate.match(/failures\.push\(/g) || [];
  assert.ok(allPushes.length >= 3, `expected several failure kinds, saw ${allPushes.length}`);
  assert.equal(pushes.length, allPushes.length, 'every failures.push must pass an object literal, never a string');
});

/*
 * The guided-intake transaction (2026-09-01). The two artifact transactions
 * never ran the platform's #1 real flow, so the intake contradiction shipped
 * unseen. The third transaction's invariant — intake question OR artifact,
 * never a dead turn — is anchored on the decision modal's durable hooks, and
 * the same hooks must keep being published by the component that renders it.
 */
test('the decision modal publishes durable hooks and the golden gate anchors on them', () => {
  const modal = read('src/components/StudioDecisionModal.jsx');
  assert.match(modal, /data-quantora-decision-modal="true"/);
  assert.match(modal, /data-quantora-decision-option=\{option\.id\}/);
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /\[data-quantora-decision-modal="true"\]/);
  assert.match(gate, /\[data-quantora-decision-option\]/);
});

/*
 * THE ROSTER (2026-09-05). Adding a fourth transaction, the run went green and
 * step 10 finished FASTER than the three-transaction runs before it — and
 * nothing in a passing log could settle whether the new transaction had run.
 * The only clue was the uploaded artifact growing, which is a guess wearing
 * evidence's clothes.
 *
 * So the golden declares what it covers, fails when a declared transaction did
 * not run, and prints the roster last on every run. This pins the declaration
 * to the transactions actually in the file: adding one without listing it, or
 * listing one that no longer exists, both stop the suite from meaning what it
 * says.
 */
test('the golden declares every transaction it runs, and runs every one it declares', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');

  const declared = (gate.match(/const EXPECTED_TRANSACTIONS = \[([^\]]*)\]/) || [])[1];
  assert.ok(declared, 'EXPECTED_TRANSACTIONS is gone — a skipped transaction would pass silently again');
  const roster = [...declared.matchAll(/'([^']+)'/g)].map((match) => match[1]);

  // markActiveTransaction(name, correlationId) — the first argument names the
  // transaction, and it is called again with the id once known, hence the set.
  const marked = new Set(
    [...gate.matchAll(/markActiveTransaction\('([^']+)'/g)].map((match) => match[1]),
  );
  assert.ok(marked.size > 0, 'no transactions found in the golden — this test is reading the wrong file');

  for (const name of marked) {
    assert.ok(roster.includes(name), `"${name}" runs but is not in EXPECTED_TRANSACTIONS, so skipping it would be silent`);
  }
  for (const name of roster) {
    assert.ok(marked.has(name), `"${name}" is declared but never runs — the roster would fail every run`);
  }

  assert.match(gate, /all \$\{ran\.length\} transactions passed/, 'a passing run must still say what it covered');
  assert.match(gate, /golden-verdict\.txt/, 'and write it where the workflow cats it, or nobody reads it');
});

/*
 * The other half of the same transaction (2026-09-04). When no modal renders,
 * the gate has to say WHY, and the only two answers are opposites: the desk
 * asked in prose, or the desk wrote a modal it could not parse. AiStudio held
 * that answer all along — readAssistantModal returns a failure — and threw it
 * away at the call site, so the verdict guessed. Both ends pinned here: the
 * desk publishes the hook, the snapshot the verdict reads still reads it.
 */
test('an unreadable decision modal is published as a hook and read by the snapshot', () => {
  const studio = read('src/components/AiStudio.jsx');
  assert.match(studio, /modalUnreadable = Boolean\(modal\.failure\)/, 'the desk must keep the parse failure');
  assert.match(studio, /data-quantora-modal-unreadable=\{modalUnreadable \? 'true' : undefined\}/);
  const snapshot = read('scripts/lib/golden-page-state.mjs');
  assert.match(snapshot, /\[data-quantora-modal-unreadable="true"\]/);
  assert.match(snapshot, /modalUnreadable:/, 'the snapshot must carry the field the verdict branches on');
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /snapshot\.modalUnreadable/, 'the verdict must branch on it, or the hook is decorative');
});

/*
 * And the REASON (2026-09-05). The boolean above shipped one night and was red
 * the next: it said the desk could not read the modal, which was the class, and
 * left the shape — a markdown fence, as it turned out — to be guessed at. The
 * parser knew all along. Three ends pinned so the answer keeps travelling.
 */
/*
 * THE PROVIDER'S OWN WORD (2026-09-05). A modal "Unterminated string" and a
 * finish_reason of MAX_TOKENS are one event seen from two sides; until the desk
 * carried the second, the verdict could only ever report the symptom. Three
 * hops pinned so the cause keeps travelling: the desk publishes what the
 * provider said, the snapshot reads it, the verdict prints it.
 */
test('the provider finish reason reaches the verdict, not only the parser symptom', () => {
  const studio = read('src/components/AiStudio.jsx');
  assert.match(studio, /data-quantora-reply-finish=/, 'the desk must publish why the model stopped');
  assert.match(studio, /data-quantora-reply-finish-reason=/, 'and the provider word itself, verbatim');
  const hook = read('src/hooks/useChatStream.js');
  assert.match(hook, /parsed\.finish \? \{ finish: parsed\.finish \}/, 'the done payload\'s finish must be kept on the message');
  const snapshot = read('scripts/lib/golden-page-state.mjs');
  assert.match(snapshot, /data-quantora-reply-finish\]/, 'the snapshot must read it');
  assert.match(snapshot, /replyFinish:/);
  assert.match(snapshot, /replyFinishReason:/);
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /snapshot\.replyFinish === 'truncated'/, 'the verdict must route on the provider word, not only the parser message');
  assert.match(gate, /The provider reported finish_reason/, 'and print it, or the cause stays a symptom');
  // "complete" is a fact, not silence. Omitting it made a finished reply and a
  // reply whose finish never arrived read identically (null), and on 2026-09-05
  // that ambiguity sent a round chasing truncation for a rewrite.
  assert.doesNotMatch(studio, /data-quantora-reply-finish=\{[^\n]*!== 'complete'/, 'a completed reply must publish "complete" by name');
  assert.match(gate, /snapshot\.replyFinish === 'complete'/, 'and the verdict must say what it means: the model ended the reply itself, so a missing tail was removed on our side');
});

/*
 * THE DESK'S OWN HAND (2026-09-05, the third round on one failure). The bytes
 * at the parse failure were the claim filter's wording, written into the modal
 * JSON. The filter now leaves machine blocks verbatim — desk-chat-claim-filter
 * .test.js holds the reproduction — and this pins the verdict, so a recurrence
 * is named as the desk's doing instead of being guessed at as truncation again.
 */
test('a modal rewritten by the claim filter is named as the desk\'s doing, not as truncation', () => {
  const filter = read('src/lib/desk-chat-claim-filter.js');
  assert.match(filter, /export function claimFilterWroteThis/, 'the filter must own the signature of its own wordings');
  assert.match(filter, /export function segmentDeskReply/, 'and skip machine blocks by segment, not by luck');
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /claimFilterWroteThis\(reason\)/, 'the verdict must test the parser window against the filter\'s wordings');
  assert.match(gate, /const truncated = !rewritten &&/, 'and a rewrite must win over the truncation guess');
  assert.match(gate, /desk-chat-claim-filter\.js/, 'naming the file that did it');
  const studio = read('src/components/AiStudio.jsx');
  assert.match(studio, /data-quantora-desk-claim-filter=\{claimFiltered \? 'true' : undefined\}/, 'the desk must publish that the filter ran');
  const snapshot = read('scripts/lib/golden-page-state.mjs');
  assert.match(snapshot, /claimFiltered: \(await count\('\[data-quantora-desk-claim-filter="true"\]'\)\) > 0/, 'and the snapshot must read it');
});

test('the parser reason reaches the verdict, not just the fact of failure', () => {
  const studio = read('src/components/AiStudio.jsx');
  assert.match(studio, /modalFailure = modal\.failure/, 'the desk must keep the reason, not only the boolean');
  assert.match(studio, /data-quantora-modal-failure=\{modalFailure \|\| undefined\}/);
  const snapshot = read('scripts/lib/golden-page-state.mjs');
  assert.match(snapshot, /data-quantora-modal-failure/, 'the snapshot must read it');
  assert.match(snapshot, /modalFailure:/);
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /snapshot\.modalFailure/, 'and the verdict must print it, or it is another silent hop');
});

/*
 * The canary handshake (2026-09-01). The chat golden failed 3/3 on PR
 * previews as a provider outage; the real cause was the canary token env
 * being scoped to Production, discovered only by reading three run logs.
 * Both ends of the one-second answer are pinned here: the health endpoint
 * must keep answering "would this deployment honor my canary?", and the
 * gate must keep asking BEFORE spending a model turn.
 */
/*
 * WHICH REPAIR (2026-09-05). The verdict told every unreadable modal to "repair
 * the reader", and for a TRUNCATED one that is the wrong file: completing a cut
 * off JSON string means inventing the rest of the user's question, which
 * assistant-modal refuses to do by design. Wrong advice in a blocking gate is
 * the §8 defect, and this is the third round this class has been guessed at.
 */
test('the verdict routes a truncated modal away from the reader', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  const routed = (gate.match(/const truncated = ([^;]+);/) || [])[1];
  assert.ok(routed, 'the truncated/malformed split is gone — every unreadable modal blames the reader again');
  assert.notEqual(routed.trim(), 'false', 'the split is hardcoded off, which is the same bug wearing a variable');
  assert.match(routed, /unterminated/i, 'and it must route on what the parser actually says');
  assert.match(gate, /NOT a reader bug/, 'a truncated modal must say plainly that the reader is the wrong place');
  assert.match(gate, /IS the reader/, 'and a malformed-but-complete one must still point at it');
});

test('the health endpoint and the golden gate keep the canary handshake', () => {
  const handler = read('api/_lib/handlers/inference-health.ts');
  assert.match(handler, /goldenCanaryHonored:\s*isGoldenCanaryRequest\(req\)/);
  assert.match(handler, /goldenCanaryConfigured:\s*Boolean\(process\.env\.QUANTORA_GOLDEN_CANARY_TOKEN\)/);
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /goldenCanaryHonored !== true/);
  assert.match(gate, /QUANTORA_GOLDEN_CANARY_TOKEN/, 'the failure message names the env var to fix');
});

/*
 * DOCUMENTS TRAVEL (2026-09-05). Four association documents were dropped in
 * the browser as "(not a readable image)" and the model asked the user how to
 * get them. Every hop is pinned: the composer sends documents, the server reads
 * the same field, the desk publishes what was read, the snapshot reads it, and
 * the golden attaches a real file and demands a fact only that file holds.
 */
test('an attached document reaches the model, and the desk says what was read', () => {
  const hook = read('src/hooks/useChatStream.js');
  assert.match(hook, /attachedDocuments,/, 'the request body must carry documents');
  assert.match(hook, /partitionAttachments\(attachments\)/, 'one decision in one place — chat-attachments.js');
  assert.match(hook, /documentReads: parsed\.attachments/, 'the done payload\'s reads must be kept on the message');
  const normalizer = read('api/_lib/communication/request-normalizer.ts');
  assert.match(normalizer, /body\?\.attachedDocuments/, 'the server must read the same field the client sends');
  const handler = read('api/_lib/chat-handler.ts');
  assert.match(handler, /readAttachedDocuments\(attachedDocuments\)/, 'documents are read once, on the server');
  assert.match(handler, /const refineUserMessage = \[\s*messageForModel,/, 'the model sees the documents on the primary path');
  assert.match(handler, /buildGeminiContents\(boundedHistory, messageForModel, visionImages\)/, 'and on the legacy path');
  // The OpenRouter tool-agent path added in #712 is the fourth completion path.
  assert.equal((handler.match(/attachments: attachmentSummary,/g) || []).length, 4, 'every done payload carries the read summary');
  const studio = read('src/components/AiStudio.jsx');
  assert.match(studio, /data-quantora-document-reads=/, 'the desk must publish what was read');
  assert.match(studio, /attachmentKindForFile\(file\)/, 'the composer classifies with the shared module, not its own rule');
  const snapshot = read('scripts/lib/golden-page-state.mjs');
  assert.match(snapshot, /documentReads:/);
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /setInputFiles\(\{ name: 'rkv-bylaws\.pdf'/, 'the golden must attach a real file through the composer');
  assert.match(gate, /const EXPECTED_TRANSACTIONS = \[[^\]]*'document-grounded'[^\]]*\]/, 'and the roster must demand it ran');
});

/*
 * THE CANARY AND THE ASK MUST AGREE (2026-09-05, PR #553's first run).
 *
 * setGoldenTransaction arms two contracts on the turn it precedes: the server
 * validator owes files, and the desk (LivePreviewCanvas) rejects any non-empty
 * VFS that is not a React/VFS project. Transaction 5 armed the canary and then
 * asked for "a single-file HTML page" — the model obeyed, and the desk failed
 * the page by construction: "Generated files did not satisfy the React/VFS
 * project runtime contract." Not the document path; the gate contradicting
 * itself. So every armed transaction's prompt must ask for the shape the
 * canary enforces, the way calculator, simple-website and business-tool do.
 */
test('every transaction that arms the golden canary asks for the artifact shape the canary enforces', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  const armed = [];
  const armPattern = /setGoldenTransaction\('([a-z-]+)'\)/g;
  let match;
  while ((match = armPattern.exec(gate)) !== null) {
    const rest = gate.slice(match.index + match[0].length);
    const fill = /prompt\.fill\('((?:[^'\\]|\\.)*)'\)/.exec(rest);
    assert.ok(fill, `transaction ${match[1]} arms the canary but never fills a prompt after it`);
    armed.push({ name: match[1], ask: fill[1] });
  }
  assert.ok(armed.length >= 4, `expected at least four armed transactions, found ${armed.length}`);
  for (const { name, ask } of armed) {
    assert.match(ask, /Return a Vite-style VFS project with package\.json, src\/main\.jsx, src\/App\.jsx, and src\/styles\.css/,
      `transaction ${name} arms the canary but asks for a different artifact shape — the desk will reject whatever the model builds`);
    assert.match(ask, /do not return index\.html/, `transaction ${name} must forbid the single-file shape the canary cannot run`);
  }
  const canvas = read('src/components/LivePreviewCanvas.jsx');
  assert.match(canvas, /goldenTransaction && Object\.keys\(vfs \|\| \{\}\)\.length > 0 && !projectRuntimeActive/,
    'the desk-side contract this test exists to agree with');
});

/*
 * THE ENGINE ANSWERS FOR ITSELF (2026-09-05). Two preview deployments failed
 * their first transaction four hours apart, once as "no healthy AI route" and
 * once as a silent turn, and the verdict could not say whether the only engine
 * a preview has had answered at all. The golden now runs the live Gemini probe
 * before the first turn and carries the outcome in the verdict's state digest;
 * the health handler lets the golden canary read that probe.
 */
test('the golden verdict names the engine\'s live state, and the canary may ask for it', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /\/api\/inference-health\?probe=gemini/, 'the golden must run the live probe');
  assert.match(gate, /engine=ok\(/, 'a healthy engine is named');
  assert.match(gate, /engine=FAILED\(/, 'a dead engine is named with its status and reason');
  assert.match(gate, /engineDigest,\n\s*\]\.filter\(Boolean\)\.join\(' '\)/, 'the digest is part of the failure verdict, not only the evidence JSON');
  assert.match(gate, /engineProbe,\n\s*plannedTransactions: PLANNED_TRANSACTIONS,\n\s*transactions: \[\]/, 'and the evidence carries the whole report, and what this run planned');
  /*
   * WHEN A REFUSAL IS FATAL (2026-09-06). The first version stopped on any
   * 401/403/429 — right for a preview, whose only engine is Gemini, and blind
   * on production, which plans OpenRouter behind it: five minutes after a
   * production run proved three transactions on the fallback while Gemini
   * answered "403: Spend cap breached", the next run stopped at engine-probe
   * and proved nothing. The decision lives in one pure function the gate
   * calls, and it reads the health snapshot's own words — a key that exists
   * and is refused is not a fallback, and neither is a key the planner
   * offers no route on.
   */
  assert.match(gate, /import \{ engineRefusalStopsRun \} from '\.\/lib\/golden-engine-refusal\.mjs'/, 'the gate delegates the stop decision to the pure helper');
  assert.match(gate, /const refusal = engineRefusalStopsRun\(engineProbe, health\);\n\s*evidence\.engineRefusal = refusal;\n\s*if \(refusal\.stop\) \{\n(?:\s*\/\/[^\n]*\n)*\s*throw new Error\(`\$\{refusal\.reason\} /, 'a fatal refusal stops the run before the first turn with its reason first in the message, and the decision rides in the evidence');
  assert.match(gate, /engineDigest = `\$\{engineDigest\} fallback=\$\{refusal\.fallback\}`/, 'a run that continues on the fallback says so in the verdict\'s state digest');
  const refusalRule = read('scripts/lib/golden-engine-refusal.mjs');
  assert.match(refusalRule, /REFUSAL_STATUSES = Object\.freeze\(\[401, 403, 429\]\)/, 'a refusal is a credential-level status; anything less ambiguous does not stop the run');
  assert.match(refusalRule, /health\?\.openRouterConfigured === true\n\s*&& health\?\.openRouterCredentialRefused !== true\n\s*&& Number\(health\?\.routeCount\) > 1/, 'the fallback must be present, not refused, and planned as a route');
  assert.match(gate, /try \{\n(?:\s*\/\*[\s\S]*?\*\/\n)?(?:\s*\/\/[^\n]*\n)*\s*evidence\.activeTransaction = \{ name: 'engine-probe', correlationId: null \};\n\s*const refusal = engineRefusalStopsRun/, 'the refusal is thrown INSIDE the try, so the verdict line and evidence are still written (§8)');
  const handler = read('api/_lib/handlers/inference-health.ts');
  const probeBranch = handler.slice(handler.indexOf("=== 'gemini'"), handler.indexOf('probe: \'gemini\''));
  assert.match(probeBranch, /if \(!isGoldenCanaryRequest\(req\)\) \{\s*const failure = await authenticateAdminRequest\(req\)/, 'the canary reads the probe; everyone else still needs admin');
});

/*
 * A PULL REQUEST PLANS TWO, PRODUCTION PLANS FIVE (2026-09-06). Two thirds of
 * the month's Gemini bill belonged to the key the PR previews use: about
 * seventy golden runs in fifteen hours, five build-size turns each. The plan
 * is a prefix of the roster, printed and carried in the evidence, and the
 * roster check holds the run to exactly what it planned.
 */
test('a pull request golden plans two transactions, a production golden five, and the run is held to its plan', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  const workflow = read('.github/workflows/deployed-golden-transactions.yml');
  assert.match(
    workflow,
    /QUANTORA_GOLDEN_TRANSACTION_LIMIT: \$\{\{ contains\(github\.event\.pull_request\.title, '\[golden:all\]'\) && '99' \|\| '2' \}\}/,
    'two transactions everywhere, and the whole roster only on a pull request titled [golden:all]',
  );
  /*
   * PRODUCTION PLANS TWO AS WELL (2026-09-07). It planned all eight, which at
   * the measured cost of a build is SGD 0.60 a deployment — and fifteen
   * deployments in one day spent SGD 9 against a prepaid Gemini balance of SGD
   * 29 that has to last a fortnight AND carry real users. A gate the platform
   * cannot afford to run is one somebody switches off entirely.
   *
   * Nothing about LIVENESS is sampled: deployed-readiness-gate.mjs still runs
   * on every deployment, blocking, and costs nothing — a plain fetch. It is the
   * gate that catches a function dying before its handler runs, the class that
   * took three API endpoints down on 2026-08-31. What is sampled is BEHAVIOUR.
   */
  assert.doesNotMatch(
    workflow,
    /QUANTORA_GOLDEN_TRANSACTION_LIMIT:[^\n]*\|\| '99' \}\}/,
    "a production deployment must not fall back to the whole roster: that is SGD 0.60 a deployment, "
      + 'and the platform is on a prepaid balance measured in weeks',
  );
  assert.match(
    workflow,
    /node scripts\/deployed-readiness-gate\.mjs/,
    'the free, blocking liveness gate still runs on every deployment — sampling behaviour must never sample liveness',
  );
  /*
   * AND SUPERSEDED PRODUCTION GOLDENS ARE CANCELLED. `deployment.id` is unique
   * per deployment, so keying the group on it opened a fresh group every time
   * and cancel-in-progress had nothing to cancel — the same defect this file
   * already records for pull requests, left in place on the deployment half.
   * A golden still running against a deployment that is no longer live is
   * answering a question nobody has, on the platform's own model credit.
   */
  assert.doesNotMatch(
    workflow,
    /group: deployed-golden-[^\n]*deployment\.id/,
    'the concurrency group must not be keyed on the deployment id, or nothing is ever superseded',
  );
  assert.match(
    workflow,
    /group: deployed-golden-\$\{\{ github\.event\.pull_request\.number \|\| github\.event\.deployment\.environment \}\}/,
    'production goldens share a group per environment, so a newer deployment supersedes an older run',
  );
  /*
   * AND NOT ONCE PER PUSH (2026-09-07). The limit above was the INSTANCE fix
   * for the bill described in this block's header. The CLASS stayed open,
   * because capping what a run costs says nothing about how many runs there
   * are — and the next day the same shape returned at the same size: 66
   * successful pull_request runs across six PRs in one day, about eleven per
   * PR, because `synchronize` fires on every push and a working session pushes
   * constantly. That is 132 build-size turns on the platform's own credit,
   * against 120 from the fifteen production deployments this gate is for.
   *
   * Nothing is muted: the full roster still runs on every Production
   * deployment_status. What is gone is the re-run on each intermediate commit
   * of a branch nobody has finished.
   */
  assert.doesNotMatch(
    workflow,
    /types: \[[^\]]*synchronize/,
    'the golden must not re-run on every push to a pull request: every trigger spends real model credit, '
      + 'and the Production deployment_status trigger already covers the finished change',
  );
  assert.match(gate, /planGoldenTransactions\(\n\s*EXPECTED_TRANSACTIONS,\n\s*process\.env\.QUANTORA_GOLDEN_TRANSACTION_LIMIT,\n\s*\)/, 'the gate plans from the roster and the variable');
  for (const position of [2, 3, 4, 5]) {
    assert.match(gate, new RegExp(`if \\(runs\\(${position}\\)\\) \\{`), `transaction ${position} runs only when planned`);
  }
  assert.match(gate, /const missing = PLANNED_TRANSACTIONS\.filter\(\(name\) => !ran\.includes\(name\)\);/, 'the roster check holds the run to its plan');
  assert.match(gate, /Transactions planned: \$\{PLANNED_TRANSACTIONS\.join/, 'and the plan is printed before the first turn');
  const plan = read('scripts/lib/golden-plan.mjs');
  assert.match(plan, /parsed >= 1 \? Math\.min\(all\.length, Math\.floor\(parsed\)\) : all\.length/, 'anything but a positive number means the whole roster');
});
test('the deployed golden refuses success when the Coding artifact write was rejected', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  const start = gate.indexOf('  const rejectedCodingWrites =');
  const end = gate.indexOf('  evidence.completedAt =', start);
  assert.ok(start >= 0 && end > start, 'the persistence assertion must run before the success verdict');
  const check = new Function('rejectedCodingWriteCount', gate.slice(start, end));
  assert.throws(() => check(1), /Coding artifact persistence rejected/);
  assert.doesNotThrow(() => check(0));
});

test('the deployed golden retains an early rejected Coding write after its diagnostic buffer rolls over', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  const capture = gate.slice(gate.indexOf('let activeTransactionName ='), gate.indexOf('function lastApiFailure('));
  const verdictStart = gate.indexOf('  const rejectedCodingWrites =');
  const verdict = gate.slice(verdictStart, gate.indexOf('  evidence.completedAt =', verdictStart));
  const check = new Function('responses', `
    const BASE_ORIGIN = 'https://gate.invalid';
    const page = { on: (_event, listener) => responses.forEach(listener) };
    ${capture}
    ${verdict}
  `);
  const response = (path, status) => ({ url: () => `https://gate.invalid${path}`, status: () => status, text: async () => '{}' });
  assert.throws(() => check([
    response('/api/qir-runs', 400),
    ...Array.from({ length: 45 }, () => response('/api/projects', 503)),
  ]), /Coding artifact persistence rejected/);
});
