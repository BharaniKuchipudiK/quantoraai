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
- [x] Vision in Chat mode (pasted images)

### Model trust pipeline
- [x] Daily OpenRouter cron discovers free models
- [x] Admin-only Discovered tab with Approve / Reject
- [x] Unapproved models hidden from regular users
- [x] Approved models appear in public picker
- [x] Rejected models stay rejected on cron rescan

### Studio Platform v2 (code complete — see Deploy checklist)
- [x] Collapsible studio header (`StudioChromeBar`)
- [x] Free model count fix (`free` + `free-tier`)
- [x] Fake live map removed; real `ProductAnalyticsPanel`
- [x] Choice cards protocol (`quantora-choices` markers)
- [x] Telemetry: `studio_mode`, `studio_domain`, `choice_selected` on usage rows
- [x] SQL views for 7-day model/mode/domain analytics

---

## 🔄 Deploy checklist (do once per release)

After merge to `main`, Vercel auto-deploys the app. You still need:

1. **Supabase migration 0007**
   ```bash
   # In Supabase SQL editor, run:
   supabase/migrations/0007_usage_product_context.sql
   ```
   Adds `studio_mode`, `studio_domain`, `choice_selected` + analytics views.

2. **Admin access** (if not already set)
   ```sql
   UPDATE public.users SET is_admin = true WHERE email = 'your@email.com';
   ```

3. **Verify after deploy**
   - [ ] Studio header collapses via chevron
   - [ ] Model Dashboard Free count matches list (2 = Gemini + Nemotron)
   - [ ] Admin → Product Engagement panel (no fake map)
   - [ ] Build mode: AI may show choice cards on clarify questions
   - [ ] Admin Discovered tab still works

4. **Optional: Vercel Web Analytics** (time-on-site — not wired yet)
   - Enable in Vercel project → Analytics
   - Add `@vercel/analytics` in a future PR

---

## 📋 Next up (priority order)

### P0 — Reliability & trust
| # | Task | Why |
|---|------|-----|
| 1 | **Fix Bali / session memory re-ask bug** | User answers get ignored; breaks clarify-first promise |
| 2 | **Apply migration 0007 in Supabase** | Mode/domain KPIs stay empty without it |
| 3 | **Admin smoke-test before approve** | 3 fixed prompts per discovered model |

### P1 — Conversation UX (your Claude-style vision)
| # | Task | Why |
|---|------|-----|
| 4 | **Floating choice card above prompt** | Pending options visible without scrolling chat |
| 5 | **Travel choice templates** | Budget, dates, group size as cards |
| 6 | **Build choice templates** | Site type, cart, payment gateway, domain name |
| 7 | **Hide Arena Mode from default UI** | Power feature; tuck in overflow only |

### P2 — Product proof (KPIs that matter)
| # | Task | Why |
|---|------|-----|
| 8 | **Preview-opened event** | Measure build completion, not just prompts |
| 9 | **Session ID on usage rows** | True prompts-per-session metric |
| 10 | **Vercel Web Analytics** | Time on site complements Supabase |
| 11 | **North-star dashboard tile** | “Weekly users who completed something meaningful” |

### P3 — Quantora differentiation
| # | Task | Why |
|---|------|-----|
| 12 | **Share / export preview URL** | User can show someone their result |
| 13 | **One-click deploy** (Vercel/Netlify) | Idea → live site for Indian youth |
| 14 | **Starter templates** | Bakery, tuition center, portfolio, travel blog |
| 15 | **Hindi / regional language bias** | Accessibility for target audience |

---

## 💡 Later (backlog)

- Conversation export / share link
- POS / hosting setup guidance in Build flow
- Dual Arena Mode polish or removal
- Model quality auto-scoring from production feedback
- Rate limits per user tier (when monetization exists)

---

## North star (reminder)

**Weekly users who complete something meaningful** — preview opened, plan finished, or 3+ prompts with return visit.

Quantora is **not** free Cursor or Fello. It is:

> *Free AI studio where curious builders go from idea → visible outcome in one session.*

---

## How to use this doc

1. Pick the top unchecked item in **Next up**
2. When done, move it to **Accomplished** with date
3. Update **Deploy checklist** if new migrations/config needed
