# Study Assessment H2.3 — Independent Academic Review Pack

**Status:** Review required before promotion  
**Effective from:** 2026-09-02  
**Applies to:** PR #455, branch `study/h2-3-reviewed-corpus-expansion`  
**Authority boundary:** This document records review evidence. It does not itself approve, release, or promote any assessment item.

## Purpose

H2.3 expands the reviewed assessment corpus without weakening the verified-evidence boundary established in H2.1 and H2.2.

The eight candidates in this pack are intentionally staged as `reviewStatus: draft` with corpus lifecycle `in_review`. They must not enter the production assessment bank, count toward released coverage, or issue verified learner evidence until an independent academic reviewer records an explicit decision and an auditable review reference is attached to the item.

## Reviewer decision scale

Each candidate must receive exactly one disposition:

- **APPROVE** — academically correct, unambiguous, curriculum-aligned, appropriately calibrated, and suitable for release without substantive change.
- **REVISE** — directionally valid but requires a substantive content correction before approval. A revised item must be reviewed again as a new item version.
- **REJECT** — unsuitable for release because of correctness, ambiguity, curriculum, construct-validity, or quality concerns.

A reviewer must not mark **APPROVE** if any mandatory criterion below is unresolved.

## Mandatory review criteria

For every candidate, independently assess:

1. **Academic correctness** — prompt, keyed answer, reasoning and explanation are factually/mathematically correct.
2. **Single defensible answer** — exactly one option is clearly best under the stated assumptions.
3. **Prompt clarity** — wording is age-appropriate, self-contained and free from hidden assumptions.
4. **Distractor quality** — wrong options are plausible enough to diagnose misunderstanding but are not ambiguous or trick answers.
5. **Curriculum alignment** — the construct belongs to the mapped governed concept and intended 2026 curriculum references.
6. **Objective alignment** — the item actually measures its declared learning objective and cognitive operation.
7. **Difficulty calibration** — the proposed difficulty is directionally reasonable relative to the existing pilot bank.
8. **Misconception validity** — mapped distractors correspond to real, interpretable learner errors rather than arbitrary labels.
9. **Explanation quality** — explanation teaches why the keyed answer is correct and does not merely restate it.
10. **Evidence-purpose fit** — the item genuinely supports the declared diagnostic/retrieval/application/misconception purpose.
11. **Representation fit** — text/quantitative/spatial representation is accurately classified.
12. **No answer leakage** — prompt/options contain no correctness markers or accidental clues.
13. **No problematic duplication** — item is materially distinct from the existing released item for the same concept.
14. **Fairness and accessibility** — no unnecessary cultural, linguistic or contextual dependency unrelated to the assessed construct.

## Review record requirements

For an **APPROVE** decision, record all of the following:

- reviewer name or durable reviewer identifier;
- reviewer role/qualification;
- review date;
- candidate `key@version`;
- disposition;
- concise rationale;
- any non-blocking editorial notes;
- durable review reference suitable for the item's `corpus.lifecycle.reviewRef`.

A GitHub comment alone is not sufficient unless it is stable, attributable and intentionally adopted as the durable review reference.

---

## Candidate 1 — Trigonometric signs in quadrant III

**Item:** `trig-functions-third-quadrant-signs@1`  
**Concept:** `math.trigonometry.functions`  
**Objective:** `trig-signs-q3`  
**Cognitive operation:** application  
**Evidence purpose:** application  
**Representation:** spatial  
**Proposed difficulty:** 0.40

**Prompt**  
An angle is 210°. Which sign pattern is correct for its sine and cosine?

**Options**
- A — Sine positive, cosine positive
- B — Sine positive, cosine negative
- C — Sine negative, cosine positive
- D — Sine negative, cosine negative

**Proposed keyed answer:** D

**Explanation**  
An angle of 210° lies in quadrant III, where both the vertical and horizontal unit-circle coordinates are negative.

**Declared misconception mapping**
- A — `sign_error`
- B — `sign_error`
- C — `sign_error`

**Reviewer decision:** PENDING  
**Reviewer:** —  
**Review date:** —  
**Disposition rationale:** —  
**Required revisions:** —  
**Review reference:** —

---

## Candidate 2 — Pythagorean trigonometric identity

