import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRepositoryPermission,
  assertRepositoryWithinDeploymentBoundary,
  connectStateMatches,
  mintConnectState,
  openGithubToken,
  permissionRefusalMessage,
  permissionSatisfies,
  repositoryPermissionFromPayload,
  resolveGithubSealSecret,
  sealGithubToken,
} from "./github-principal.js";

const SECRET = "quantora-test-secret-must-be-at-least-32-chars";

test("a sealed token round-trips and is unreadable without the key", () => {
  const sealed = sealGithubToken("gho_realtoken", SECRET);
  assert.notEqual(sealed, "gho_realtoken");
  assert.ok(!sealed.includes("gho_realtoken"), "ciphertext must not contain the plaintext");
  assert.equal(openGithubToken(sealed, SECRET), "gho_realtoken");
  assert.equal(openGithubToken(sealed, `${SECRET}-different`), null);
});

test("a tampered sealed token opens to nothing rather than to garbage", () => {
  const sealed = sealGithubToken("gho_realtoken", SECRET);
  const parts = sealed.split(".");
  const flipped = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3].slice(0, -2)}AA`;
  assert.equal(openGithubToken(flipped, SECRET), null);
  assert.equal(openGithubToken("not-even-sealed", SECRET), null);
  assert.equal(openGithubToken("", SECRET), null);
});

test("a short seal secret is refused, because a cheap key is no key", () => {
  assert.equal(resolveGithubSealSecret({ GITHUB_CONNECTION_SECRET: "short" } as NodeJS.ProcessEnv), null);
  assert.equal(resolveGithubSealSecret({} as NodeJS.ProcessEnv), null);
  assert.equal(resolveGithubSealSecret({ GITHUB_CONNECTION_SECRET: SECRET } as NodeJS.ProcessEnv), SECRET);
});

test("connect state binds to one Quantora subject and no other", () => {
  const state = mintConnectState("github:1234", SECRET);
  assert.ok(connectStateMatches(state, "github:1234", SECRET));
  // The attack this closes: an attacker's authorization completing inside a
  // victim's session, grafting the attacker's GitHub token onto their account.
  assert.equal(connectStateMatches(state, "github:9999", SECRET), false);
  assert.equal(connectStateMatches(state, "github:1234", `${SECRET}x`), false);
  assert.equal(connectStateMatches("garbage", "github:1234", SECRET), false);
  assert.equal(connectStateMatches("", "github:1234", SECRET), false);
});

test("repository permission is read from GitHub's answer and defaults to none", () => {
  // The shape that matters most: no permissions block at all must not be a pass.
  const absent = repositoryPermissionFromPayload({ name: "widget", owner: { login: "acme" } });
  assert.equal(absent.level, "none");
  assert.equal(absent.canRead, false);
  assert.equal(absent.canWrite, false);

  assert.equal(repositoryPermissionFromPayload({ permissions: {} }).level, "none");
  assert.equal(repositoryPermissionFromPayload({ permissions: { pull: true } }).level, "read");
  assert.equal(repositoryPermissionFromPayload({ permissions: { pull: true, triage: true } }).level, "triage");
  assert.equal(repositoryPermissionFromPayload({ permissions: { pull: true, push: true } }).level, "write");
  assert.equal(repositoryPermissionFromPayload({ permissions: { push: true, maintain: true } }).level, "maintain");
  assert.equal(repositoryPermissionFromPayload({ permissions: { push: true, admin: true } }).level, "admin");

  // A string "true" is not true. Loose coercion here would be an auth bypass.
  assert.equal(repositoryPermissionFromPayload({ permissions: { push: "true" } }).canWrite, false);
  assert.equal(repositoryPermissionFromPayload(null).level, "none");
});

test("write needs push access, and an archived repository is writable by no one", () => {
  const writable = repositoryPermissionFromPayload({ permissions: { pull: true, push: true } });
  assert.equal(permissionSatisfies(writable, "read"), true);
  assert.equal(permissionSatisfies(writable, "write"), true);
  assert.equal(permissionSatisfies(writable, "admin"), false);

  const readOnly = repositoryPermissionFromPayload({ permissions: { pull: true } });
  assert.equal(permissionSatisfies(readOnly, "read"), true);
  assert.equal(permissionSatisfies(readOnly, "write"), false);

  const archived = repositoryPermissionFromPayload({ permissions: { pull: true, push: true }, archived: true });
  assert.equal(permissionSatisfies(archived, "write"), false);
  assert.match(permissionRefusalMessage("acme", "widget", archived, "write"), /archived/i);
});

test("a refusal names the access held and does not blame the user's GitHub account for a Quantora limit", () => {
  const readOnly = repositoryPermissionFromPayload({ permissions: { pull: true } });
  const message = permissionRefusalMessage("acme", "widget", readOnly, "write");
  assert.match(message, /read access/);
  assert.match(message, /acme\/widget/);
  assert.match(message, /cannot exceed your own permissions/);

  const none = repositoryPermissionFromPayload({});
  assert.match(permissionRefusalMessage("acme", "widget", none, "read"), /cannot see/);
});

test("assertRepositoryPermission asks GitHub and throws on refusal", async () => {
  const principal = { userSub: "u", login: "octo", token: "gho_x", scopes: [], connectedAt: "" };
  const respond = (status: number, body: unknown) => async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });

  const granted = await assertRepositoryPermission({
    principal,
    owner: "acme",
    repo: "widget",
    need: "write",
    fetchImpl: respond(200, { name: "widget", owner: { login: "acme" }, default_branch: "trunk", permissions: { pull: true, push: true } }),
  });
  assert.equal(granted.level, "write");
  assert.equal(granted.defaultBranch, "trunk");

  await assert.rejects(
    () => assertRepositoryPermission({
      principal, owner: "acme", repo: "widget", need: "write",
      fetchImpl: respond(200, { permissions: { pull: true } }),
    }),
    /not enough to write to/,
  );

  await assert.rejects(
    () => assertRepositoryPermission({
      principal, owner: "acme", repo: "widget", need: "read",
      fetchImpl: respond(404, { message: "Not Found" }),
    }),
    /not visible to your connected GitHub account/,
  );

  await assert.rejects(
    () => assertRepositoryPermission({
      principal, owner: "acme", repo: "widget", need: "read",
      fetchImpl: respond(401, { message: "Bad credentials" }),
    }),
    /Reconnect your GitHub account/,
  );

  // A 500 from GitHub is not permission to proceed.
  await assert.rejects(
    () => assertRepositoryPermission({
      principal, owner: "acme", repo: "widget", need: "read",
      fetchImpl: respond(500, { message: "boom" }),
    }),
    /could not confirm your access/,
  );

  await assert.rejects(
    () => assertRepositoryPermission({
      principal: { ...principal, token: "" }, owner: "acme", repo: "widget", need: "read",
      fetchImpl: respond(200, {}),
    }),
    /Connect your GitHub account/,
  );
});

test("the deployment allowlist is an optional narrowing, not the authorization", () => {
  // Unset means no deployment-level restriction now that no shared credential
  // writes. The user's own GitHub permissions are the boundary that matters.
  assert.doesNotThrow(() => assertRepositoryWithinDeploymentBoundary("acme", "widget", {} as NodeJS.ProcessEnv));
  assert.doesNotThrow(() => assertRepositoryWithinDeploymentBoundary("Acme", "Widget", {
    GITHUB_ALLOWED_REPOS: "acme/widget, other/repo",
  } as NodeJS.ProcessEnv));
  assert.throws(
    () => assertRepositoryWithinDeploymentBoundary("acme", "widget", {
      GITHUB_ALLOWED_REPOS: "other/repo",
    } as NodeJS.ProcessEnv),
    /restricted to specific repositories/,
  );
});
