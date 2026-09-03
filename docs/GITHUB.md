# GitHub integration

Quantora acts on GitHub **as the signed-in user**, using that user's own
authorization. It holds no platform credential that can write to GitHub.

That sentence is the whole design, and it is the resolution of security issue
**#452** rather than a workaround for it.

---

## What works today

| Capability | Status | Route |
|---|---|---|
| Import public repo context | Signed-in | `POST /api/github/preview` (alias `/api/github/fetch-repo`) |
| Import private repo context | Needs server `GITHUB_TOKEN` | same |
| Connect a GitHub account | User-initiated OAuth | `GET /api/auth/github/connect` |
| Connection status / disconnect | Connected user | `POST /api/github/connection`, `/api/github/disconnect` |
| List open pull requests | Connected user | `POST /api/github/list-prs` |
| Read a pull request (diff, checks, reviews, threads) | Connected user | `POST /api/github/read-pr` |
| List open issues | Connected user | `POST /api/github/list-issues` |
| Comment on a pull request | Needs **push** access | `POST /api/github/comment` |
| Open a pull request | Needs **push** access | `POST /api/github/create-pr` |
| Merge a pull request | Needs **push** access **and** the reviewed head SHA | `POST /api/github/merge-pr` |
| **Push desk files to a repository** | Needs **push** access | `POST /api/github/push` |
| **Create a repository** | Must be your account, or an org that permits it | `POST /api/github/create-repo` |
| Desk git status / diff / commit | Local only (browser VFS or, on desktop, real git on disk) | — |

Every route above resolves to `api/pipeline.ts` through a `vercel.json` rewrite,
so the serverless function budget is unchanged.

---

## The authorization model

Three things used to be treated as authorization to write. Only one of them
ever was:

| Fact | What it actually proves |
|---|---|
| An active Quantora session | who the caller is |
| A server-held `GITHUB_TOKEN` | that *Quantora* can reach GitHub |
| `GITHUB_ALLOWED_REPOS` | which repositories the platform may touch |

None of them says this **person** may write to that **repository**. Under the
old path any signed-in user could drive Quantora's shared credential against
every allowlisted repo, so the write adapter was made unconditionally
fail-closed and this document recorded the permanent fix as "a user/repository-
bound GitHub App or OAuth installation". That fix has landed.

Now, before any mutation:

1. **The principal is the user.** `api/_lib/github-connection-store.ts` loads
   the token that *this* user granted through the connect flow. No connection,
   no action — the request is refused with `412` and `needsGithubConnection`.
2. **GitHub is asked, per request.** `assertRepositoryPermission` calls
   `GET /repos/{owner}/{repo}` and reads the `permissions` object. Write needs
   `push`; an archived repository is writable by no one. A missing or
   unrecognised `permissions` object resolves to `none`, never to a default of
   read or write.
3. **GitHub enforces it again.** The mutation runs on the user's own token, so
   the answer is enforced a second time by the only system that can be
   authoritative about it.

Permissions are never cached. Access is revoked out of band — a collaborator is
removed, a repo goes private, a token is revoked in GitHub settings — and a
remembered permission is one that outlives its revocation.

### Merging is bound to the commit that was reviewed

`POST /api/github/merge-pr` requires `expectedHeadSha`. The server re-reads the
pull request, refuses if the head has moved since that commit was loaded, and
passes the SHA to GitHub so GitHub refuses too if it moves in between. A merge
with no named commit is not an approved merge, and there is no code path that
omits it.

### `GITHUB_ALLOWED_REPOS` changed meaning

It was the containment that stopped a shared credential from becoming a confused
deputy. That credential no longer writes, so the variable is now an **optional**
deployment-level narrowing, applied to writes only:

- **unset** — no deployment restriction; a user may act on repositories they
  already have permission for on github.com;
- **set** — writes are restricted to the listed repositories, on top of the
  user's own permissions.

This is a deliberate loosening of the default, and it is safe only because
subject authorization now exists. It was never subject authorization itself.

---

## Environment variables

```bash
# Signs Quantora's own sessions. Also signs the connect-flow state parameter.
SESSION_SECRET=                 # ≥ 32 chars

# OAuth app used by BOTH sign-in and connect (different scopes; see below).
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Seals each user's GitHub token before it reaches the database (AES-256-GCM).
# Its own secret, not SESSION_SECRET: separate secrets rotate separately.
GITHUB_CONNECTION_SECRET=       # ≥ 32 chars

# Read-only repository context import for private repos. Cannot write.
GITHUB_TOKEN=                   # or GITHUB_PAT / GH_TOKEN

# Optional. Narrows which repositories writes may target on this deployment.
GITHUB_ALLOWED_REPOS=owner/repo,owner/other
```

Never prefix these with `VITE_` or `NEXT_PUBLIC_`. The browser never receives a
GitHub token at all: the connect flow is a server redirect and the token is
stored sealed, so an XSS bug has nothing to exfiltrate.

### Callback URLs to register on the OAuth app

```
https://<your-domain>/api/auth/github/callback           # sign-in
https://<your-domain>/api/auth/github/connect/callback   # connect
```

### Why sign-in and connect are separate

Sign-in asks for `read:user user:email`. Connect asks for `repo`, which is the
authority to read and write the user's repositories. Bundling the second into
the first would mean everyone who ever chose "Sign in with GitHub" had handed
over write access to all of their code on the chance they might one day open a
pull request. Connecting is an explicit, separately revocable second decision,
taken by someone already signed in.

