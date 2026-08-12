# Quantora Work Pipeline

Last updated: 2026-08-12

Track what shipped, what’s in progress, and what’s next. Architecture detail: [`../architecture/studio-platform-v2.md`](../architecture/studio-platform-v2.md).

---

## Legend

| Status | Meaning |
|--------|---------|
| ✅ Done | Merged / deployed |
| 🔄 Deploy | Code ready; needs Supabase migration or config |
| 📋 Next | Prioritized upcoming work |
| 💡 Later | Valuable but not blocking |

---

## ✅ Accomplished (shipped to production)

### Studio UX
- [x] Fellow-style unified prompt toolbar (single row, glossy tools popover)
- [x] Natural chat bubble widths (user/AI)
- [x] Focus popover (Travel, Education, Finance, Research)
- [x] Taller prompt textarea
- [x] Model spotlight card for new approved models
- [x] Live Preview fullscreen close fix (portal overlay)
- [x] Conversation memory loop (`quantora-ctx` markers)
- [x] Travel/life queries clarify-first (not dump itinerary)
- [x] Vision attachments (Gemini routing, Build-mode bypass) — PR #66
- [x] Arena “Prefer this” + auto-select learning — PR #66
- [x] Session memory client-side capture (clarify answers) — PR #66
- [x] Collapsible studio header (`StudioChromeBar`)
- [x] Choice cards protocol (`quantora-choices` markers)
- [x] Real admin analytics (`ProductAnalyticsPanel`)

### Model trust pipeline
- [x] Daily OpenRouter cron discovers free models
- [x] Admin-only Discovered tab with Approve / Reject
- [x] Unapproved models hidden from regular users
- [x] Approved models appear in public picker
- [x] Rejected models stay rejected on cron rescan

### Telemetry
- [x] Migration 0007: `studio_mode`, `studio_domain`, `choice_selected` on usage
- [x] SQL views for 7-day model/mode/domain analytics
- [x] Migration 0010: `product_events` (`preview_opened`, `publish_completed`)
- [x] Vercel Web Analytics + Speed Insights (`@vercel/analytics`, `@vercel/speed-insights`) — PR pending

---

## 🔄 Deploy checklist (do once per release)

After merge to `main`, Vercel auto-deploys the app. You still need:

1. **Supabase migrations** (if not yet run)
   ```bash
   supabase/migrations/0007_usage_product_context.sql
   supabase/migrations/0008_model_smoke_test.sql
   supabase/migrations/0009_product_views_security.sql
   supabase/migrations/0010_product_events.sql
   ```

2. **Verify after deploy**
   - [ ] Homepage copy + flagship spacing (corporate refresh)
   - [ ] Image paste → Gemini vision in Build and Ask mode
   - [ ] Arena Prefer-this buttons
   - [ ] Studio header collapses via chevron
   - [ ] Admin → Product Engagement panel
   - [ ] Live Preview → Publish toolbar + copy link (signed-in)

3. **Vercel Analytics & Observability** (dashboard toggles — no extra migration)
   - [ ] **Web Analytics** — Vercel → `quantora-platform` → **Analytics** → Enable
   - [ ] **Speed Insights** — Vercel → **Speed Insights** → Enable (Core Web Vitals; complements Supabase time-on-site)
   - [ ] **Observability** — already live on Pro (Edge Requests, Functions, Compute — see project dashboard)
   - [ ] After deploy: visit production site → confirm network requests to `vitals.vercel-insights.com`
   - Code: `@vercel/analytics` + `@vercel/speed-insights` in `src/App.jsx`; CSP allows analytics endpoints in `vercel.json`

---

## 📋 Next up (priority order)

### P0 — Reliability & trust
| # | Task | Why |
|---|------|-----|
| 1 | ~~**Admin smoke-test before approve**~~ ✅ | 3 fixed prompts per discovered model |
| 2 | ~~**Verify migration 0007 KPIs**~~ ✅ | Mode/domain tiles + tracking health banner |

