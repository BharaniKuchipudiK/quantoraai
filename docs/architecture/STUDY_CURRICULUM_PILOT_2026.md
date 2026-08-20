# Study Curriculum Pilot 2026 v1

This pilot proves that Quantora can use one canonical concept graph across different education systems and identify the learning bridge between them.

## Scope

The seed is intentionally small: nine concepts spanning trigonometry, vectors and kinematics.

Official 2026 overlays:

1. Singapore GCE O-Level Additional Mathematics (4049)
2. Singapore GCE O-Level Physics (6091)
3. India JEE Main Paper 1 (B.E./B.Tech.)

No proprietary question-bank, textbook chapter or teaching-provider content is ingested.

## Truth boundary

Official documents establish that a concept belongs to a curriculum/exam objective. Quantora does **not** claim that official syllabuses prescribe our prerequisite order.

Therefore:

- curriculum records and mappings carry official source references
- canonical concept labels/descriptions are `quantora_authored`
- prerequisite and transfer relationships are explicitly `derived`
- `examWeight` is left null because no calibrated concept-level exam weight is being claimed
- pilot `depth` remains neutral at 0.5 until a defensible cross-curriculum calibration exists

## Why this chain

Singapore O-Level Additional Mathematics covers trigonometric functions and identities. Singapore O-Level Physics covers scalar/vector quantities, graphical vector resultants, speed/velocity/acceleration and motion graphs.

JEE Main adds vector components in two/three dimensions and physics motion in a plane/projectile motion.

The derived bridge is:

`Trigonometric functions + Scalar/vector foundations -> Vector components -> Motion in a plane -> Projectile motion`

This creates a useful advisor test: a learner coming from the Singapore O-Level foundations and targeting JEE Main should be shown **Vector components** as the earliest curriculum bridge, not told simply that “projectile motion is not in your current syllabus.”

## Curriculum Bridge Analyzer

`buildStudyCurriculumBridge()` compares curriculum coverage only. It produces:

- concepts already covered by source curricula
- target concepts not present in the source curricula
- direct prerequisite coverage for each missing target concept
- blocking prerequisite concepts
- downstream target concepts unlocked by each bridge concept
- a deterministic first bridge recommendation

Important: curriculum coverage is **not** learner mastery. PCL must combine the bridge with the learner mastery/evidence graph before advising that a student actually knows a prerequisite.

## Pilot source documents

- Singapore Additional Mathematics 4049 (2026): `https://isomer-user-content.by.gov.sg/334/f4aaac1d-0d7f-492b-88d9-43e392418490/4049_y26_sy.pdf`
- Singapore Physics 6091 (2026): `https://isomer-user-content.by.gov.sg/334/42ee79d0-bb13-43f5-94ab-629729f88aa0/6091_y26_sy.pdf`
- JEE Main 2026 syllabus: `https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf`

## Next

1. add CBSE 2026–27 Class XI Mathematics and Physics as the school-to-JEE Indian bridge
2. add NEET 2026 overlays without duplicating shared Physics/Chemistry/Biology concepts
3. add curriculum-version ingestion/review tooling so future syllabus updates are diffed rather than blindly overwritten
4. combine curriculum bridge readiness with learner mastery, retention and misconception evidence
5. expose the resulting next-best concept through PCL Study Advisor conversation

Core rule:

**Official sources tell us what is required. Quantora's concept graph explains how knowledge connects. Learner evidence tells us what this student actually knows. PCL combines all three before advising what to do next.**
