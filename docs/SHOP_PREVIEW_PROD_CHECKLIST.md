# Shop Preview production checklist

## What automation proves

| Gate | Where it runs | What it proves |
|------|---------------|----------------|
| `scripts/shop-preview-act-gate.mjs` (via `preview-ready-not-stuck-gate.mjs`) | CI Browser release gates | Start-with-10 shop → path-first `/preview/embed.html` shell (prod sandbox, no `allow-same-origin`) paints ≥1 `img` with `naturalWidth > 0` and Add to Cart increments Bag |
| `scripts/deployed-shop-preview-gate.mjs` | Deployed Golden workflow (when bypass secrets exist) | Same act against the **deployed** `${BASE}/preview/embed.html` |
| `scripts/deployed-golden-transactions.mjs` | Deployed Golden workflow | Calculator + simple website via live `/api/chat` — **not** shop |

Shop is intentionally not a third LLM golden: calculator/website goldens already flake, and Fox & Wolf needs catalog photos + cart, not another constrained React prompt.

## Why production `/desk` is not hit from CI without secrets

`https://quantoraai.app/` and `/desk` return **403** without `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel Deployment Protection / SSO). That is expected — not a product bug.

The deployed canary pattern (see `scripts/deployed-golden-transactions.mjs`) already:

1. Sends `x-vercel-protection-bypass` (+ set-cookie for the browser path)
2. Optionally sends `X-Quantora-Golden-Canary`
3. Fulfills only `/api/auth/session` with a synthetic identity

`deployed-shop-preview-gate.mjs` reuses (1)–(2) against the path-first embed. It does **not** drive a full Studio Start-with-10 chat on `/desk` (LLM latency / flake).

## Manual production checklist (Coding Desk shop)

Use a signed-in browser on `https://quantoraai.app/desk` after a green deploy:

1. New coding chat → paste: `Build Fox & Wolf kids merchandise shop with 100 unique design images and a full website.`
2. When the partner offers a smaller catalog, accept **Start with 10** (or equivalent).
3. Wait until Preview leaves “getting ready” and shows product cards.
4. Confirm ≥1 product photo is a real decoded image (not an empty frame).
5. Click **Add to Cart** once → Bag label must move from `Bag 0` to `Bag 1` (or higher).
6. Optional: currency switcher still visible; Advisors (Travel/Study/Finance/Research) must not steal the thread.

If step 4–5 fail while CI shop act is green, the hole is desk assembly / COEP / live probe wiring — not the embed shell itself.
