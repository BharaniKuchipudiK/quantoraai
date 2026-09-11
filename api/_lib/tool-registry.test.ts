import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  budgetedFetch,
  classifyGithubToolResult,
  classifyTravelToolResult,
  classifyVercelToolResult,
  dispatchToolCall,
  enabledToolDeclarations,
  findRegisteredTool,
  isToolCallPermitted,
  listRegisteredTools,
  type QuantoraToolContext,
} from "./tool-registry.js";

/**
 * ---------------------------------------------------------------------------
 * THE GATE FOR THE TOOL FABRIC.
 *
 * Every gate this repository has asks whether something can be REACHED. This
 * one asks whether the three answers a turn gives about a tool AGREE:
 *
 *   what the model is offered   (enabledToolDeclarations)
 *   what the guard will permit  (isToolCallPermitted)
 *   what the dispatcher will run (dispatchToolCall)
 *
 * They were three separate `if`s in chat-handler.ts reading two hand-kept lists
 * and two booleans, so disagreeing was a matter of forgetting one edit. A
 * disagreement is not a crash: the model is handed a tool, calls it, and is
 * told "Blocked unexpected tool call this turn" — which it explains to the user
 * in words the platform never wrote. That is the same failure as search_hotels
 * promising photos, and it is what this file exists to make impossible.
 * ---------------------------------------------------------------------------
 */

const CONTEXTS: Array<{ label: string; context: QuantoraToolContext }> = [
  { label: "no studio, no connections", context: {} },
  { label: "travel studio", context: { studioDomain: "travel" } },
  { label: "travel studio, travel revoked late", context: { studioDomain: "travel", travelToolsPermitted: false } },
  { label: "github connected", context: { githubPrincipal: { token: "t", login: "octocat" } as any } },
  {
    label: "travel studio and github connected",
    context: { studioDomain: "travel", githubPrincipal: { token: "t", login: "octocat" } as any },
  },
  { label: "coding studio", context: { studioDomain: "coding" } },
];

/** Let queued abort listeners run before asserting on what they did. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const offeredNames = (context: QuantoraToolContext) =>
  enabledToolDeclarations(context)
    .flatMap((group) => group.functionDeclarations)
    .map((declaration) => String(declaration.name));

test("the registry is not empty", () => {
  // Per §4: a parse or a registry that finds nothing must fail rather than
  // report a clean run over zero tools.
  assert.ok(listRegisteredTools().length > 0, "a registry with no tools would pass every check below");
});

test("what the model is offered is exactly what the guard permits", () => {
  for (const { label, context } of CONTEXTS) {
    const offered = new Set(offeredNames(context));
    for (const tool of listRegisteredTools()) {
      assert.equal(
        isToolCallPermitted(tool.name, context),
        offered.has(tool.name),
        `${label}: ${tool.name} is ${offered.has(tool.name) ? "offered but would be blocked" : "not offered but would be permitted"}`,
      );
    }
  }
});

test("a tool is never offered twice in one turn", () => {
  for (const { label, context } of CONTEXTS) {
    const offered = offeredNames(context);
    assert.equal(new Set(offered).size, offered.length, `${label}: a name is declared in two groups`);
  }
});

test("declarations are grouped by family, and no group is empty", () => {
  // An empty group is a `tools: [{ functionDeclarations: [] }]` on the wire,
  // which some providers reject outright and none can use.
  for (const { label, context } of CONTEXTS) {
    for (const group of enabledToolDeclarations(context)) {
      assert.ok(group.functionDeclarations.length > 0, `${label}: an empty declaration group was sent`);
      const families = new Set(
        group.functionDeclarations.map((declaration) => findRegisteredTool(declaration.name)?.family),
      );
      assert.equal(families.size, 1, `${label}: one group mixes families`);
    }
  }
});

test("every offered tool declares a name and a description the model can act on", () => {
  // A tool description is a promise the model passes on. An empty one is a
  // promise of nothing, and the model fills the gap itself.
  for (const tool of listRegisteredTools()) {
    assert.ok(tool.name.length > 0, "a tool with no name cannot be called");
    assert.equal(String(tool.declaration.name), tool.name, `${tool.name}: declaration name disagrees with registry key`);
    assert.ok(
      String(tool.declaration.description || "").trim().length > 20,
      `${tool.name}: has no usable description`,
    );
  }
});

test("an unregistered name is refused as unregistered, not guessed at by a family", async () => {
  /*
   * The specific harm: before the registry, an unknown name reached the travel
   * executor, whose switch answered "Unknown or disabled travel tool: <name>".
   * A GitHub question answered with a sentence about travel is a wrong fact the
   * model hands the user.
   */
  const dispatch = await dispatchToolCall("no_such_tool", {}, { studioDomain: "travel" });
  assert.equal(dispatch.status, "unknown-tool");
  assert.equal(isToolCallPermitted("no_such_tool", { studioDomain: "travel" }), false);
  assert.equal(findRegisteredTool("no_such_tool"), null);
  assert.equal(findRegisteredTool(undefined), null);
  assert.equal(findRegisteredTool(42), null);
});

