# Quantora Presentation Quality Benchmark

This benchmark defines the minimum acceptable standard for generated executive and professional presentations. It is intentionally higher than "clean template" quality: the artifact must demonstrate communication judgment, evidence discipline, purposeful visuals and decision-oriented storytelling.

## Non-negotiable principle

A presentation is not a theme applied to text. Quality is the combination of:

1. **Context fit** — presenter role, audience seniority, decision authority, cadence and subject matter change the content strategy.
2. **Storyline** — slides form a deliberate narrative; titles should tell the story when read in sequence.
3. **Evidence integrity** — numbers come from user-provided or attributable sources; assumptions are visible; unsupported precision is prohibited.
4. **Visual intent** — a chart, timeline, matrix, dashboard, roadmap or action architecture is used only when it improves comprehension.
5. **Information hierarchy** — headline, key metrics, supporting evidence, implication and source are visually distinct.
6. **Executive density** — enough information to support a decision without becoming a wall of text.
7. **Consistency** — typography, alignment, spacing, color semantics and source treatment are coherent across the whole artifact.
8. **Editability** — Office-native text, charts, tables and shapes are preferred over flattened screenshots when practical.

## Benchmark patterns observed in strong executive briefings

A strong 10–15 page executive briefing commonly combines several distinct communication patterns rather than repeating one card template:

- Cover with restrained branding, subject, implication-oriented subtitle and audience/date context.
- Executive summary with 3–5 quantified indicators plus a single governing insight.
- Timeline showing what happened, what is happening now and what happens next.
- Evidence page combining a native chart with one highlighted implication or contextual callout.
- Exposure / operating model framework using a structured 2x2 or multi-domain architecture.
- Deep-dive pages using metric strips, explanatory narrative and a clear management implication.
- Regional / option comparison using deliberate contrast rather than identical generic cards.
- Action agenda with numbered priorities, owners/decisions or a sequenced roadmap.
- Closing page that lands one memorable conclusion and next action.

Quantora must select these patterns based on the communication problem; they are not a fixed slide order.

## Audience archetypes

### Executive / CIO / Board / Investment case

Optimize for decision velocity. Prioritize strategic fit, value/economics, options, risks, recommendation, dependencies and an explicit decision/ask. Implementation detail belongs in appendix unless it changes the decision.

### Quarterly Business Review / Client leadership

Optimize for outcomes versus commitments. Typical evidence includes KPI trends, delivery performance, commercial/financial performance where relevant, major achievements, risks, decisions, relationship health and next-quarter priorities.

### Weekly project / program status

Optimize for operational truth and action. Use concise RAG status, milestone movement, accomplishments, slippage, RAID/dependencies, escalations, decisions required and next-week focus. Avoid decorative executive filler.

### Academic / research / student

Optimize for defensibility and learning. Match the academic level; make the research question/thesis clear; distinguish methodology, evidence, findings, interpretation, limitations and citations. Visuals must be analytically justified, not sales-oriented decoration.

## Content acceptance gates

A generated professional presentation must fail review if any of the following are true:

- Audience or purpose is materially unknown and the system did not ask.
- The deck invents quantitative facts, financials, dates, KPIs or citations.
- More than two consecutive body pages use the same generic bullet/card composition without a reason.
- A chart is decorative or lacks meaningful numeric evidence.
- Slide titles are topic labels only (for example, "Risks" or "Timeline") when a takeaway headline can be stated.
- The decision/ask is missing from a decision-oriented artifact.
- Weekly/status artifacts hide unresolved risks or slippage behind generic narrative.
- Academic artifacts present unsupported claims without source/citation treatment appropriate to the task.
- Text overflows, clips, becomes unreadably small, or requires the user to repair formatting after download.
- The downloaded Office file materially diverges from the approved preview.

## Quality scorecard (100 points)

- Context and audience fit — 15
- Storyline and slide-headline quality — 15
- Evidence / factual discipline — 15
- Visual selection and information design — 15
- Decision usefulness / actionability — 10
- Content precision and depth — 10
- Layout / typography / whitespace consistency — 10
- Preview-to-download fidelity and editability — 10

**Release threshold:** 85/100 minimum, with no critical failure in context, evidence integrity, readability or preview/download fidelity.

## Human-in-the-loop standard

Before generation, Quantora should infer known context and ask only the highest-value missing question. When sufficient context exists, it should present a compact briefing summary and assumptions for explicit human approval. The approved briefing becomes part of the artifact context for subsequent revisions.

The user must always be able to override a safe assumption or explicitly fast-track generation, but "make me a presentation" alone is not considered permission to guess the audience, decision, evidence or professional depth.

## Next engineering benchmark

The presentation renderer should evolve from six primitive layouts into a semantic composition system capable of at least:

- executive summary / KPI strip
- timeline
- comparison / options
- status dashboard / RAG
- roadmap / action agenda
- risk matrix / heatmap
- financial/value case
- chart + insight
- framework / operating model
- two-column analysis
- evidence + implication
- appendix / source page

The model chooses the communication intent; deterministic layout code owns geometry, hierarchy and Office-native rendering.
