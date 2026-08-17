# Presentation negative golden: never ship this pattern

This file captures the failure class exposed by the August 2026 AI travel-agent presentation review. It is a regression contract, not a design template.

A consulting/executive deck must never pass the release gate when it exhibits the following combination:

- question/topic headline instead of an assertion-led takeaway (for example, “Should You Build an AI Travel Agent?”);
- decorative stock photography used as visual filler rather than sourced evidence;
- generic Pros / Cons / Recommendation card structure without an analytical argument;
- weak canvas utilization where the dominant visual area does not carry decision-support information;
- no explicit governing insight, evidence boundary, recommendation, decision ask, or action path;
- tiny card copy carrying the real substance while decorative elements dominate the slide.

The automated server-side gate now rejects the machine-checkable parts of this pattern: weak/question headlines, insufficient semantic density, unsourced imagery, weak comparisons, missing executive summary / analytical composition, unsupported quantitative evidence, and missing decision/action closure.

Rendered-slide visual QA remains a separate benchmark concern; passing the automated gate is necessary but not sufficient for claiming consulting-grade quality.