test("travel tools are offered only to the travel domain, and only while permitted", () => {
  const travel = listRegisteredTools().filter((tool) => tool.family === "travel").map((tool) => tool.name);
  assert.ok(travel.length > 0, "the travel family vanished from the registry");
  assert.deepEqual(offeredNames({ studioDomain: "travel" }).sort(), [...travel].sort());
  assert.deepEqual(offeredNames({ studioDomain: "coding" }), []);
  // The handler can revoke travel after the domain said yes — no route survived
  // planning, the turn deferred tools, no Gemini key. The registry must obey it.
  assert.deepEqual(offeredNames({ studioDomain: "travel", travelToolsPermitted: false }), []);
});

test("github tools are offered only to a connected account", () => {
  const github = listRegisteredTools().filter((tool) => tool.family === "github").map((tool) => tool.name);
  assert.ok(github.length > 0, "the github family vanished from the registry");
  assert.deepEqual(offeredNames({ githubPrincipal: { token: "t" } as any }).sort(), [...github].sort());
  assert.deepEqual(offeredNames({ githubPrincipal: null }), []);
  assert.deepEqual(offeredNames({}), []);
});

test("no transactional travel capability is offered to the model", () => {
  // The declarations are the surface that reaches the user's model. A booking
  // tool must not be one, whatever the executor would do with it.
  const offered = new Set(offeredNames({ studioDomain: "travel" }));
  for (const name of ["create_price_alert", "make_reservation", "book_attraction"]) {
    assert.equal(offered.has(name), false, `${name} must not be declared while transactions are disabled`);
  }
});

/* ------------------------------------------------------------------ *
 * The migration promise: user-visible behaviour is unchanged.
 * ------------------------------------------------------------------ */

