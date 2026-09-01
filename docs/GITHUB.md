# GitHub integration (Import, PR, merge)

Quantora does **not** fully clone repositories into the Coding Desk. **Import Repository** loads a bounded, read-only file context attachment via the GitHub API for AI Studio.

## What works today

| Capability | Status | Notes |
|---|---|---|
| Import public repo context | Yes (signed-in) | `POST /api/github/preview` (alias: `/api/github/fetch-repo`) |
| Import private repo context | Needs token | Set `GITHUB_TOKEN` (or `GITHUB_PAT` / `GH_TOKEN`) in Vercel |
| Desk git status / diff / commit | Yes | Local WebContainer only — **no push** |
| Open on GitHub (compare URL) | Yes | After Import Repository; opens `compare/base...head?expand=1` |
| Create pull request with Quantora's shared token | **Fail-closed pending principal authorization** | The adapter requires a server-authorized write principal; ordinary signed-in sessions do not receive one |
| Merge pull request with Quantora's shared token | **Fail-closed pending principal authorization** | No one-click desk button; the direct server route also cannot reach GitHub without server-minted principal proof |

Parked `feat/quantora-code-foundation` PR Intelligence (review existing PRs) is **not** landed in this slice.

## Why shared-token writes are fail-closed

`GITHUB_ALLOWED_REPOS` is a **resource allowlist**: it says which repositories Quantora's platform credential may ever touch. It does not mean every signed-in Quantora user is authorized to exercise that credential against those repositories.

The previous write path required only:

1. an active Quantora session;
2. a shared server GitHub token;
3. an allowlisted repository.

That authenticated the caller and constrained the repository, but it did not authorize the caller as a principal on the external GitHub resource. Until a server-side administrator/repository-bound authorization seam is wired, `createGithubPullRequest(...)` and `mergeGithubPullRequest(...)` refuse before making a GitHub network request.

This is deliberate fail-closed containment for security issue #452. Read-only repository import remains independent and can still use a server token for private repository context where configured.

## Vercel / GitHub env vars

```bash
# Used by private repo import, and available to write adapters only after a
# server-authorized write principal exists. Keep server-side only.
GITHUB_TOKEN=

# Resource boundary for future Create PR / Merge writes.
# This NEVER authorizes a signed-in Quantora user by itself.
GITHUB_ALLOWED_REPOS=BharaniKuchipudiK/quantoraai

# Optional aliases if you prefer these names (first match wins):
# GITHUB_PAT=
# GH_TOKEN=
```

**Do not** prefix these with `VITE_` or `NEXT_PUBLIC_` — provider credentials must stay server-side.

The long-term design is a user/repository-bound GitHub App or OAuth installation for general user writes. A shared platform PAT should not be delegated merely because someone has an active Quantora session.

## API shapes

### Import context

```http
POST /api/github/preview
Content-Type: application/json

{
  "targetStage": "repository-preview",
  "repoUrl": "https://github.com/owner/repo",
  "task": "optional; defaults to coding-context import"
}
```

### Create PR

```http
POST /api/github/create-pr
Content-Type: application/json

{
  "targetStage": "github-create-pr",
  "repoUrl": "https://github.com/owner/repo",
  "title": "Desk changes",
  "head": "quantora-desk",
  "base": "main",
  "body": "optional"
}
```

The shared-token adapter currently refuses this route unless a trusted server layer supplies an authorized write principal. Request JSON cannot mint that proof.

### Merge PR

```http
POST /api/github/merge-pr
Content-Type: application/json

{
  "targetStage": "github-merge-pr",
  "repoUrl": "https://github.com/owner/repo",
  "number": 123,
  "mergeMethod": "squash"
}
```

The route remains documented so its security boundary is visible, but it is fail-closed before any GitHub merge request until server-side principal authorization is wired. A future production merge path must also require exact human approval immediately before execution and should bind approval to the expected PR head SHA.

## Honest limits

1. Import is **context only**, not a writable clone in the VFS.
2. Desk **cannot push**. A PR head branch must already exist on GitHub before Create PR can ever succeed.
3. A token + repository allowlist is not sufficient user authorization for writes.
4. Shared-token Create PR / Merge are deliberately fail-closed while #452 is being permanently resolved.
5. No GitHub operation may be treated as mission completion merely because the provider returned success.
