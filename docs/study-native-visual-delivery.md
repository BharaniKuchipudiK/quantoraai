# Study native visual delivery

Issue #677, following the #673 per-message renderer repair and #679 native
circuit vertical. Study now has one governed per-message representation route
for both native labs and supported static/micro visuals; this is still not a
claim of universal animated subject coverage.

## One delivery path

The existing Active Learning Context and capability resolver remain the semantic
authority. Each supported capability now names a delivery class and, for a
static/micro visual, a deterministic renderer-safe caption. The public
per-message Study metadata carries that same renderer kind, delivery class and
caption through the existing API/SSE/session path.

Native labs remain owned by `shared/study-native-labs.js`. Static and micro
visuals are rendered directly from the server-selected contract in
`StudyMarkdown`; the client validates that the caption resolves to the selected
existing renderer before showing it. There is no downstream topic re-inference.
If the model omits the picture tag, emits duplicate/competing visual tags, or
claims the text interface cannot show a supported static visual, the routed
visual still wins. A renderer/caption mismatch fails closed instead of drawing
something else.

Structured renderers are intentionally narrower than keyword matching:
fraction bars require concrete valid fractions, before/after requires both
states, process flow requires explicit steps, timeline requires at least two
years, and number line requires a numeric range. Generic photosynthesis,
generic geometry, generic chemistry reaction, timeline, process, fraction or
number-line requests are not advertised as covered by a renderer that cannot
faithfully draw them.

## Coverage matrix

| Representative family | Renderer | Delivery class | Current guarantee |
|---|---|---|---|
| Newton/force/vector diagram | `physics-motion` | `static_diagram` | Server-selected static visual is delivered even if model omits its tag |
| Newton third law | `newton-lab` | `timed_animation` | Existing timed push-apart interaction |
| Linear function interactive request | `linear-function-lab` | `interactive_lab` | Existing prediction/control/run graph interaction |
| Simple resistive DC loop | `circuit-lab` | `timed_animation` | Timed current markers plus Play/Pause/open/reconnect/reset and numeric controls |
| Electricity/EMF | `electricity-circuit` | `static_diagram` | Server-selected static diagram |
| Electric/magnetic field | `field-lines` | `static_diagram` | Server-selected field diagram |
| Pythagoras/right triangle | `geometry-construction` | `static_diagram` | Server-selected right-triangle diagram |
| Algebra equation/balance | `algebra-balance` | `static_diagram` | Server-selected balance/transformation diagram |
| Cell membrane/nucleus/organelle | `biology-cell` | `static_diagram` | Server-selected cell diagram; broader biology is not claimed |
| Covalent/shared-electron bond | `chemistry-bond` | `static_diagram` | Server-selected bond diagram; generic reaction/acid-base coverage is not claimed |
| Graph semantics | `graph` | `static_diagram` | Server-selected graph/coordinate visual |
| Explicit process steps | `process-flow` | `static_diagram` | Only when concrete ordered steps are available |
| Explicit dated timeline | `timeline` | `static_diagram` | Only with at least two concrete years |
| Explicit numeric number line | `number-line` | `static_diagram` | Only with a concrete range |
| Concrete fraction/proportion | `fraction-model` | `micro_visual` | Values are parsed and equivalence is checked before rendering |
| Concrete state transition | `before-after` | `micro_visual` | Both states are required before rendering |
| Unsupported concept | none | none | Honest prose fallback; no fake visual |

The operator coverage report exposes request class, renderer kind, delivery
class and availability without learner text or render captions.

## Circuit model and accessibility

For the closed one-loop circuit, I = ε/(R+r), terminal voltage = ε−Ir, load
power = I²R, and source power = load power + internal power. Opening the return
wire sets sustained DC current and load power to zero, not the battery terminal
voltage. Pause stops only the illustration. The displayed lamp is an ohmic-load
model; markers illustrate conventional current, not electron trajectories or
measured speed. Switching delays, field propagation and filament heating are
not modeled.

Movement starts only on request and stops while hidden/offscreen or unmounted.
Reduced-motion users have explicit position stepping. Controls have text labels,
keyboard operation, touch-sized targets and light/dark styles. Concept-scoped
interaction observations are optional, bounded and observation-only; no visual
view or manipulation becomes mastery evidence.

## Release evidence

#679 proved the native circuit on desktop/mobile, light/dark and reduced-motion
and against the exact production deployment. This static-delivery increment adds
cross-layer tests from Study interpretation -> public per-message metadata ->
client renderer validation, plus fail-closed tests for unsupported or malformed
contracts. Existing representation browser gates continue to prove the actual
static renderer families.

Do not close #677 until the remaining authenticated live-model Study production
journey is recorded. A green unit test is not a production receipt; record exact
CI head and production SHA in the final PR.