**Item:** `trig-identities-missing-cosine@1`  
**Concept:** `math.trigonometry.identities`  
**Objective:** `trig-pythagorean-solve-ratio`  
**Cognitive operation:** application  
**Evidence purpose:** application  
**Representation:** quantitative  
**Proposed difficulty:** 0.50

**Prompt**  
For an acute angle x, sin(x) = 3/5. What is cos(x)?

**Options**
- A — 2/5
- B — 3/4
- C — 4/5
- D — 5/3

**Proposed keyed answer:** C

**Explanation**  
Using sin²(x) + cos²(x) = 1 gives cos²(x) = 16/25; the acute-angle condition makes cosine positive, so cos(x) = 4/5.

**Declared misconception mapping**
- A — `formula_selection`
- B — `arithmetic_slip`
- D — `formula_selection`

**Reviewer decision:** PENDING  
**Reviewer:** —  
**Review date:** —  
**Disposition rationale:** —  
**Required revisions:** —  
**Review reference:** —

---

## Candidate 3 — Speed versus velocity

**Item:** `scalar-vector-speed-velocity-distinction@1`  
**Concept:** `math.vector.scalar-vector`  
**Objective:** `vector-speed-velocity-distinction`  
**Cognitive operation:** error_detection  
**Evidence purpose:** misconception_probe  
**Representation:** text  
**Proposed difficulty:** 0.30

**Prompt**  
Which extra information is needed to turn a speed of 12 m/s into a velocity?

**Options**
- A — A direction
- B — A mass
- C — A temperature
- D — A time interval

**Proposed keyed answer:** A

**Explanation**  
Speed supplies magnitude only; velocity requires the same magnitude together with a direction of motion.

**Declared misconception mapping**
- B — `conceptual_inversion`
- C — `conceptual_inversion`
- D — `conceptual_inversion`

**Reviewer decision:** PENDING  
**Reviewer:** —  
**Review date:** —  
**Disposition rationale:** —  
**Required revisions:** —  
**Review reference:** —

---

## Candidate 4 — Resultant of opposite collinear forces

**Item:** `vector-resultant-opposite-directions@1`  
**Concept:** `math.vector.resultant`  
**Objective:** `vector-resultant-collinear-opposite`  
**Cognitive operation:** application  
**Evidence purpose:** misconception_probe  
**Representation:** quantitative  
**Proposed difficulty:** 0.40

**Prompt**  
A 9 N force acts east and a 4 N force acts west along the same line. What is the resultant force?

**Options**
- A — 5 N east
- B — 5 N west
- C — 13 N east
- D — 13 N west

**Proposed keyed answer:** A

**Explanation**  
Opposite collinear forces subtract in magnitude, and the larger force is eastward, so the resultant is 5 N east.

**Declared misconception mapping**
- B — `sign_error`
- C — `rule_outside_domain`
- D — `rule_outside_domain`

**Reviewer decision:** PENDING  
**Reviewer:** —  
**Review date:** —  
**Disposition rationale:** —  
**Required revisions:** —  
**Review reference:** —

---

## Candidate 5 — Vertical vector component

**Item:** `vector-components-vertical-thirty-degrees@1`  
**Concept:** `math.vector.components`  
**Objective:** `vector-resolve-y-component`  
**Cognitive operation:** application  
**Evidence purpose:** application  
**Representation:** quantitative  
**Proposed difficulty:** 0.50

**Prompt**  
A 20 N vector is directed 30° above the horizontal. What is its vertical component?

**Options**
- A — 10 N
- B — 10√3 N
- C — 20 N
- D — 40 N

**Proposed keyed answer:** A

**Explanation**  
The vertical component is opposite the 30° angle, so it equals 20 sin(30°) = 10 N.

**Declared misconception mapping**
- B — `representation_misread`
- C — `formula_selection`

**Reviewer decision:** PENDING  
**Reviewer:** —  
**Review date:** —  
**Disposition rationale:** —  
**Required revisions:** —  
**Review reference:** —

---

## Candidate 6 — Constant velocity and acceleration

**Item:** `kinematics-constant-velocity-zero-acceleration@1`  
**Concept:** `physics.kinematics.speed-velocity-acceleration`  
**Objective:** `kinematics-constant-velocity-acceleration`  
**Cognitive operation:** error_detection  
**Evidence purpose:** misconception_probe  
**Representation:** text  
**Proposed difficulty:** 0.35

