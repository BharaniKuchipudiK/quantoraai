# Quantora Work Pipeline

Last updated: 2026-08-13

Track what shipped, what’s in progress, and what’s next. Architecture detail: [`../architecture/studio-platform-v2.md`](../architecture/studio-platform-v2.md).

---

## Legend

| Status | Meaning |
|--------|---------|
| ✅ Done | Merged / deployed |
| 🔄 Deploy | Code ready; needs Supabase migration or config |
| 📋 Next | Prioritized upcoming work |
| 💡 Later | Valuable but not blocking |
| 🧠 Ideas vault | Captured thoughts — don’t lose between sessions |

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
- [ ] Collapsible studio header — `StudioChromeBar` was written but never rendered; component removed
- [x] Choice cards protocol (`quantora-choices` markers)
- [x] Real admin analytics (`ProductAnalyticsPanel`)
- [x] Floating choice card above prompt — PR #71
- [x] Travel + Build choice card templates — PR #71
- [x] Arena hidden from default chrome (overflow menu) — PR #71
- [x] Continuation chips after AI replies (ChatGPT-style) — PR #76

### Ship & publish
- [x] Publish to Vercel from Live Preview overlay — PR #72
- [x] Project name dialog, copy link, session auth on `/api/deploy`
- [x] `product_events` + `/api/product-event` (`preview_opened`, `publish_completed`) — PR #72

### Analytics & admin
- [x] Admin Technical & Telemetry tab (cost split, P95, model latency, preview/publish) — PR #74
- [x] Migration 0011: technical analytics views
- [x] Geo capture from Vercel edge headers — PR #75
- [x] Migration 0012: `user_geo` + country charts in User Analytics
- [x] Vercel Web Analytics + Speed Insights in app — PR #73

### Landing & positioning
- [x] Success stories placeholders + broader studio positioning (not website builder) — PR #77

### Model trust pipeline
- [x] Daily OpenRouter cron discovers free models
- [x] Admin-only Discovered tab with Approve / Reject
- [x] Unapproved models hidden from regular users
- [x] Approved models appear in public picker
- [x] Rejected models stay rejected on cron rescan
- [x] Admin smoke-test before approve (3 fixed prompts per model)

### Telemetry migrations
- [x] Migration 0007: `studio_mode`, `studio_domain`, `choice_selected` on usage
- [x] SQL views for 7-day model/mode/domain analytics
- [x] Migration 0010: `product_events`
- [x] Migration 0008–0009: smoke test + product views security

---

## 🔄 Deploy checklist (do once per release)

After merge to `main`, Vercel auto-deploys the app. You still need:

1. **Supabase migrations** (if not yet run)
   ```bash
   supabase/migrations/0007_usage_product_context.sql
   supabase/migrations/0008_model_smoke_test.sql
   supabase/migrations/0009_product_views_security.sql
   supabase/migrations/0010_product_events.sql
   supabase/migrations/0011_technical_analytics_views.sql
   supabase/migrations/0012_user_geo.sql
   ```
   ✅ Bharani confirmed 0007–0012 run (2026-08-12)