test("the classifiers reproduce the states the handler used to send", () => {
  /*
   * These are the exact branches chat-handler.ts had before the migration, and
   * they are asserted against the REAL exported functions. An earlier draft of
   * this test stubbed the executor and compared the registry's mapping to a
   * copy of itself; removing \`&& !stream.committed\` from the registry did not
   * fail it. Read that failure, not a grep for FAILED (§8).
   */
  const uncommitted = { committed: false };
  const committed = { committed: true };

  // PAUSE_AND_ASK that wants an automatic retry turn — 'cleared', but only
  // while a retry is still possible. Once the response has started it cannot
  // be replayed, so the same result must ask the user instead.
  const retryable = { action: "PAUSE_AND_ASK", autoRetryTurn: true, retryable: true };
  assert.equal(classifyTravelToolResult(retryable, uncommitted), "cleared");
  assert.equal(classifyTravelToolResult(retryable, committed), "waiting_for_user");

  assert.equal(classifyTravelToolResult({ action: "PAUSE_AND_ASK", status: "unavailable" }, uncommitted), "unavailable");
  assert.equal(classifyTravelToolResult({ action: "PAUSE_AND_ASK", message: "Which city?" }, uncommitted), "waiting_for_user");
  // autoRetryTurn without retryable is not a retry.
  assert.equal(classifyTravelToolResult({ action: "PAUSE_AND_ASK", autoRetryTurn: true }, uncommitted), "waiting_for_user");

  assert.equal(classifyTravelToolResult({ status: "success", hotels: [] }, uncommitted), "cleared");
  assert.equal(classifyTravelToolResult({ status: "unavailable", reason: "PROVIDER_ERROR" }, uncommitted), "unavailable");

  assert.equal(classifyGithubToolResult({ ok: true, status: "read" }), "cleared");
  assert.equal(classifyGithubToolResult({ ok: false, status: "not_connected" }), "unavailable");
  assert.equal(classifyGithubToolResult(undefined), "unavailable");
});

test("a real dispatch carries its family's classifier, not a default", async () => {
  /*
   * The classifiers above are only worth testing if the invocations actually
   * use them, and an invocation the test builds itself proves nothing. These
   * two calls go through the real executors and reach no network:
   * ask_clarifying_question is a pure travel tool, and the GitHub executor
   * refuses a null principal before it opens a connection.
   */
  const ask = await dispatchToolCall("ask_clarifying_question", { question: "Which city?" }, { studioDomain: "travel" });
  assert.equal(ask.status, "ok");
  if (ask.status !== "ok") return;
  assert.equal(ask.invocation.family, "travel");
  assert.equal(ask.invocation.raw?.action, "PAUSE_AND_ASK");
  assert.equal(ask.invocation.classify({ committed: false }), "waiting_for_user");

  const gh = await dispatchToolCall("list_issues", { owner: "o", repo: "r" }, { githubPrincipal: null });
  assert.equal(gh.status, "ok");
  if (gh.status !== "ok") return;
  assert.equal(gh.invocation.family, "github");
  assert.equal(gh.invocation.raw?.ok, false);
  assert.equal(gh.invocation.classify({ committed: false }), "unavailable");
});

/* ------------------------------------------------------------------ *
 * A tool that never returns must not take the turn down with it.
 * ------------------------------------------------------------------ */

test("every tool declares a budget and an expiry its own classifier can read", () => {
  /*
   * The expiry result is shaped like the family's ordinary results so the
   * handler needs no special case for it. That only holds if each family
   * actually shapes one — a family that returns `{}` here would be classified
   * 'cleared', and the model would be handed an empty success and describe a
   * pull request it never read.
   */
  for (const tool of listRegisteredTools()) {
    assert.ok(tool.budgetMs > 0, `${tool.name}: no time budget`);
    assert.ok(tool.budgetMs <= 60_000, `${tool.name}: a budget longer than a minute is not a budget`);
    const expired = tool.expired("it did not finish in time");
    const state = tool.family === "github"
      ? classifyGithubToolResult(expired)
      : tool.family === "vercel"
        ? classifyVercelToolResult(expired)
        : classifyTravelToolResult(expired, { committed: false });
    assert.equal(state, "unavailable", `${tool.name}: an expired call does not read as unavailable`);
    const words = JSON.stringify(expired);
    assert.match(words, /did not finish in time/, `${tool.name}: the expiry does not say what happened`);
    // The model repeats this to the user, so it must forbid the invention that
    // an empty result invites — the search_hotels lesson.
    assert.match(words, /do not (invent|describe)/i, `${tool.name}: the expiry does not tell the model what NOT to do`);
  }
});