GitHub can grant less than was asked for. The connection records what was
actually granted, and the panel says so before a narrower grant turns into an
unexplained refusal later.

---

## Database

`supabase/migrations/20260902150000_github_connections.sql` creates
`public.github_connections`: one row per account, holding the AES-256-GCM sealed
token, the GitHub login, and the granted scopes. RLS is on with no policies and
both roles are revoked, so only the service role reaches it server-side. A dump
of that table without `GITHUB_CONNECTION_SECRET` yields no usable credential.

The store fails **closed**, unlike `api/_lib/store.ts` which fails soft on
purpose. A database it cannot reach means "no principal", which means every
GitHub action refuses. A store outage degrades Quantora to read-only on GitHub;
it must never degrade it to unauthorized.

---

## What the pull request brief reports, and what it refuses to claim

`api/_lib/github-intelligence.ts` assembles the diff, the checks on the current
head, the reviews, and the review threads. Per CLAUDE.md §1, a green check is a
claim and the log is the evidence:

- a commit with **zero checks** reports `none`, never `passing` — absence of a
  failure is not a pass;
- checks that all resolve to `skipped` or `neutral` also report `none`, because
  nothing was actually verified;
- every failing check keeps its own log URL, because the actionable thing is the
  log, not the word "failure";
- `mergeable: null` (GitHub still computing) stays null rather than becoming
  "conflicted" — coercing it would invent a conflict and send someone to fix
  something that is not broken;
- checks are read for the head SHA the brief names, and that SHA is displayed,
  so a stale answer is visibly stale.

---

## Putting files into a repository

Two routes turn a desk build into something the user owns. Both act on the
signed-in user's own connected credential.

```http
POST /api/github/create-repo
{ "name": "my-coffee-shop", "isPrivate": true, "owner": "octocat" }
```

`owner` defaults to the connected account. **Private is the default**, and the
default is deliberate: a repository cannot be un-published once it exists — it
can be cloned, cached and indexed the moment it appears — so the reversible
option is the one that happens when nobody chooses. `isPrivate: false` is
honoured when asked for.

Authorization here cannot be `assertRepositoryPermission`, because there is no
repository yet to ask about. `assertRepositoryCreationAllowed` asks the question
that does apply — may this principal create a repository under this owner —
resolving the viewer, then org membership, then that org's own
`members_can_create_repositories` setting, and failing closed when GitHub does
not positively say yes.

```http
POST /api/github/push
{ "repoUrl": "https://github.com/octocat/my-coffee-shop",
  "files": [{ "path": "index.html", "content": "<h1>hi</h1>" }],
  "message": "Initial commit from Quantora",
  "branch": "main" }
```

One commit, through the git data API: every blob and the tree are staged first
and the branch moves exactly once, at the end. A failure partway leaves
unreferenced objects that GitHub garbage-collects, so the branch is either where
it was or where the whole push put it — never halfway. A repository with no
commits yet is the ordinary first-push case and creates the branch; an existing
branch is fast-forwarded with `force: false`, so a branch someone else moved is
refused rather than overwritten.

Paths are rejected rather than repaired: `..` anywhere, anything under `.git/`,
control characters, and the same path twice. Bounds are 400 files, 1MB per file
and 8MB per push, chosen to fit one serverless invocation.

## The gates that hold this

| command | what only it can catch |
|---|---|
| `npm run test:github-writes` | a GitHub mutation that reaches the network without asking GitHub whether this user may perform it, or one no test proves refuses |
| `node --test api/_lib/github-write-authorization.test.ts` | a write that refuses *after* the request has already left |
| `node --test api/_lib/github-principal.test.ts` | a permission payload that defaults to allow; a connect state that is not bound to one account |
| `node --test api/_lib/github-intelligence.test.ts` | an unverified commit reading as green |

`scripts/github-write-seam-gate.mjs` was verified in both directions, per
CLAUDE.md §2: it passes on the correct tree, and it names the file, line,
function and method — with two stated remedies — both when an authorization call
is deleted and when a new unguarded write helper is added.

---

## Honest limits

1. Repository import is **context only**, not a writable clone in the VFS.
   Push sends the desk's files; it does not make the desk a checkout of the
   repository, so it can create or add to a branch but cannot merge histories.
2. Push writes **one commit** through the git data API — blobs, then a tree,
   then a commit, then the branch moves once, last. `force` is never set, so a
   branch that moved on GitHub since Quantora read it is refused rather than
   overwritten. Deletions are not expressed: a push adds and updates files, and
   a file removed on the desk stays in the repository until removed there.
3. Quantora cannot exceed the acting user's own GitHub permissions, by design.
   A refusal here usually means GitHub said no, not that Quantora is broken.
4. Review threads come from the REST endpoint, which carries no resolved flag;
   `resolved` is reported only when GitHub supplies it and is never inferred.
5. The model does not yet call these routes as tools. The brief is shaped for a
   model to read (`renderPullRequestBrief`) and the panel is the human surface;
   an agent tool is the next slice, and a tool description that over-promises is
   exactly what `npm run test:claims` exists to prevent.
6. No GitHub operation may be treated as mission completion merely because the
   provider returned success.