2. **Verify after deploy**
   - [x] Homepage copy + flagship spacing (corporate refresh) — PR #77
   - [ ] Image paste → Gemini vision in Build and Ask mode (code fixed PR #66; prod smoke test)
   - [x] Arena Prefer-this buttons
   - [x] Studio header collapses via chevron
   - [x] Admin → Product Engagement panel
   - [x] Live Preview → Publish toolbar + copy link (signed-in)

3. **Vercel Analytics & Observability** (dashboard toggles)
   - [x] **Web Analytics** — enabled on `quantora-platform`
   - [x] **Speed Insights** — enabled
   - [x] **Observability** — live on Pro
   - [ ] After deploy: confirm network requests to `vitals.vercel-insights.com` (disable ad blockers if empty)

---

## 📋 Next up (priority order)

### P0 — Reliability & trust
| # | Task | Why |
|---|------|-----|
| 1 | ~~Admin smoke-test before approve~~ ✅ | 3 fixed prompts per discovered model |
| 2 | ~~Verify migration 0007 KPIs~~ ✅ | Mode/domain tiles + tracking health banner |
| 3 | **Prod smoke: image paste vision** | Code shipped; needs one manual Ask + Build test |

### P1 — Build Journey (Dream Canvas v2) — **current focus**
| # | Task | Why | Status |
|---|------|-----|--------|
| 4 | **Outcome board (3 lanes)** | Captured → In progress → Done — tied to north star, not dev JSON stages | ✅ v1 shipped 2026-08-13 |
| 5 | **Fix Push to Journey from Studio** | Was broken: pushed raw code string, never created card | ✅ `Save to Journey` + `createJourneyNode` |
| 6 | **Drag cards across lanes** | Manual progress users understand; no fake “Execute” AI pipeline | ✅ HTML5 drag + Advance button |
| 7 | **Continue in Studio** | Card opens Studio with original prompt — one click back to work | ✅ wired in `App.jsx` |
| 8 | **Auto-advance on preview/publish** | `preview_opened` → In progress; `publish_completed` → Done | ✅ wired 2026-08-13 |

### P2 — Ship & monetize
| # | Task | Why | Existing code |
|---|------|-----|---------------|
| 9 | **Stripe Connect — user payments** | Accept payments on user-built sites; funds go to *their* Stripe | Draft PR #39 |
| 10 | **North-star dashboard tile** | “Weekly users who completed something meaningful” | Admin dashboard |

#### P2 detail: Stripe Payment Gateway
- [ ] Merge/adapt PR #39 — Stripe Connect onboarding backend
- [ ] Build-mode directive — when user wants a shop, embed Stripe Checkout (Connect)
- [ ] Onboarding UI — “Connect Stripe” in preview or guided build
- [ ] Demo vs live — keep client-side demo cart until Stripe connected
- [ ] Choice card template — “Payment: Stripe / demo / none” in guided build
- [ ] Compliance copy — “Your Stripe account, your funds, Quantora does not hold money”

### P3 — Quantora differentiation
| # | Task | Why | Status |
|---|------|-----|--------|
| 11 | ~~**Listening Layer v0.2**~~ | Central event bus + working notes | ✅ 2026-08-13 |
| 12 | **Domain anticipation** | Travel → budget → dates in continue chips | ✅ v0.3 2026-08-13 |
| 13 | **Journey strip in Studio** | Progress without switching tabs | ✅ v0.3 2026-08-13 |
| 14 | **Idle return prompt** | Welcome back after 24h | ✅ v0.3 2026-08-13 |
| 15 | ~~**Share preview URL**~~ | One-click link copy from Live Preview (auto preview name) | ✅ 2026-08-13 |
| 16 | ~~**Choice dock dismiss/collapse**~~ | Non-intrusive suggestions above prompt | ✅ 2026-08-13 |
| 17 | ~~**Starter templates**~~ | Bakery, tuition center, portfolio, travel blog | ✅ 2026-08-13 |
| 18 | **Proactive partner tone + nudge** | "Hey Bharani, I've included the links…" | ✅ 2026-08-13 |
| 19 | **Continue chips in prompt dock** | Above prompt, not in chat scroll | ✅ 2026-08-13 |
| 20 | **Server-side session_signals** | Cross-device listener log + admin | 📋 Next |

---

## 🧠 Ideas vault (don’t lose these)

Captured between sessions — not yet scheduled.

### Quantora Listening Layer (emerging architecture)

**What it is:** A passive intelligence layer that watches what the user *does* (not just what they type) and keeps session state, journey cards, and next suggestions in sync — without the user managing a dashboard.

**Why now:** Build Journey auto-advance (preview → In progress, publish → Done) is **Listening Layer v0.1** — the first event hooks.

| Signal (event) | Listener action | User-visible effect |
|----------------|-----------------|---------------------|
| `preview_opened` | Upsert journey card → In progress | Board updates without “Save to Journey” |
| `publish_completed` | Move card → Done + store URL | Proof of completion on board |
| Choice selected | Enrich `conversationContext` | Fewer re-asks (already partial) |
| Continue chip clicked | Log intent + steer prompt | Peer conversation (shipped) |
| Session idle 24h | Surface “Continue where you left off” | Return visit KPI |
| Plan mode finished (no preview) | Move to Done with `outcomeType: plan` | Non-build outcomes count |

**Layers (conceptual stack):**

```
┌─────────────────────────────────────────┐
│  Surfaces: Studio · Journey · Admin KPIs │
├─────────────────────────────────────────┤
│  Listening Layer — event bus + rules     │
│  (client today → Supabase queue later)   │
├─────────────────────────────────────────┤
│  Session memory · domain · mode context  │
└─────────────────────────────────────────┘
```

**v0.3 shipped (2026-08-13):**
- [x] `src/lib/domain-anticipation.js` — client-side continue chip enrichment per domain
- [x] API domain continue hints in `studio-continues.ts` + `conversation-policy.ts`
- [ ] Captured / In progress / Done strip in the Studio header — `StudioJourneyStrip` was written but never rendered; component removed
- [ ] Welcome back after 24h idle — `StudioIdleReturnBanner` was written but never rendered; component removed

**v0.4 candidates:**
- [ ] Server-side event log (`session_signals` table)
- [ ] Share preview URL
- [ ] Starter templates

**Principle:** Listen → infer intent → update state → suggest next beat. Never require the user to maintain the system manually.

### Conversation layer
- **Working notes** — visible, editable `conversationContext` in Studio chrome (not buried in session state)
- **Domain anticipation** — after Travel/Finance/Research reply, continuation chips enriched with domain-specific “next beats” (budget → dates → bookings)
- **Session export / share link** — send someone your plan or preview without publishing

### Build Journey / Dream Canvas
- **So what:** users care about *finishing something*, not moving cards for fun. Kanban only works if lanes = real outcomes.
- **Old 4-stage model was wrong:** Dream → Idea → Thought → Action = dev pipeline jargon; showed JSON/code; “Production Ready” was misleading
- **New framing:** Build Journey — **Captured | In progress | Done** linked to Studio session
- **Actions that matter:** Continue in Studio, Open Preview, View live URL — not “Execute to JSON” via `/api/pipeline`
- **Future:** fold a slim progress strip into Studio header; full board for power users / return visits
- **Deprecate:** standalone `/api/pipeline` Gemini JSON→React path (duplicates Live Preview flow)

### Investor / positioning (honest notes)
- Not serious-VC ready until ~20 strangers complete a meaningful outcome + return within 7 days
- Pitch: *“Free outcomes studio that measures completion, not prompt volume”*
- Differentiation stack: session memory + domain focus + verify/preview + completion KPIs + peer conversation (choices + continue chips)

---

## 💡 Later (backlog)

- POS / hosting setup guidance in Build flow
- Model quality auto-scoring from Arena + thumbs feedback
- Rate limits per user tier (when monetization exists)
- Persist Build Journey cards to Supabase (cross-device), not just localStorage
- Build Journey strip inside Studio (mini 3-dot progress)

---

## North star (reminder)

**Weekly users who complete something meaningful** — preview opened, site published, plan finished, or 3+ prompts with return visit.

Quantora is **not** free Cursor or a website builder. It is:

> *Free AI outcomes studio — research, apps, plans, travel, finance — publish a page only when that’s the outcome.*

---

## How to use this doc

1. Pick the top unchecked item in **Next up**
2. When done, move it to **Accomplished** with date
3. Drop new thoughts in **Ideas vault** immediately — they get scheduled into **Next up** when ready
4. Update **Deploy checklist** if new migrations/config needed
