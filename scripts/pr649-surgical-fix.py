from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


def insert_before_once(path: str, marker: str, addition: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(marker)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one insertion marker, found {count}: {marker!r}")
    file.write_text(text.replace(marker, addition + marker, 1))


# 1) Preserve governed existing-file patches without weakening fresh-build
# runnable validation. Coding Desk owns currentVfs; the server does not.
path = "api/_lib/build-artifact-contract.ts"
replace_once(
    path,
    "const NATIVE_PATH = /\\.(swift|kt|kts|java|m|mm|cs)$/i;\n\n/**\n * Server and Coding Desk must agree",
    "const NATIVE_PATH = /\\.(swift|kt|kts|java|m|mm|cs)$/i;\n\n"
    "const SEARCH_REPLACE_PATCH = /(?:^|\\n)\\s*<<<<\\s*\\r?\\n[\\s\\S]*?\\r?\\n\\s*====\\s*\\r?\\n[\\s\\S]*?\\r?\\n\\s*>>>>(?:\\s*$|\\s*\\n)/;\n\n"
    "function hasExistingFilePatchArtifact(source: string) {\n"
    "  return fencedFiles(source).some((file) => (\n"
    "    Boolean(file.path)\n"
    "    && !NATIVE_PATH.test(file.path)\n"
    "    && SEARCH_REPLACE_PATCH.test(file.content)\n"
    "  ));\n"
    "}\n\n"
    "/**\n * Server and Coding Desk must agree",
)
replace_once(
    path,
    "  if (isHtmlDocument(source)) return true;\n  const parsed = parseVFSWithReport(source, {});",
    "  if (isHtmlDocument(source)) return true;\n"
    "  // Existing-file refinements are applied by Coding Desk against currentVfs.\n"
    "  // The server intentionally has no copy of that VFS, so parsing the patch\n"
    "  // against {} would erase a valid edit and falsely report no runnable entry.\n"
    "  // Keep fresh-file validation strict; only the explicit governed patch syntax\n"
    "  // gets deferred to the browser that owns the current workspace state.\n"
    "  if (hasExistingFilePatchArtifact(source)) return true;\n"
    "  const parsed = parseVFSWithReport(source, {});",
)

# 2) Count artifact repairs separately from transport/provider attempts.
path = "src/lib/turn-recovery.js"
replace_once(
    path,
    "  maxAttempts = MAX_TURN_ATTEMPTS,\n  status = 0,",
    "  maxAttempts = MAX_TURN_ATTEMPTS,\n"
    "  /** Number of BUILD_ARTIFACT_CONTRACT repairs already started for this turn. */\n"
    "  artifactRepairCount = 0,\n"
    "  status = 0,",
)
replace_once(
    path,
    "  // A build artifact gets exactly ONE automatic repair after the initial\n"
    "  // generation. Dynamic turn budgets may fund more transport attempts, but they\n"
    "  // must not turn one behavioral miss into a chain of identical paid rebuilds.\n"
    "  if (code === 'BUILD_ARTIFACT_CONTRACT') {\n"
    "    if (Number(attempt) >= 2) return no('build-repair-exhausted');",
    "  // A build artifact gets exactly ONE automatic repair per turn. Count\n"
    "  // behavioral repairs independently from transport/provider attempts: a dead\n"
    "  // route before the first artifact must not consume the one repair opportunity.\n"
    "  if (code === 'BUILD_ARTIFACT_CONTRACT') {\n"
    "    if (Number(artifactRepairCount) >= 1) return no('build-repair-exhausted');",
)

path = "src/hooks/useChatStream.js"
replace_once(
    path,
    "    const spentEngineIds = new Set();\n    let retryBrief = '';",
    "    const spentEngineIds = new Set();\n"
    "    let retryBrief = '';\n"
    "    let artifactRepairCount = 0;",
)
replace_once(
    path,
    "    const applyRecoveryRepairs = (recovery) => {\n      qirFail(",
    "    const applyRecoveryRepairs = (recovery) => {\n"
    "      if (recovery.reason === 'build-contract') artifactRepairCount += 1;\n"
    "      qirFail(",
)
replace_once(
    path,
    "              attempt,\n              maxAttempts: escalation.maxAttempts,\n              status: res.status,",
    "              attempt,\n"
    "              maxAttempts: escalation.maxAttempts,\n"
    "              artifactRepairCount,\n"
    "              status: res.status,",
)
replace_once(
    path,
    "              attempt,\n              maxAttempts: escalation.maxAttempts,\n              code: streamedError?.code,",
    "              attempt,\n"
    "              maxAttempts: escalation.maxAttempts,\n"
    "              artifactRepairCount,\n"
    "              code: streamedError?.code,",
)

# 3) Keep trace diagnosis factual and keep the provider-success regression honest.
replace_once(
    "shared/trace-story.js",
    "It does not prove a provider timeout, crash, or refusal.'",
    "It does not prove that the provider timed out, crashed, or refused the request.'",
)

# Regression: an existing-file CSS patch can preserve an already-runnable VFS,
# while the existing CSS-only fresh-build test remains red.
path = "api/_lib/coding-desk-runnable-contract-regression.test.ts"
replace_once(
    path,
    "function browserEntryFor(reply: string): string | null {\n  const parsed = parseVFSWithReport(reply, {});",
    "function browserEntryFor(reply: string, currentVfs: Record<string, string> = {}): string | null {\n"
    "  const parsed = parseVFSWithReport(reply, currentVfs);",
)
insert_before_once(
    path,
    "test('a self-contained HTML page is runnable on both sides', () => {",
    "test('[was-red] an existing-file patch is not mistaken for a fresh non-runnable reply', () => {\n"
    "  const currentVfs = {\n"
    "    'index.html': '<!DOCTYPE html><html><head><link rel=\"stylesheet\" href=\"styles.css\"></head><body>Works</body></html>',\n"
    "    'styles.css': 'body { color: black; }',\n"
    "  };\n"
    "  const reply = '```css filepath=\"styles.css\"\\n<<<<\\nbody { color: black; }\\n====\\nbody { color: navy; }\\n>>>>\\n```';\n\n"
    "  assert.equal(browserEntryFor(reply, currentVfs), 'index.html', 'Coding Desk applies the patch to its existing runnable VFS');\n"
    "  assert.equal(hasBrowserPreviewArtifact(reply), true, 'server preserves governed patches it cannot apply without currentVfs');\n"
    "  assert.deepEqual(validateBuildArtifactResponse(reply, null), {\n"
    "    ok: true,\n"
    "    detailCode: 'build-artifact-valid',\n"
    "  });\n"
    "});\n\n",
)

# Regression: route attempts and artifact repairs are different dimensions, and
# the live chat loop passes the dedicated count at both recovery boundaries.
path = "src/lib/coding-desk-artifact-repair-cap.test.js"
replace_once(
    path,
    "import assert from 'node:assert/strict';\nimport test from 'node:test';",
    "import assert from 'node:assert/strict';\n"
    "import fs from 'node:fs';\n"
    "import test from 'node:test';",
)
replace_once(
    path,
    "    attempt: 2,\n    maxAttempts: 6,\n    code: 'BUILD_ARTIFACT_CONTRACT',\n"
    "    failureDetail: 'the repaired reply still had no runnable page',",
    "    attempt: 2,\n"
    "    maxAttempts: 6,\n"
    "    artifactRepairCount: 1,\n"
    "    code: 'BUILD_ARTIFACT_CONTRACT',\n"
    "    failureDetail: 'the repaired reply still had no runnable page',",
)
insert_before_once(
    path,
    "test('artifact repair cap does not remove transport failover', () => {",
    "test('[was-red] a transport attempt does not consume the one artifact repair', () => {\n"
    "  const afterTransport = resolveTurnRecovery({\n"
    "    attempt: 2,\n"
    "    maxAttempts: 6,\n"
    "    artifactRepairCount: 0,\n"
    "    code: 'BUILD_ARTIFACT_CONTRACT',\n"
    "    failureDetail: 'the first model that answered produced no runnable page',\n"
    "  });\n"
    "  assert.equal(afterTransport.retry, true);\n"
    "  assert.equal(afterTransport.switchModel, false);\n"
    "  assert.equal(afterTransport.reason, 'build-contract');\n\n"
    "  const afterArtifactRepair = resolveTurnRecovery({\n"
    "    attempt: 3,\n"
    "    maxAttempts: 6,\n"
    "    artifactRepairCount: 1,\n"
    "    code: 'BUILD_ARTIFACT_CONTRACT',\n"
    "    failureDetail: 'the one repaired artifact still had no runnable page',\n"
    "  });\n"
    "  assert.equal(afterArtifactRepair.retry, false);\n"
    "  assert.equal(afterArtifactRepair.reason, 'build-repair-exhausted');\n"
    "});\n\n"
    "test('chat loop wires the artifact repair count independently from attempt number', () => {\n"
    "  const source = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');\n"
    "  assert.match(source, /let artifactRepairCount = 0;/);\n"
    "  assert.match(source, /recovery\\.reason === 'build-contract'\\) artifactRepairCount \\+= 1/);\n"
    "  const passes = source.match(/\\n\\s+artifactRepairCount,\\n/g) || [];\n"
    "  assert.ok(passes.length >= 2, 'both recovery decisions receive the dedicated count');\n"
    "});\n\n",
)

print("PR #649 surgical source patches applied successfully")
