# Coding Desk Terminal + Git production checklist

## What automation proves

| Gate | Where it runs | What it proves |
|------|---------------|----------------|
| `scripts/desk-terminal-git-gate.mjs` | CI Browser release gates | After a small multi-file VFS lands on isolated `/desk` (COEP), Terminal `ls` lists Preview project files and desk `git commit` records a message against the same tree |
| `scripts/deployed-desk-terminal-git-gate.mjs` | Deployed Golden workflow (when bypass secrets exist) | Same proof against the **deployed** `${BASE}/desk` with Vercel protection bypass |
| `scripts/studio-regression-browser-gate.mjs` | CI Browser release gates | Broader Studio journey that also calls `proveDeskFilesMatchPreview` for calculator + boutique |

Terminal `ls` uses path-first listing (`answerWorkspaceListing` / `deskShellVfs`) — the same tree Preview runs. Desk Git is in-memory (`runDeskGit` in `src/lib/studio-git.js`), not Quantora's GitHub.

## Why production `/desk` needs a bypass secret

`https://quantoraai.app/desk` returns **403** without `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel Deployment Protection / SSO). That is expected — not a product bug.

The deployed gate:

1. Sends `x-vercel-protection-bypass` (+ set-cookie for the browser path)
2. Optionally sends `X-Quantora-Golden-Canary`
3. Fulfills `/api/auth/session` with a synthetic identity
4. Mocks `/api/chat` with a fixed multi-file project so the VFS is deterministic (no live LLM flake)
5. Lets deployed `/api/preview-compile` continue on HTTPS so compilation matches the deployment

It does **not** drive a full signed-in live Coding Desk chat on production (LLM latency / flake). Shop Preview has the same split: automate the shell path, manual for the full partner loop.

## Manual production checklist (Coding Desk Terminal + Git)

Use a signed-in browser on `https://quantoraai.app/desk` after a green deploy:

1. New coding chat → ask for a small multi-file app (e.g. mission control / Vite React).
2. Wait until Preview shows the running app and FILES lists `index.html` / `src/App.jsx` (or equivalent).
3. Open **Terminal** → run `ls` → output must include those Preview project files (not “cannot start on this page” / “No files in this desk yet”).
4. Open **Git** → Status must list the same tree → enter a one-line message → **Commit** → log must show the message plus the file listing.
5. Confirm the address bar is still `/desk` and the page is cross-origin isolated (Terminal/Git only work with COEP).
6. Advisors (Travel/Study/Finance/Research) must not steal the thread.

If steps 3–4 fail while CI desk Terminal/Git is green, the hole is production COEP / desk assembly / VFS wiring — not the local gate itself.