### P1 — Conversation UX
| # | Task | Why |
|---|------|-----|
| 3 | ~~**Floating choice card above prompt**~~ ✅ | Pending options visible without scrolling |
| 4 | ~~**Travel + Build choice templates**~~ ✅ | Budget, dates, site type as model hints |
| 5 | ~~**Hide Arena from default chrome**~~ ✅ | Power feature; overflow menu only |

### P2 — Ship & monetize (differentiation)
| # | Task | Why | Existing code |
|---|------|-----|---------------|
| 6 | ~~**Publish to Vercel — studio UX**~~ ✅ | One-click from Live Preview → live URL | `api/deploy.ts`, `LivePreviewCanvas.jsx` |
| 7 | **Stripe Connect — user payments** | Accept payments on user-built sites; funds go to *their* Stripe | Draft PR #39 foundation |
| 8 | ~~**Preview-opened KPI**~~ ✅ | Measure build completion, not just prompts | `product_events` + `/api/product-event` |
| 9 | ~~**Vercel Web Analytics**~~ ✅ | Time-on-site + Web Vitals complement Supabase KPIs | `@vercel/analytics`, `@vercel/speed-insights` |
| 10 | **North-star dashboard tile** | “Weekly users who completed something meaningful” | Admin dashboard |

#### P2 detail: Publish to Vercel
- [x] **Surface in preview toolbar** — Publish + Download in overlay compact toolbar
- [x] **User flow** — name project → deploy → show `*.vercel.app` URL + copy link
- [x] **Custom domain** — wire existing `api/domains.ts` connect flow in UI
- [x] **Auth** — signed-in users only; session cookie on deploy
- [x] **Telemetry** — log `publish_completed` + `preview_opened` for north-star KPI

#### P2 detail: Vercel Analytics & Observability
- [x] **Install packages** — `@vercel/analytics` + `@vercel/speed-insights` (React/Vite, not Next.js)
- [x] **Wire in app** — `<Analytics />` + `<SpeedInsights />` in `src/App.jsx`
- [x] **CSP** — allow `vitals.vercel-insights.com` (+ dev `va.vercel-scripts.com`) in `vercel.json`
- [ ] **Dashboard: Web Analytics** — Vercel → Analytics → Enable on `quantora-platform`
- [ ] **Dashboard: Speed Insights** — Vercel → Speed Insights → Enable
- [ ] **Verify** — deploy → visit site → data in Analytics within ~30s (disable ad blockers if empty)
- **Observability** (Edge Requests, Fast Data Transfer, Vercel Functions, Compute) — built-in on Vercel; no app code

#### P2 detail: Stripe Payment Gateway
- [ ] **Merge/adapt PR #39** — Stripe Connect onboarding backend
- [ ] **Build-mode directive** — when user wants a shop, embed Stripe Checkout (Connect)
- [ ] **Onboarding UI** — “Connect Stripe” in preview or guided build intake
- [ ] **Demo vs live** — keep client-side demo cart until Stripe connected
- [ ] **Choice card template** — “Payment: Stripe / demo / none” in guided build
- [ ] **Compliance copy** — “Your Stripe account, your funds, Quantora does not hold money”

### P3 — Quantora differentiation
| # | Task | Why |
|---|------|-----|
| 11 | **Build Journey strip** | Fold Dream-to-Action into Studio session progress |
| 12 | **Share preview URL** | User shows someone their result without deploy |
| 13 | **Starter templates** | Bakery, tuition center, portfolio, travel blog |
| 14 | **Hindi / regional language bias** | Accessibility for target audience |

---

## 💡 Later (backlog)

- Conversation export / share link
- POS / hosting setup guidance in Build flow
- Model quality auto-scoring from Arena + thumbs feedback
- Rate limits per user tier (when monetization exists)
- Dream-to-Action Canvas deprecation or merge into Build Journey

---

## North star (reminder)

**Weekly users who complete something meaningful** — preview opened, site published, plan finished, or 3+ prompts with return visit.

Quantora is **not** free Cursor or Fello. It is:

> *Free AI studio where curious builders go from idea → visible outcome → published site, in one session.*

---

## How to use this doc

1. Pick the top unchecked item in **Next up**
2. When done, move it to **Accomplished** with date
3. Update **Deploy checklist** if new migrations/config needed
