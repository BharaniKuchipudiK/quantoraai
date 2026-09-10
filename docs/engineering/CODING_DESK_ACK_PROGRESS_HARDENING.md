# Coding Desk: acknowledgement and progress hardening

Scope: first slice of the 2026-09-10 preview investigation. Preserve the working
application; do not modify its files, HTML/React routing, compiler, sandbox,
model-selection ladder, retry budgets, database or deployment policy.

## Acknowledgements are not file-write permission

The existing build-session classifier now recognizes a bounded, whole-message
acknowledgement grammar. It does not match a positive word embedded in an edit,
question, negation, file name or instruction. `Excellent work` stops locally;
`Excellent work — now add an engineer filter` retains the normal build path.

The existing Coding Turn Planner returns through useChatStream's existing local
interrupt/reply exit. A plain `pass` would not be sufficient: the later lane
planner can reclassify it, and the build contract can then punish the absence
of files. No new model call, routing mechanism or persistent acknowledgement
state is introduced. The saved plan retains its non-coding meaning when read
back by the skill/proof path. Keeping the workspace visible is separate from
classifying the message as a refinement.

This is not a general conversation classifier. Existing `yes`, `proceed`,
`continue`, intake acceptance and ordinary question handling are deliberately
unchanged. A general pending-action authorization contract remains separate
work; this PR does not claim to implement it.

## Missing progress is unknown, not zero

AiStudio currently passes the observed execution label and elapsed clock, but
not the structured byte/file counters. Preserve that label. When counters are
missing or invalid, the secondary line reports elapsed time only, without
asserting silence or suggesting a retry. A measured numeric zero still reaches
the existing waiting/stall behavior. Known files can be reported without
inventing zero bytes; compilation can be reported without inventing zero files.

This fixes the screenshot's contradiction without parsing presentation text or
adding a second stream state store. Full per-attempt structured progress wiring
is not claimed here. The retained mission is labelled `Project`, not `Building`;
the observed execution label, rather than a historical goal, describes activity.

## Regression evidence and release gate

- Fail-before/pass-after reproduction: `Excellent work` in an active build and
  an observed `1 KB received` execution label without secondary counters.
- Whole-message positive/negative acknowledgement cases, preserved confirmations
  and question paths, unknown/invalid/zero/positive progress counters.
- Real planner -> persisted snapshot -> skill/proof integration tests, including
  preserving the current VFS and keeping rather than refining the workspace.
- The existing guided-intake browser gate now continues through two
  acknowledgements and a real mixed praise/edit request. It checks completed
  responses, model-call counts, the actual preview, and a DOM sentinel that
  would be lost on remount. Existing intake assertions remain in place.

Local dependency-free tests and syntax checks are not deployed verification.
Require the exact PR head's full CI, existing browser gate and Vercel Preview
before merge. No CI step, workflow, assertion or security setting is weakened.

Next isolated slices: HTML/React routing and actionable compiler diagnostics;
then revision-bound completion, bounded preview startup/recovery and access to
the last working preview. The diagnostic ZIP is not a production patch.
