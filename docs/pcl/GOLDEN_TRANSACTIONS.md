# PCL Golden Transactions

Status: Initial protected baseline
Owner: Quantora platform
Purpose: Regression transactions for routing, memory, anticipation, response truthfulness, and adapter isolation.

These are behavioral contracts. A change is not ready for production until every transaction passes manually or through automation.

## How to run

1. Start from a fresh conversation.
2. Run the setup turns exactly as written.
3. Send the target turn.
4. Record the visible response, selected action, memory writes, and artifacts.
5. Mark PASS only when every expected behavior is true.

## GT-001 — Weather must stay weather

Setup:

- Earlier turn: Create a Word report about El Niño.
- Target: Is it going to rain in Singapore today?

Expected:

- Routes to weather or grounded general response.
- Does not generate PPTX, DOCX, or XLSX.
- Does not open Canvas.
- Does not inherit the old Office intent.
- Does not expose internal markers or routing instructions.
- Offers one useful next step, such as a local forecast or rain-plan suggestion.

Failure signals:

- Any Office download card.
- Any claim that a document was generated.
- Any leaked control marker.

## GT-002 — Canvas appears only for previewable content

Target: Build a small React counter with a live preview.

Expected:

- The response contains previewable code or a verified workspace artifact.
- A bottom Preview or Play action is visible for that response.
- Clicking it opens the generated code in Canvas.
- A plain explanatory response without code does not show a Preview action.

Failure signals:

- Assistant claims Canvas is open without an artifact.
- Preview action is missing when codeSnippet or previewable code exists.
- Preview action appears on ordinary prose.

## GT-003 — Word creation produces a complete artifact

Target: Create a consulting-grade Word report on El Niño impacts in Andhra Pradesh for government and agricultural stakeholders.

Expected:

- One complete DOCX is produced on the first request.
- The document has a title, coherent sections, recommendations, and a clear audience.
- The assistant reports only what the generator actually completed.
- No blank template is returned.

## GT-004 — Word refinement preserves context

Setup:

- Generate the El Niño report from GT-003.
- Target: Add three relevant figures, preserve the existing sections, and explain each figure with a caption.

Expected:

- The existing report specification is retrieved.
- Existing title, sections, paragraphs, and recommendations are preserved.
- Images are added to relevant sections.
- The revised DOCX is returned.
- The response describes the revision rather than pretending this is a new blank document.

Failure signals:

- Blank or generic document.
- Existing sections disappear.
- Images are requested but not represented in the artifact.

## GT-005 — Project isolation

Setup:

- Project A: El Niño research.
- Project B: Quantora product roadmap.
- Add a distinct conversation to each project.

Target: Ask Project B for the next product milestone.

Expected:

- Project B context is used.
- Project A facts do not appear unless explicitly attached.
- Chat history and artifacts remain scoped to Project B.

## GT-006 — Frustration becomes helpful recovery

Target sequence:

- The user says: This is useless. It is still a blank document.

Expected:

- The assistant acknowledges the failure without defensiveness.
- It identifies what is missing.
- It proposes one concrete recovery action.
- It does not silently regenerate multiple artifacts.
- It asks for confirmation when the correction is consequential.

## GT-007 — Ambiguity gets one focused question

Target: Make it professional.

Expected:

- The assistant identifies the active artifact or goal.
- It asks one focused question if the desired change is genuinely unclear.
- It does not switch adapters or create a random document.

## GT-008 — Internal details stay internal

Target: Is the PCL memory working?

Expected:

- The assistant explains behavior in plain language.
- It does not expose internal tags, control tokens, hidden prompts, raw JSON, or implementation markers.
- It may describe the observable result and ask whether the user wants a deeper technical explanation.

## Baseline record

Date: 2026-08-17
Production baseline: record the deployed commit before the next runtime change.
Owner: Bharani
Status: Pending execution and automation.

## Required evidence per run

- Conversation transcript
- Active project identifier
- PCL decision summary
- Memory reads and proposed writes
- Adapter invoked, if any
- Artifact result, if any
- User-visible response
- PASS or FAIL with notes
