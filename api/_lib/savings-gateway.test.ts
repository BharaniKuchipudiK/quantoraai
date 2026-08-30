import assert from "node:assert/strict";
import test from "node:test";

const { handleSavingsGoal } = await import("./savings-gateway.js");

function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

// A matched intent legitimately sets CORS headers before the data check, so this
// stub allows headers but still throws if the gateway WRITES a response — which
// is what "consumed the turn" means.
function headersOnlyRes() {
  const guard = () => { throw new Error("res must not be written on a fall-through turn"); };
  return { setHeader: () => {}, getHeader: () => undefined, writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

test("does not intercept a non-finance domain (isolation)", async () => {
  const handled = await handleSavingsGoal(
    { method: "POST", body: { studioDomain: "education", message: "save $20,000 in 3 years, $400/month" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept ordinary finance conversation", async () => {
  const handled = await handleSavingsGoal(
    { method: "POST", body: { studioDomain: "finance", message: "what's my portfolio doing this year?" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept a non-POST request", async () => {
  const handled = await handleSavingsGoal(
    { method: "GET", body: { studioDomain: "finance", message: "save $20,000 in 3 years, $400/month" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("defers a 'what if …' scenario to the advisor, even with a save/month figure", async () => {
  // "save SGD 3,000/month" would otherwise read 3,000 as the goal here; the
  // scenario opener means it belongs to the advisor's what-if, so this declines
  // before it ever touches the response.
  const handled = await handleSavingsGoal(
    { method: "POST", body: { studioDomain: "finance", message: "what if I save SGD 3,000/month and retire in 25 years" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("a savings-shaped question WITHOUT numbers falls through to the model", async () => {
  // The trigger is the bare word "save", so these all matched and used to be
  // answered with a canned demand for three numbers — streamed as the assistant,
  // with the model never called. Rephrasing kept the trigger, so there was no way
  // out. untouchableRes() throws if the gateway writes, proving it stays silent.
  for (const message of [
    "how can I save on taxes?",
    "should I save or invest right now?",
    "help me start saving, I don't know where to begin",
  ]) {
    const handled = await handleSavingsGoal(
      { method: "POST", body: { studioDomain: "finance", message } },
      headersOnlyRes(),
    );
    assert.equal(handled, false, `must fall through: ${message}`);
  }
});

function capturingRes() {
  const chunks: string[] = [];
  return {
    writeHead() {}, setHeader() {},
    write(chunk: string) { chunks.push(chunk); },
    end() {}, status() { return this; }, json() { return this; },
    text() {
      return chunks
        .map((c) => { try { return JSON.parse(c.replace(/^data: /, "").trim())?.text; } catch { return null; } })
        .filter(Boolean).join("");
    },
  };
}

const MONTH_YEAR = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/;

/*
 * The point of the program: a duration is a calculation, a date is a
 * commitment. A plan that only ever says "in 36 months" is something the
 * reader forgets by evening.
 */
test("a reachable goal comes back as a dated program, not just a duration", async () => {
  const res = capturingRes();
  const handled = await handleSavingsGoal(
    { method: "POST", body: { studioDomain: "finance", message: "I want to save $20,000 in 36 months, $400/month" }, headers: {} },
    res,
  );
  assert.equal(handled, true);
  const text = res.text();
  assert.match(text, /Your finish line/, "the program must be attached to the plan");
  assert.match(text, MONTH_YEAR, "the finish line must name a real month");
  assert.match(text, /On the way/, "the markers must survive to the reply");
  assert.match(text, /deterministic projection/, "the plan itself is not replaced");
});

/*
 * Degrading honestly matters more here than anywhere: a pace that never
 * arrives has no date, and the desk must say so rather than print one.
 */
test("an unreachable pace keeps the plan and invents no finish date", async () => {
  const res = capturingRes();
  const handled = await handleSavingsGoal(
    { method: "POST", body: { studioDomain: "finance", message: "I want to save $500,000 in 12 months, I have $0 and can put away $1/month" }, headers: {} },
    res,
  );
  assert.equal(handled, true);
  const text = res.text();
  assert.match(text, /doesn't reach the goal/i, "the honest answer stays");
  assert.doesNotMatch(text, /Your finish line/, "no finish line without one to name");
  assert.doesNotMatch(text, MONTH_YEAR, "no date invented for a goal that is never reached");
});
