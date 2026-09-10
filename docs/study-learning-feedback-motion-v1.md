# Study Learning Feedback Motion v1 (roadmap PR 11)

Extends the existing `StudyReinforcement` component and `study-reinforcement.js` policy. There is no new notification bus, achievement store, learner model, API, or animation dependency.

## Authoritative input

The component is mounted by `StudyTutorWorkspace` and receives only the result of the existing authenticated `gradeStudyAssessment` path. An acknowledged result must explicitly be recorded, non-duplicate, correct, and have a supported evidence kind and server evidence-concept identity. Interaction signals, generated prose, self-confidence, clicks, and completed planning blocks never trigger recognition.

Feedback is display-only. It cannot update mastery, diagnoses, schedules, working state, or persistence. A server-confirmed state transition can be acknowledged; the UI cannot create that transition.

## Recognition

One acknowledgement is selected per new item/attempt, in this order:

1. Previously observed confirmed misconception becomes cleared with the matching resolved code and newer evidence.
2. Successful delayed-retention grade, with a positive bounded server delay and no observed hints.
3. Successful transfer grade into a distinct server-designated target and no observed hints.
4. Previously observed understanding becomes verified, supported by the server's established mastery result. This says nothing about delayed retention.
5. Three distinct fresh no-hint checks answered correctly in the current session/concept. This is continuation feedback, not a mastery score or a daily streak.
6. Successful fresh retrieval with no observed hints.

Ordinary correct answers remain quiet. A sticky `lastResolvedCode`, a first-loaded verified profile, wrong answers, or repeated grades do not create fresh congratulations. Missing hint provenance suppresses no-hint recognition; batch results currently have no per-item hint provenance here and therefore receive no independent-retrieval/retention/transfer acknowledgement.

## Lifecycle and accessibility

The grade captures its session/concept scope and hint depth before the outcome resets temporary hint state. Scope and item/attempt identity are checked during render as well as in the pure display transition. Only a compact prior server projection is retained for comparison; answer text and the full learner model are not copied.

At-end assessments consume grades silently. Opening/closing the assessment or revealing the summary cannot replay those grades. Loading another question clears the current acknowledgement, not its replay protection. Display bookkeeping is capped at 128 unique attempts/items per mounted scope; after that, additional acknowledgements are suppressed rather than evicting ids and replaying old praise.

A persistent polite, atomic live region carries the text. Feedback does not take focus; the dismiss control is keyboard accessible. The existing 5.2-second dismissal timer is tied to stable event identity and cleaned up on change/unmount, not restarted by a new result object. Card entry and icon pulse are finite and enabled only for `prefers-reduced-motion: no-preference`; reduced motion removes animations and transitions from the entire feedback subtree.

## Verification

`src/lib/study-reinforcement.test.js` covers evidence eligibility, transitions, duplicates, scope isolation, hidden feedback, bounded memory, privacy, determinism, and the component wiring/cleanup contracts. The existing blocking onboarding/reinforcement browser journey also exercises transfer, retrieval, retention, keyboard dismissal, normal/reduced motion, duplicate suppression, and an at-end assessment.

No backend, grading contract, curriculum, mastery-estimator, database/schema, Study Hub lifecycle, or other workspace changes are part of PR 11. Session Continuity v2 and closed-loop integration remain later roadmap phases.