test("a tool that never returns is stopped, and the model is told", async () => {
  const tool = listRegisteredTools()[0];
  const original = (tool as any).execute;
  (tool as any).execute = () => new Promise(() => { /* never settles */ });
  try {
    const started = Date.now();
    const dispatch = await dispatchToolCall(tool.name, {}, { toolDeadlineAt: Date.now() + 60 });
    const elapsed = Date.now() - started;
    assert.equal(dispatch.status, "ok");
    if (dispatch.status !== "ok") return;
    assert.ok(elapsed < 5_000, `the dispatch hung for ${elapsed}ms instead of giving up`);
    assert.equal(dispatch.invocation.classify({ committed: false }), "unavailable");
    assert.match(JSON.stringify(dispatch.invocation.raw), /did not finish within/);
  } finally {
    (tool as any).execute = original;
  }
});

test("a turn with no tool time left refuses without calling the executor", async () => {
  // The call that would cross the line is the one that kills the function, so
  // it must not start. Measured by an executor that records being entered.
  const tool = listRegisteredTools()[0];
  const original = (tool as any).execute;
  let entered = false;
  (tool as any).execute = async () => { entered = true; return { family: tool.family, raw: {}, classify: () => "cleared" as any }; };
  try {
    const dispatch = await dispatchToolCall(tool.name, {}, { toolDeadlineAt: Date.now() - 1 });
    assert.equal(entered, false, "the executor ran after the turn's tool time was spent");
    assert.equal(dispatch.status, "ok");
    if (dispatch.status !== "ok") return;
    assert.equal(dispatch.invocation.classify({ committed: false }), "unavailable");
    assert.match(JSON.stringify(dispatch.invocation.raw), /already spent/);
  } finally {
    (tool as any).execute = original;
  }
});

test("the budget actually CANCELS the provider request, it does not merely stop waiting", async () => {
  /*
   * Racing a promise leaves the work running. A raced-out GitHub read would go
   * on burning the function's clock while the turn moved past it, so the budget
   * would bound the WAIT and not the COST. Both families take an injectable
   * fetch and pass an init.signal through, so the budget's signal is merged
   * into theirs — this measures that the merged signal really fires, and with
   * it that AbortSignal.any is present on the runtime (§10).
   */
  const controller = new AbortController();
  let sawAbort = false;
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = (_url: any, init: any) =>
    new Promise((resolve) => {
      init.signal.addEventListener("abort", () => { sawAbort = true; resolve({ ok: false } as any); }, { once: true });
    });
  try {
    void budgetedFetch(controller.signal)("https://example.test", { signal: AbortSignal.timeout(60_000) });
    controller.abort();
    // Bounded, so an unmerged signal fails by NAME rather than by hanging the
    // suite until the runner gives up on it (§8 — an unactionable gate is one
    // the next person mutes).
    await settle();
    assert.equal(sawAbort, true, "the provider request was left running after the budget expired");
  } finally {
    (globalThis as any).fetch = realFetch;
  }

  // And with no signal of its own, the request still dies with the budget.
  const bare = new AbortController();
  let bareAbort = false;
  (globalThis as any).fetch = (_url: any, init: any) =>
    new Promise((resolve) => {
      init.signal.addEventListener("abort", () => { bareAbort = true; resolve({ ok: false } as any); }, { once: true });
    });
  try {
    void budgetedFetch(bare.signal)("https://example.test");
    bare.abort();
    await settle();
    assert.equal(bareAbort, true, "a request with no signal of its own was not given the budget's");
  } finally {
    (globalThis as any).fetch = realFetch;
  }
});

