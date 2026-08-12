# Quantora Studio Platform v2

## Intent

Quantora is a **free AI studio** where curious builders — especially young people without expensive tools — move from *idea* to *visible outcome* in one session. It is deliberately **not** a free Cursor (dev IDE) or a Fello clone (polished general chat).

Three pillars in this release:

| Pillar | Problem | Outcome |
|--------|---------|---------|
| **Studio Chrome** | Top toolbar steals vertical space during conversation | Collapsible chrome; controls live in prompt bar or overflow |
| **Product Analytics** | Fake map destroys trust | Measured KPIs from Supabase `usage` — prompts, models, modes, domains |
| **Choice Cards** | Text-only follow-ups feel friction-heavy | Model emits structured options; UI renders tappable cards |

---

## Process (how the product behaves)

### Conversation loop (unchanged philosophy)

```
UNDERSTAND → CONTEXTUALIZE → RESPOND → ACT
```

No fixed wizards. The model decides when to clarify. Choice cards are **optional UI rendering** of a clarify step — not a scripted form.

### When choice cards appear

1. **Guided build** — user asked for a website; model needs site type, cart, payments, etc.
2. **Domain focus** — Travel, Finance, Education, Research; model offers 2–5 concrete options.
3. **Never** for open-ended questions or when the user already gave enough context.

### User selects a card

Selection sends the card's `value` as the next user message (same as typing it). Telemetry records `choice_selected=true` on that request.

### Admin reads truth

Admin Dashboard shows **only measured data**. If Supabase is unconfigured, show explicit "not configured" — never simulate users on a map.

---

## Technical architecture

```
┌─────────────────────────────────────────────────────────────┐
│  AiStudio.jsx                                               │
│  ├── StudioChromeBar (collapsible header)                   │
│  ├── Message feed + StudioChoiceCards (per AI message)      │
│  └── Prompt toolbar (tools, model, send)                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ POST /api/chat
┌───────────────────────────▼─────────────────────────────────┐
│  conversation-policy.ts                                       │
│  ├── SENIOR_PARTNER_POLICY                                   │
│  ├── SESSION_MEMORY (quantora-ctx marker)                    │
│  └── CHOICES_DIRECTIVE (quantora-choices marker)             │
└───────────────────────────┬─────────────────────────────────┘
                            │ stream
┌───────────────────────────▼─────────────────────────────────┐
│  studio-choices.ts / session-context.ts                      │
│  Parse markers → strip from display → merge state              │
└───────────────────────────┬─────────────────────────────────┘
                            │ recordUsage (async, fail-soft)
┌───────────────────────────▼─────────────────────────────────┐
│  Supabase usage (+ studio_mode, studio_domain, choice_selected)│
│  Views: product_model_usage_7d, product_mode_usage_7d, …       │
└───────────────────────────┬─────────────────────────────────┘
                            │ GET /api/admin/metrics
┌───────────────────────────▼─────────────────────────────────┐
│  ProductAnalyticsPanel (replaces LiveUsersMap)               │
└─────────────────────────────────────────────────────────────┘
```

### Marker protocol (parallel to session memory)

| Marker | Purpose |
|--------|---------|
| `<!-- quantora-ctx:{...} -->` | Session memory (goal, facts) |
| `<!-- quantora-choices:{...} -->` | Structured follow-up options |

Both are stripped from visible markdown. Partial markers are hidden during SSE streaming.

### Telemetry schema extension (migration 0007)

`usage` columns: `studio_mode`, `studio_domain`, `choice_selected` (nullable booleans/text).

SQL views aggregate last 7 days for admin dashboard charts.

### Model dashboard filter semantics

| Filter | Meaning |
|--------|---------|
| Ready | `status === 'available'` |
| Free | `pricingKind` in `free`, `free-tier` |
| New | Recently discovered or updated |

Ready ∩ Free is expected overlap — badges count distinct dimensions.

---

## KPIs that matter (north star)

**Weekly users who complete something meaningful** — preview opened, plan finished, or 3+ prompts in a session.

Supporting metrics (all from `usage`):

- Prompts per active user (7d)
- Model distribution
- Studio mode mix (chat / build / plan)
- Domain focus adoption
- Choice card engagement rate

---

## Roadmap after v2

1. Choice cards above prompt (floating) for pending unanswered sets
2. Vercel Web Analytics for time-on-site (complements Supabase)
3. Session-scoped `session_id` on usage for true prompts/session
4. Share/export preview URL as completion signal
