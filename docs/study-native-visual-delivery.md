# Study native visual delivery — circuit repair

Issue #677, following the #673 per-message renderer repair. This change is a
native circuit vertical plus shared lab-delivery hardening, not universal
animated subject coverage.

## One delivery path

The existing active-learning context and capability resolver choose the
representation. `shared/study-native-labs.js` supplies the same renderer-to-tag
mapping to the server directive and client parser. The existing conversation
metadata/SSE/session path carries the selected route. StudyMarkdown renders its
required native lab even when the model returns prose without a tag. Equivalent
tags do not duplicate it, and later conversation topics do not erase it.

A scoped presentation correction removes a generic first-person text-desk
simulation denial only under a valid supported lab contract. Quoted material,
fenced code, unsupported routes and scientific model limitations stay intact.
A lazy-chunk error is contained; the written lesson remains available.

## Coverage, not implied capability

| Family | Delivery | Actual interaction |
|---|---|---|
| Simple resistive DC loop | `circuit-lab` | Timed current markers; Play/Pause, open/reconnect/reset, source/load/internal resistance controls |
| Newton third law | `newton-lab` | Existing timed push-apart illustration |
| Linear function | `linear-function-lab` | Existing prediction/control/run/graph comparison; not a time-evolving physical simulation |
| Electricity/EMF static diagram | `electricity-circuit` | Existing annotated diagram remains the ordinary visual request path |
| Other registered static families | Existing routes | Not newly claimed as animated by this change |
| AC/reactive/network/field-propagation/neural circuits | Not covered by DC lab | Must not be assigned the one-loop model |

## Circuit model and accessibility

For the closed loop, I = ε/(R+r), terminal voltage = ε−Ir, load power = I²R,
and source power = load power + internal power. Opening the return wire sets
sustained DC current and load power to zero, not the battery terminal voltage.
Pause stops only the illustration. The displayed lamp is an ohmic-load model;
markers illustrate conventional current, not electron trajectories or measured
speed. Switching delays, field propagation and filament heating are not modeled.

Movement starts only on request and stops while hidden/offscreen or unmounted.
Reduced-motion users have explicit position stepping. Controls have text labels,
keyboard operation, touch-sized targets and light/dark styles. Concept-scoped
interaction observations are optional, bounded and observation-only; unknown
original identity is not attributed to the current lesson. No evidence writes.

## Release evidence

The existing blocking Electricity browser gate imports the native-lab proof.
It exercises prose-only denial responses, actual marker/skater motion, pause,
open/reconnect/reset, numeric controls, linear graph interaction, duplicates,
subject changes, saved-message reload, mobile/light/dark/reduced-motion and a
failed lazy chunk. API tests cover the real routing-to-public-metadata-to-parser
path. Browser responses are deterministic fixtures, not live-model quality proof.

Do not mark #677 closed until the remaining static-family delivery coverage and
live production journey checks are complete. A green unit test does not certify
a production deployment; record exact CI head and production SHA in the PR.
