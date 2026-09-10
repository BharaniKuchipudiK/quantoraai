// Shared delivery catalogue, not a second pedagogy or mastery authority.
// A server-selected renderer must map to the same native tag on both runtimes.
const LABS = Object.freeze({
  'newton-lab': Object.freeze({
    kind: 'newton-third-law',
    instruction: 'render the native Newton third-law interaction by including exactly one <quantora-study-lab kind="newton-third-law" /> tag; do not replace it with prose frames or claim a video was streamed',
  }),
  'linear-function-lab': Object.freeze({
    kind: 'linear-function',
    instruction: 'render the governed native Linear Function lab by including exactly one <quantora-study-lab kind="linear-function" /> tag; this is the supported Study workspace for this turn, so do not replace it with a static graph or prose-only description',
  }),
  'circuit-lab': Object.freeze({
    kind: 'simple-dc-circuit',
    instruction: 'render exactly one <quantora-study-lab kind="simple-dc-circuit" /> tag. This native DC circuit has Play/Pause, Open return wire, Reconnect, Reset and adjustable source/load/internal resistance. Ask one prediction, then refer to the actual controls. Do not claim this text desk cannot show an animation, invent a video, or substitute a bicycle-chain essay. Markers show conventional-current direction, not electron trajectories or measured speed. The lamp is an ohmic-load approximation; switching shows steady states, not electromagnetic propagation or thermal transients',
  }),
});

export function studyNativeLabForRenderer(rendererKind) {
  return typeof rendererKind === 'string' && Object.prototype.hasOwnProperty.call(LABS, rendererKind)
    ? LABS[rendererKind] : null;
}