test("the turn's tool budget fits inside the function that carries the turn", async () => {
  /*
   * The budget is a promise about a clock the platform does not own. If
   * pipeline.ts's maxDuration were lowered under it, the budget would expire
   * after the function had already been killed — a limit that can never fire,
   * which is the §4 case.
   */
  const handler = await readFile(new URL("./chat-handler.ts", import.meta.url), "utf8");
  const budget = Number(/TOOL_TIME_BUDGET_MS = ([0-9_]+)/.exec(handler)?.[1]?.replace(/_/g, ""));
  assert.ok(budget > 0, "the handler no longer states a tool time budget");
  const vercel = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url), "utf8"));
  const maxDurationMs = Number(vercel.functions?.["api/pipeline.ts"]?.maxDuration) * 1000;
  assert.ok(maxDurationMs > 0, "api/pipeline.ts no longer declares a maxDuration to fit inside");
  assert.ok(
    budget < maxDurationMs,
    `the tool budget (${budget}ms) is not shorter than the function that carries it (${maxDurationMs}ms)`,
  );
});

/* ------------------------------------------------------------------ *
 * The boundary only counts if the handler actually goes through it.
 * ------------------------------------------------------------------ */

const HANDLER = readFileSync(path.join(import.meta.dirname, "chat-handler.ts"), "utf8");
const HANDLER_CODE = HANDLER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the handler asks the registry rather than forking on family", () => {
  for (const asked of ["enabledToolDeclarations(", "isToolCallPermitted(", "dispatchToolCall("]) {
    assert.ok(HANDLER_CODE.includes(asked), `the handler must reach tools through ${asked}`);
  }
  /*
   * The three forks this phase removed. Each is a family name appearing in the
   * handler's own logic, which is precisely what makes adding a fourth family a
   * three-file edit — and one of the three the place it gets forgotten.
   */
  for (const fork of [
    "isGithubToolName",
    "executeGithubToolCall",
    "githubFunctionDeclarations",
    "travelFunctionDeclarations",
    "executeToolCall(",
  ]) {
    assert.ok(
      !HANDLER_CODE.includes(fork),
      `${fork} is back in chat-handler.ts — the handler is choosing an executor by family again`,
    );
  }
});

test("the dispatch site forwards every per-call input the executors need", () => {
  /*
   * A CONTEXT FIELD DROPPED AT THE BOUNDARY IS THE DEFECT THIS WHOLE PHASE IS
   * ABOUT, and the first draft of the migration committed it: the old travel
   * call passed turnAttempt and the new dispatch did not. Nothing caught it —
   * lint, build and 3381 tests all passed — because losing it does not throw.
   * It removes the flight lookup's stop condition, so a dead provider is
   * retried on every turn instead of once.
   *
   * These two are per-CALL, so they cannot live in activeToolContext, which is
   * built once per turn. That is exactly why they are the ones a refactor
   * forgets.
   */
  const call = HANDLER.slice(HANDLER.indexOf("await dispatchToolCall("));
  const args = call.slice(0, call.indexOf("});") + 3);
  for (const field of ["recentUserTexts", "turnAttempt"]) {
    assert.ok(args.includes(field), `the dispatch site no longer forwards ${field}`);
  }
});

test("adding a family costs nothing in the stream opener", () => {
  /*
   * The measurable form of "adding a capability must not require adding another
   * independent agent loop". openGeminiStream used to take one boolean PER
   * FAMILY — travelToolsEnabled, githubToolsEnabled — so a third family meant a
   * third parameter threaded from the request down through every call site, and
   * a call site that forgot it silently offered nothing.
   *
   * It now takes one QuantoraToolContext. This reads the actual parameter list
   * rather than the whole file, so a family name surviving elsewhere in the
   * handler (a persona string, a comment) does not make this pass or fail for
   * the wrong reason.
   */
  const opener = HANDLER.slice(HANDLER.indexOf("async function openGeminiStream(input: {"));
  const parameters = opener.slice(0, opener.indexOf("}) {"));
  assert.ok(parameters.includes("toolContext: QuantoraToolContext"), "the opener must take the registry's context");
  for (const family of new Set(listRegisteredTools().map((tool) => tool.family))) {
    assert.doesNotMatch(
      parameters,
      new RegExp(`\\b${family}Tools`, "i"),
      `openGeminiStream still takes a per-family flag for ${family}`,
    );
  }
});