**Prompt**  
An object moves in a straight line at a constant velocity of 8 m/s. What is its acceleration?

**Options**
- A — 0 m/s²
- B — 8 m/s²
- C — 64 m/s²
- D — It cannot be determined without the distance.

**Proposed keyed answer:** A

**Explanation**  
Acceleration measures change in velocity; a constant velocity has no change in magnitude or direction, so acceleration is zero.

**Declared misconception mapping**
- B — `conceptual_inversion`
- D — `prerequisite_gap`

**Reviewer decision:** PENDING  
**Reviewer:** —  
**Review date:** —  
**Disposition rationale:** —  
**Required revisions:** —  
**Review reference:** —

---

## Candidate 7 — Horizontal launch acceleration components

**Item:** `motion-plane-horizontal-launch-accelerations@1`  
**Concept:** `physics.kinematics.motion-in-plane`  
**Objective:** `motion-plane-component-accelerations`  
**Cognitive operation:** error_detection  
**Evidence purpose:** misconception_probe  
**Representation:** text  
**Proposed difficulty:** 0.45

**Prompt**  
A ball is launched horizontally and air resistance is ignored. Which acceleration components act while it is in flight?

**Options**
- A — Zero horizontal acceleration and downward gravitational acceleration
- B — Forward horizontal acceleration and zero vertical acceleration
- C — Equal horizontal and vertical accelerations
- D — Zero acceleration in both directions

**Proposed keyed answer:** A

**Explanation**  
With air resistance ignored, gravity is the only acceleration and acts vertically downward; the horizontal acceleration is zero.

**Declared misconception mapping**
- B — `component_confusion`
- C — `component_confusion`
- D — `component_confusion`

**Reviewer decision:** PENDING  
**Reviewer:** —  
**Review date:** —  
**Disposition rationale:** —  
**Required revisions:** —  
**Review reference:** —

---

## Candidate 8 — Projectile at highest point

**Item:** `projectile-highest-point-components@1`  
**Concept:** `physics.kinematics.projectile-motion`  
**Objective:** `projectile-apex-components`  
**Cognitive operation:** error_detection  
**Evidence purpose:** misconception_probe  
**Representation:** text  
**Proposed difficulty:** 0.50

**Prompt**  
Ignoring air resistance, which statement is true at the highest point of a projectile's flight?

**Options**
- A — Both horizontal and vertical velocity are zero.
- B — Vertical velocity is zero while horizontal velocity remains nonzero.
- C — Horizontal velocity is zero while vertical velocity remains upward.
- D — Acceleration is zero because the projectile momentarily stops rising.

**Proposed keyed answer:** B

**Explanation**  
At the highest point the vertical velocity is momentarily zero, but horizontal velocity remains constant and gravity still accelerates downward.

**Declared misconception mapping**
- A — `component_confusion`
- C — `component_confusion`
- D — `conceptual_inversion`

**Reviewer decision:** PENDING  
**Reviewer:** —  
**Review date:** —  
**Disposition rationale:** —  
**Required revisions:** —  
**Review reference:** —

---

## Corpus-level review after individual decisions

After all eight items have individual dispositions, perform one final corpus review before promotion:

- confirm no approved item is an exact or near duplicate of an existing released item;
- confirm every governed concept would have at least two independently reviewed, quality-passing released items after promotion;
- confirm the combined released bank still contains the required evidence purposes and mapped 2026 curricula;
- confirm item difficulty and evidence-purpose distribution are not accidentally concentrated in one narrow pattern;
- confirm all approved items have stable review references;
- confirm rejected or superseded candidate versions cannot be selected by production code;
- confirm generated/parametric items remain outside verified evidence unless separately instance-verified.

## Promotion rule

Only items with an **APPROVE** decision and durable review evidence may be copied into the production assessment bank. Promotion must be a separate explicit code change that:

1. sets `reviewStatus: approved`;
2. records the approved lifecycle transition and durable `reviewRef`;
3. places the approved item in the production bank;
4. activates the stronger H2.3 corpus threshold only when the actual released bank satisfies it;
5. passes item quality, corpus duplicate/coverage gates, full repository CI, browser release gates, deployed golden transactions and Vercel on the exact promotion head.

Until that promotion change is merged, the production H2.2 bank remains authoritative.