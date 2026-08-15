import assert from "node:assert/strict";
import test from "node:test";
import { assessChangeRisk, parseGithubRepositoryUrl, selectCandidateFiles } from "./repository-preview.js";

test("accepts repository roots and rejects deeper GitHub paths", () => {
  assert.deepEqual(parseGithubRepositoryUrl("https://github.com/acme/widget.git"), { owner: "acme", repo: "widget" });
  assert.throws(() => parseGithubRepositoryUrl("https://github.com/acme/widget/blob/main/App.jsx"), /repository URL only/);
  assert.throws(() => parseGithubRepositoryUrl("https://example.com/acme/widget"), /github\.com/);
});

test("ranks filenames related to the requested change first", () => {
  const tree = [
    { path: "src/components/Header.jsx", type: "blob", size: 2_000 },
    { path: "src/components/Footer.jsx", type: "blob", size: 2_000 },
    { path: "src/App.jsx", type: "blob", size: 2_000 },
    { path: "public/logo.png", type: "blob", size: 2_000 },
  ];

  const selected = selectCandidateFiles(tree, "Keep the footer visible", 2);
  assert.equal(selected[0].path, "src/components/Footer.jsx");
  assert.ok(!selected.some(file => file.path.endsWith(".png")));
});

test("labels sensitive and infrastructure changes conservatively", () => {
  assert.equal(assessChangeRisk(["src/components/Footer.jsx"], "adjust spacing"), "low");
  assert.equal(assessChangeRisk(["api/chat.ts"], "change response"), "medium");
  assert.equal(assessChangeRisk(["api/auth/session.ts"], "change login"), "high");
});
