from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one guarded match, found {count}")
    file.write_text(text.replace(old, new, 1))


# Terminal success is a terminal event. It must use the same awaited durable
# trace writer already used by refusals and failures.
replace_once(
    "api/_lib/chat-handler.ts",
    "      trace({\n        correlationId,\n        boundary: 'api.chat',\n        state: 'succeeded',\n",
    "      await traceFinal({\n        correlationId,\n        boundary: 'api.chat',\n        state: 'succeeded',\n",
)

# Artifact repair count is behavioral state, independent of transport attempts.
replace_once(
    "src/hooks/useChatStream.js",
    "    let retryBrief = '';\n",
    "    let retryBrief = '';\n    let artifactRepairCount = 0;\n",
)
replace_once(
    "src/hooks/useChatStream.js",
    "      if (recovery.retryBrief) retryBrief = recovery.retryBrief;\n",
    "      if (recovery.reason === 'build-contract') artifactRepairCount += 1;\n      if (recovery.retryBrief) retryBrief = recovery.retryBrief;\n",
)

hook = Path("src/hooks/useChatStream.js")
text = hook.read_text()
pattern = re.compile(r"(?m)^(\s*)maxAttempts: escalation\.maxAttempts,\n")
matches = list(pattern.finditer(text))
if len(matches) != 4:
    raise SystemExit(f"useChatStream.js: expected 4 recovery call sites, found {len(matches)}")
text = pattern.sub(
    lambda m: f"{m.group(1)}maxAttempts: escalation.maxAttempts,\n{m.group(1)}artifactRepairCount,\n",
    text,
)
hook.write_text(text)

# Strengthen the existing structural gate: every terminal api.chat path,
# including ordinary success, must be awaited.
trace_test = Path("api/_lib/transaction-trace.test.ts")
text = trace_test.read_text()
old_comment = (
    "Scoped to the four sites where the handler answers and returns: the two\n"
    "   * rate-limit refusals, the budget refusal, and the terminal catch."
)
new_comment = (
    "Scoped to every terminal site where the handler answers and returns: the two\n"
    "   * rate-limit refusals, the budget refusal, normal success, and the terminal catch."
)
if text.count(old_comment) != 1:
    raise SystemExit("transaction-trace.test.ts: terminal-site comment drifted")
text = text.replace(old_comment, new_comment, 1)
old_assert = (
    "assert.equal(awaited.length, 4,\n"
    "    `expected 4 awaited terminal traces (two rate-limit refusals, the budget refusal, the catch), found ${awaited.length}`);"
)
new_assert = """assert.equal(awaited.length, 5,
    `expected 5 awaited terminal traces (two rate-limit refusals, the budget refusal, success, the catch), found ${awaited.length}`);

  assert.match(handler, /await traceFinal\\(\\{[\\s\\S]{0,800}?boundary: 'api\\.chat',\\s*state: 'succeeded'/,
    'normal success must durably record api.chat succeeded');
  assert.doesNotMatch(handler, /trace\\(\\{[\\s\\S]{0,800}?boundary: 'api\\.chat',\\s*state: 'succeeded'/,
    'normal success must never regress to fire-and-forget tracing');"""
if text.count(old_assert) != 1:
    raise SystemExit("transaction-trace.test.ts: awaited terminal assertion drifted")
trace_test.write_text(text.replace(old_assert, new_assert, 1))

# Mixed-failure regression plus a source-wiring guard on every recovery decision.
Path("src/lib/execution-spine-recovery-wiring.test.js").write_text(
    """import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { resolveTurnRecovery } from './turn-recovery.js';

test('[was-red] transport attempts do not consume the single artifact repair', () => {
  const route = resolveTurnRecovery({
    attempt: 1,
    maxAttempts: 4,
    artifactRepairCount: 0,
    status: 503,
    retryable: true,
    fallbackEngineName: 'Fallback',
  });
  assert.equal(route.retry, true);
  assert.equal(route.reason, 'route');

  const firstArtifactMiss = resolveTurnRecovery({
    attempt: 2,
    maxAttempts: 4,
    artifactRepairCount: 0,
    code: 'BUILD_ARTIFACT_CONTRACT',
  });
  assert.equal(firstArtifactMiss.retry, true,
    'the artifact still gets its one repair after transport failover');
  assert.equal(firstArtifactMiss.reason, 'build-contract');

  const secondArtifactMiss = resolveTurnRecovery({
    attempt: 3,
    maxAttempts: 4,
    artifactRepairCount: 1,
    code: 'BUILD_ARTIFACT_CONTRACT',
  });
  assert.equal(secondArtifactMiss.retry, false);
  assert.equal(secondArtifactMiss.reason, 'build-repair-exhausted');
});

test('[wiring] every chat-stream recovery decision receives artifact repair state', () => {
  const source = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  assert.match(source, /let artifactRepairCount = 0;/);
  assert.equal((source.match(/artifactRepairCount \\+= 1/g) || []).length, 1,
    'artifact repair count advances in exactly one recovery-apply seam');

  const decisions = [...source.matchAll(/resolveTurnRecovery\\(\\{([\\s\\S]*?)\\n\\s*\\}\\);/g)];
  assert.equal(decisions.length, 4,
    'all four recovery decision sites must remain visible to this gate');
  for (const decision of decisions) {
    assert.match(decision[1], /artifactRepairCount,/,
      'every recovery decision must receive artifactRepairCount');
  }
});
"""
)
