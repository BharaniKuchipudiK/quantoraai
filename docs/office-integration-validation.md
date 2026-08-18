# Office integration validation

This temporary integration branch combines the tested Office system changes from PR #157 and PR #158 so the release can be validated as one user lifecycle before either feature PR is merged to production.

Release gate:

1. Create PowerPoint from approved briefing.
2. Provider/model provenance is recorded on the artifact.
3. Presentation structural, communication and readability gates pass before compilation.
4. PPTX compiles and OOXML/preview fingerprint verification passes.
5. Verified preview remains in the right-side workspace; no duplicate Office popup action.
6. Office messages do not expose developer source-code controls.
7. During refinement the last verified artifact remains visible until the new revision verifies.
8. Refined artifact produces a new verified fingerprint and downloadable PPTX.
9. Mandatory Office synthetic tests remain green.

This file exists only to make the integration intent explicit; it is not required in the final production merge.
