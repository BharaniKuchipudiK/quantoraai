# PCL Presentation Director

## Objective

Quantora should not equate presentation quality with one model vendor. PCL owns the presentation brief, context discipline, model tier, semantic composition requirements, validation and repair policy. The selected model supplies reasoning and language inside those boundaries.

The target is reliable consulting-grade communication: decision-useful storyline, assertion-led slide titles, context-specific semantic layouts, evidence discipline, readable density and a verified editable PowerPoint artifact.

## What PCL should do before model generation

1. **Understand the communication job**
   - infer deck archetype: strategy, executive briefing, business case, QBR, project status, proposal, academic research or general;
   - infer audience and decision authority from the prompt and established session context;
   - infer purpose and whether a decision/approval is required.

2. **Compile authoritative context**
   - preserve user-established facts and approved prior artifact state;
   - distinguish supplied evidence from assumptions;
   - never manufacture missing numbers, dates, citations or benchmarks.

3. **Score stakes and complexity**
   - executive/board audience;
   - decision or approval requirement;
   - financial/economic reasoning;
   - multiple options and trade-offs;
   - regulated/high-governance context;
   - technical-to-executive translation;
   - source/evidence synthesis;
   - briefing size and strategic complexity.

4. **Choose a capability tier, not a favorite vendor**
   - economy: routine internal decks and simple transformations;
   - balanced: professional management communication with moderate reasoning;
   - frontier: board, strategy, investment, high-stakes executive decisions and complex evidence synthesis.

5. **Generate through Presentation V2**
   - semantic slide composition is selected by communication intent, not a generic template;
   - titles carry the takeaway storyline;
   - evidence gaps remain explicit.

6. **Critique and repair before rendering**
   - structural schema gate;
   - executive communication gate;
   - readability/density gate;
   - repair the same candidate rather than restarting and losing approved context.

7. **Verify the artifact**
   - compile editable Office-native PPTX;
   - verify manifest/fingerprint/artifact integrity;
   - record provider/model/attempt/repair provenance.

## Model policy

Model routing must be evidence-based. The candidate list in `pcl-presentation-director.js` is policy metadata only until each model is proven through Quantora's presentation benchmark and provider contract tests.

Claude is optional, not architecturally privileged. A free-first policy may use Gemini for low-cost generation, but PCL must not promise frontier consistency from a model that has not passed the same benchmark threshold as the premium director tier.

### Cost-efficient multi-stage execution

Do not spend frontier-model tokens on the entire deck when only part of the job requires frontier judgment.

- **Director stage:** for high-stakes decks, use the strongest justified model on a compact task: determine the governing answer, storyline, management choices, decision logic and slide-level assertions.
- **Builder stage:** lock that director plan into the PCL brief and let a cheaper structured-output model expand it into the complete Presentation V2 specification.
- **Deterministic critic stage:** run structural, executive-communication and readability gates before paying for another model call.
- **Repair stage:** repair only the failed candidate/slide while preserving accepted context and storyline. Escalate to a stronger model only when the cheaper builder cannot clear the gates.

This separates expensive judgment from high-volume JSON generation. It should be benchmarked as a pipeline, not assumed to be equivalent to a single premium-model call.

## Benchmark before changing production routing

Use the same representative prompt set for every candidate model and score the generated **artifact**, not merely the JSON response.

Minimum benchmark set:
- Board strategy / transformation decision;
- CIO technology modernization;
- CFO investment/business case;
- QBR;
- weekly project/program status;
- client proposal;
- evidence/research deck.

Score each run on:
- storyline coherence;
- assertion-led headlines;
- decision usefulness;
- contextual depth;
- options/trade-off quality;
- evidence discipline / hallucination rate;
- semantic layout selection;
- density/readability;
- successful semantic repair;
- PPTX integrity and editability;
- latency and cost.

A production model-routing change is allowed only after the challenger meets the agreed quality threshold and the existing Office create/refine/recompile journeys remain green.

## Training strategy

Do **not** start with fine-tuning. First make PCL deterministic and measurable through brief compilation, routing, gates, repair and evals. Once Quantora has a meaningful corpus of user-accepted, rejected and refined decks, that evidence can support prompt-policy optimization, distillation or fine-tuning without locking the architecture to one model provider.
