# GitHub integration (Import, PR, merge)

Quantora does **not** fully clone repositories into the Coding Desk. **Import Repository** loads a bounded, read-only file context attachment via the GitHub API for AI Studio.

## What works today

| Capability | Status | Notes |
|---|---|---|
| Import public repo context | Yes (signed-in) | `POST /api/github/preview` (alias: `/api/github/fetch-repo`) |
| Import private repo context | Needs token | Set `GITHUB_TOKEN` (or `GITHUB_PAT` / `GH_TOKEN`) in Vercel |
| Desk git status / diff / commit | Yes | Local WebContainer only — **no push** |
| Open on GitHub (compare URL) | Yes | After Import Repository; opens `compare/base...head?expand=1` |
| Create pull request | Needs token + pushed head | `POST /api/github/create-pr` |
| Merge pull request | Needs token | `POST /api/github/merge-pr` — not exposed as a one-click desk button yet |

Parked `feat/quantora-code-foundation` PR Intelligence (review existing PRs) is **not** landed in this slice.

## Vercel / GitHub env vars (Bharani)

Set these in the Vercel project → Settings → Environment Variables (Production + Preview):

```bash
# Required for private repo import, Create PR, and merge.
# Classic PAT or fine-grained token with Contents: Read and Pull requests: Read & Write
# (merge also needs permission to merge PRs on the target repo).
GITHUB_TOKEN=

# Required for Create PR / merge (comma-separated owner/repo).
# Without this allowlist, write APIs fail closed even if a token exists.
GITHUB_ALLOWED_REPOS=BharaniKuchipudiK/quantoraai

# Optional aliases if you prefer these names (first match wins):
# GITHUB_PAT=
# GH_TOKEN=
```

**Do not** prefix with `VITE_` or `NEXT_PUBLIC_` — the token must stay server-side.

Optional GitHub App later: replace the PAT with App installation auth; the pipeline stages already fail closed with an honest message when no token is present.

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

Without `GITHUB_TOKEN`, the API returns **503** with `needsGithubToken: true` and does not pretend the PR was created.

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

## Honest limits

1. Import is **context only**, not a writable clone in the VFS.
2. Desk **cannot push**. Create PR fails with a clear message if the head branch does not exist on GitHub.
3. Merge only works when `GITHUB_TOKEN` has merge rights; there is no silent fallback.
