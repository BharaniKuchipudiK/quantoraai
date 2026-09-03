/**
 * What a checkout takes, and what it admits it left behind.
 *
 * A partial tree that looks complete is the failure mode here, and it is
 * silent: the model reasons about a codebase with holes and cannot tell, and
 * neither can the user. So the properties under test are not "does it fetch
 * files" but "does it drop the right ones, and does it say so".
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKOUT_MAX_FILES,
  describeCheckoutOmissions,
  selectCheckoutFiles,
} from "./github-checkout.js";

const blob = (path: string, size = 100) => ({ path, type: "blob", size, sha: `sha-${path}` });

test("generated and vendored directories are left behind", () => {
  const { take } = selectCheckoutFiles([
    blob("src/app.js"),
    blob("node_modules/react/index.js"),
    blob("dist/bundle.js"),
    blob("coverage/lcov.info"),
    blob(".git/config"),
    blob("vendor/lib.php"),
  ]);

  assert.deepEqual(take.map((entry) => entry.path), ["src/app.js"]);
});

test("a directory that merely starts with a skipped name is kept", () => {
  // "distribution/" and "building/" are ordinary source directories. A prefix
  // match rather than a path-segment match would silently drop them, and the
  // user would never be told those files exist.
  const { take } = selectCheckoutFiles([
    blob("distribution/plan.md"),
    blob("building/list.json"),
    blob("src/dist-helper.js"),
  ]);

  assert.equal(take.length, 3);
});

test("lockfiles are dropped, and the reason says they are regenerated", () => {
  const { take, omitted } = selectCheckoutFiles([
    blob("package.json"),
    blob("package-lock.json", 900_000),
    blob("yarn.lock", 400_000),
  ]);

  assert.deepEqual(take.map((entry) => entry.path), ["package.json"]);
  const lockNote = omitted.find((entry) => entry.reason.includes("lockfiles"));
  assert.equal(lockNote?.count, 2);
  assert.match(lockNote!.reason, /regenerated/, "a person needs to know nothing was lost");
});

test("binaries the desk cannot edit are dropped and counted", () => {
  const { take, omitted } = selectCheckoutFiles([
    blob("src/app.js"),
    blob("public/logo.png"),
    blob("public/font.woff2"),
    blob("archive.zip"),
  ]);

  assert.deepEqual(take.map((entry) => entry.path), ["src/app.js"]);
  assert.equal(omitted.find((entry) => entry.reason.includes("not text"))?.count, 3);
});

test("dotfiles and extensionless project files are taken, not treated as binary", () => {
  const { take } = selectCheckoutFiles([
    blob("Dockerfile"),
    blob("Makefile"),
    blob(".gitignore"),
    blob("README"),
    blob("LICENSE"),
  ]);

  assert.equal(take.length, 5, "these are the files that explain how a project runs");
});

test("a file larger than the per-file cap is dropped rather than truncated", () => {
  const { take, omitted } = selectCheckoutFiles([
    blob("src/small.js", 1_000),
    blob("src/huge.js", 5_000_000),
  ]);

  assert.deepEqual(take.map((entry) => entry.path), ["src/small.js"]);
  assert.match(omitted.find((entry) => entry.reason.includes("larger than"))!.reason, /KB each/);
  // Half a file is worse than no file: the model cannot see where it was cut.
});

test("the file budget is enforced and what it cost is reported", () => {
  const many = Array.from({ length: CHECKOUT_MAX_FILES + 25 }, (_, index) => blob(`src/file-${index}.js`));
  const { take, omitted, treeFileCount } = selectCheckoutFiles(many);

  assert.equal(take.length, CHECKOUT_MAX_FILES);
  assert.equal(treeFileCount, CHECKOUT_MAX_FILES + 25);
  assert.equal(omitted.find((entry) => entry.reason.startsWith("beyond this checkout's budget"))?.count, 25);
});

test("the byte budget stops the checkout before the file count does", () => {
  // Twenty files of 512KB each is 10MB — over the 6MB total but under 400 files.
  const heavy = Array.from({ length: 20 }, (_, index) => blob(`src/big-${index}.js`, 512 * 1024));
  const { take, omitted } = selectCheckoutFiles(heavy);

  assert.ok(take.length < 20, "the byte budget has to bite before the file count");
  assert.ok(omitted.some((entry) => entry.reason.startsWith("beyond this checkout's budget")));
});

test("a complete checkout says nothing rather than inventing a caveat", () => {
  const notice = describeCheckoutOmissions({
    files: [{ path: "a.js", content: "1" }],
    omitted: [{ count: 2, reason: "not text this desk can edit (images, fonts, archives)" }],
    treeTruncated: false,
  });
  assert.equal(notice, "", "dropping a PNG is not a hole in the codebase");
});

test("a budget-limited checkout admits the desk does not have the whole project", () => {
  const notice = describeCheckoutOmissions({
    files: [{ path: "a.js", content: "1" }],
    omitted: [{ count: 40, reason: "beyond this checkout's budget of 400 files and 6MB" }],
    treeTruncated: false,
  });
  assert.match(notice, /does not have the whole project/);
  assert.match(notice, /40 more/);
});

test("a tree GitHub itself truncated is reported as partial, not as success", () => {
  const notice = describeCheckoutOmissions({
    files: [{ path: "a.js", content: "1" }],
    omitted: [],
    treeTruncated: true,
  });
  assert.match(notice, /partial checkout/);
  assert.match(notice, /present but unloaded/, "the model must not conclude a file is absent");
});
