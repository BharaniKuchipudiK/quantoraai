/*
 * Which user journeys have a gate, and which do not — as a number.
 *
 * WHY THIS EXISTS
 *
 * On 2026-09-05 a user attached four documents to one chat turn and every
 * one was dropped in the browser as "(not a readable image)". The turn that
 * "ended without a reply" carried a reference nobody could resolve. Neither
 * was a flake. They were journeys no gate had ever exercised, and everything
 * that failed in front of that user that day was in one of those. Four
 * journeys were guarded by the deployed golden; the platform has dozens.
 *
 * "Stable" cannot be a feeling. This file names every journey a user can
 * take, the gates that exercise each one, and the floor that count may not
 * fall below. scripts/journey-gate-inventory-gate.mjs proves the file is true
 * — every gate it names exists and runs in CI, every gate on disk guards a
 * named journey, the number matches the floor — and prints the number last,
 * so the next person reads a count, not a claim.
 *
 * LEVELS, in rising order of what they prove
 *
 *   deterministic  a unit or contract test, or a gate with no browser and no
 *                  model. Proves the helpers behind a journey. Does not prove
 *                  the journey: the attachments path had passing helpers on
 *                  the day it dropped four files.
 *   browser        headless Chromium through the real rendered UI, upstreams
 *                  stubbed, no model. Proves the journey on this build.
 *   deployed       the same against a live deployment; real model turns where
 *                  the row says so. Proves the journey in production.
 *
 * A journey is PROVEN when a browser or deployed gate exercises it, HELPERS
 * when only deterministic tests touch it, and NOTHING when no gate names it.
 * docs/engineering/RELEASE_STANDARD.md Gate 2 already says a changed journey
 * needs browser coverage; this is the ledger that makes the standard checkable.
 *
 * HOW TO CHANGE IT
 *
 *   - Built a new journey? Add a row, even with no gates. An unlisted journey
 *     is the one that fails in a screenshot; a listed one is a number.
 *   - Added a gate? Name it on the journey it guards. The gate script fails
 *     on a gate file nothing claims, because a gate that guards no named
 *     journey is either guarding an unlisted one or guarding nothing.
 *   - Raised the proven count? Raise FLOORS to match. The gate fails when the
 *     floor is stale in either direction, so the number in this file is the
 *     number.
 *   - Then `node scripts/journey-gate-inventory-gate.mjs --write` regenerates
 *     docs/engineering/JOURNEY_GATE_INVENTORY.md. The gate fails while that
 *     file is stale, so what a human reads is what the machine counted.
 *
 * Server files are named as paths (api/deploy.ts), never as URL routes: the
 * dead-control and served-route gates read quoted route strings out of src/,
 * and a ledger that mentioned every route would make every route look called.
 */

export const GATE_LEVELS = Object.freeze(['deterministic', 'browser', 'deployed']);

/*
 * Floors that may only rise. Both numbers are recomputed by the gate from the
 * rows below and compared to these; a drop fails, and so does a stale floor,
 * so the count in this file is always the true one.
 */
export const FLOORS = Object.freeze({ proven: 38, deployed: 13 });

/*
 * Gate files on disk that no journey claims, each with the reason. Empty is
 * the goal; an entry here is a recorded decision, never a silent skip.
 */
export const KNOWN_UNCLAIMED_GATES = Object.freeze([]);

const journey = (row) => Object.freeze({
  kind: 'user',
  hooks: [],
  serves: [],
  modelTurn: false,
  note: '',
  // A parked journey is one a person cannot reach in this build (its surface
  // is behind a flag, see src/lib/platform-surfaces.js): counted on its own
  // line, never among the unproven, and its note must say why it is parked.
  parked: false,
  ...row,
  gates: Object.freeze({
    deterministic: Object.freeze([...(row.gates?.deterministic || [])]),
    browser: Object.freeze([...(row.gates?.browser || [])]),
    deployed: Object.freeze([...(row.gates?.deployed || [])]),
  }),
});

export const JOURNEYS = Object.freeze([
  // ── front door and account ──────────────────────────────────────────────
  journey({
    id: 'landing-enter-studio',
    area: 'front door',
    name: 'Land on the marketing page and enter Studio',
    entry: 'src/components/LandingPage.jsx',
    hooks: ['data-quantora-enter-studio', 'data-quantora-login'],
    gates: {
      deterministic: ['src/lib/deployed-gate-contract.test.js'],
      browser: ['scripts/workspace-contract-browser-gate.mjs'],
      deployed: ['golden:calculator'],
    },
    note: 'Every browser gate enters through scripts/e2e-enter-studio.mjs; the workspace contract stands for all of them.',
  }),
  journey({
    id: 'guest-build-demo',
    area: 'front door',
    name: 'Watch the guest build demo before signing in',
    entry: 'src/components/GuestBuildPreview.jsx',
    hooks: ['data-quantora-login'],
    gates: { deterministic: ['src/lib/deployed-gate-contract.test.js'] },
    note: 'The contract test pins that the hero CTA opens auth rather than a guest animation; the demo itself has never been rendered by a gate.',
  }),
  journey({
    id: 'sign-in-email-password',
    area: 'front door',
    name: 'Sign up or sign in with email and password',
    entry: 'src/components/AuthModal.jsx',
    hooks: ['data-quantora-auth-modal'],
    serves: ['api/auth.ts'],
    gates: {
      deterministic: [
        'api/_lib/password.test.ts',
        'api/_lib/auth-response.test.ts',
        'api/_lib/auth-privacy.test.ts',
        'api/_lib/session-cookie.test.ts',
        'src/lib/auth-modal-styles.test.js',
      ],
      browser: ['scripts/front-door-browser-gate.mjs'],
    },
    note: 'front-door-browser-gate types into the modal: a wrong password is refused with the server\'s own sentence, the right one signs in, the hub offers the Studio (and only the modules this build shows), and the desk header names the person. The server is stubbed at the wire in the shapes auth-login and auth-session answer; the cookie is real (2026-09-06).',
  }),
  journey({
    id: 'sign-in-google',
    area: 'front door',
    name: 'Sign in with Google',
    entry: 'src/App.jsx',
    hooks: ['data-quantora-auth-modal'],
    serves: ['api/auth.ts'],
    gates: { deterministic: ['api/_lib/auth-env.test.ts', 'api/_lib/auth-response.test.ts'] },
    note: 'Provider configuration and account linking are tested; the button, the redirect and the session that follows are not.',
  }),
  journey({
    id: 'sign-in-github',
    area: 'front door',
    name: 'Sign in with GitHub',
    entry: 'src/components/AuthModal.jsx',
    serves: ['api/auth.ts'],
    gates: {
      deterministic: ['api/_lib/auth-env.test.ts', 'api/_lib/auth-response.test.ts', 'api/_lib/github-principal.test.ts'],
    },
    note: 'Same gap as Google: the OAuth round trip has never been driven.',
  }),
  journey({
    id: 'password-reset',
    area: 'front door',
    name: 'Reset a forgotten password',
    entry: 'src/components/AuthModal.jsx',
    serves: ['api/auth.ts'],
    gates: { deterministic: ['api/_lib/auth-privacy.test.ts', 'api/_lib/password.test.ts'] },
    note: 'The public copy and the hash are tested; the request-and-confirm flow is not.',
  }),
  journey({
    id: 'session-restore-sign-out',
    area: 'front door',
    name: 'Come back still signed in, and sign out',
    entry: 'src/App.jsx',
    serves: ['api/auth.ts'],
    gates: {
      deterministic: [
        'api/_lib/session-cookie.test.ts',
        'api/_lib/session-bearer.test.ts',
        'api/_lib/session-context.test.ts',
        'src/hooks/useStudioSession.test.js',
        'src/hooks/studio-session-storage.test.js',
      ],
      browser: ['scripts/front-door-browser-gate.mjs'],
    },
    note: 'front-door-browser-gate reloads the desk and comes back signed in from the session cookie alone, then clicks Sign Out, types its confirmation word, sees the server told, and reloads to stay signed out (2026-09-06). The desktop app proves its own.',
  }),
  journey({
    id: 'desktop-sign-in-handoff',
    area: 'front door',
    name: 'Sign in to the desktop app through the browser handoff',
    entry: 'src/lib/desktop-auth-handoff.js',
    serves: ['api/auth.ts'],
    gates: {
      deterministic: [
        'api/_lib/desktop-auth.test.ts',
        'src/lib/desktop-auth-handoff.test.js',
        'shared/desktop-bridge-contract.test.js',
        'desktop/main/auth-flow.test.ts',
      ],
      browser: ['scripts/desktop-smoke-gate.mjs'],
    },
  }),
  journey({
    id: 'account-export-delete',
    area: 'front door',
    name: 'Export my data, or delete my account',
    entry: 'src/components/Header.jsx',
    serves: ['api/_lib/handlers/account.ts'],
    gates: {},
    note: 'No test opens the account handler. A deletion that fails silently, or lands on the wrong account, would be found by a user.',
  }),
  journey({
    id: 'profile-picture',
    area: 'front door',
    name: 'Set a profile picture or pick an avatar',
    entry: 'src/components/ProfilePictureEditor.jsx',
    hooks: ['data-quantora-profile-picture-entry', 'data-quantora-profile-upload', 'data-quantora-profile-avatar-choice'],
    gates: { browser: ['scripts/media-profile-browser-gate.mjs', 'scripts/workspace-contract-browser-gate.mjs'] },
  }),

  // ── chat ────────────────────────────────────────────────────────────────
  journey({
    id: 'chat-turn',
    area: 'chat',
    name: 'Ask Quantora something and read the reply',
    entry: 'src/components/AiStudio.jsx',
    hooks: ['data-quantora-assistant-prose', 'data-quantora-reply-finish', 'data-quantora-reply-finish-reason'],
    serves: ['api/pipeline.ts', 'api/_lib/chat-handler.ts'],
    modelTurn: true,
    gates: {
      deterministic: [
        'src/lib/turn-never-silent.test.js',
        'src/lib/turn-failure-sentence.test.js',
        'api/_lib/conversation-policy.test.ts',
        'api/_lib/model-quality-outcome.test.ts',
        'scripts/outcome-navigator-eval.ts',
        'scripts/studio-synthetic-test.mjs',
      ],
      browser: ['scripts/workspace-contract-browser-gate.mjs', 'scripts/code-highlight-browser-gate.mjs'],
      deployed: ['golden:guided-intake'],
    },
  }),
  journey({
    id: 'chat-attachments',
    area: 'chat',
    name: 'Attach documents or images to a turn, and see what was read',
    entry: 'src/components/AiStudio.jsx',
    hooks: ['data-quantora-attachment-chip', 'data-quantora-attachment-kind', 'data-quantora-document-reads', 'data-quantora-document-note'],
    serves: ['api/_lib/attachment-text.ts'],
    modelTurn: true,
    gates: {
      deterministic: ['api/_lib/attachment-text.test.ts', 'src/lib/chat-attachments.test.js', 'api/_lib/research-pdf-text.test.ts'],
      browser: ['scripts/attachments-browser-gate.mjs'],
      deployed: ['golden:document-grounded', 'golden:brief-with-documents'],
    },
  }),
  journey({
    id: 'failed-turn-honesty',
    area: 'chat',
    name: 'A turn that fails says so, heals once, and never ends blank',
    entry: 'src/components/AiStudio.jsx',
    hooks: ['data-quantora-last-turn-failed', 'data-quantora-mission'],
    modelTurn: true,
    gates: {
      deterministic: [
        'src/lib/turn-heal-contract.test.js',
        'src/lib/turn-recovery.test.js',
        'src/lib/coding-outcome-spine.test.js',
        'src/lib/turn-escalation.test.js',
        'src/lib/desk-edit-proof.test.js',
      ],
      browser: ['scripts/self-heal-browser-gate.mjs', 'scripts/qir-production-recovery-browser-gate.mjs', 'scripts/desk-edit-honesty-browser-gate.mjs'],
      deployed: ['golden:guided-intake', 'golden:iterate-heading'],
    },
  }),
  journey({
    id: 'decision-modal',
    area: 'chat',
    name: 'Answer the desk when it asks a clarifying question',
    entry: 'src/components/StudioDecisionModal.jsx',
    hooks: ['data-quantora-decision-modal', 'data-quantora-decision-option'],
    modelTurn: true,
    gates: {
      deterministic: ['api/_lib/intake-modal-contract.test.ts', 'src/lib/assistant-modal.test.js', 'src/lib/desk-chat-claim-filter.test.js'],
      browser: ['scripts/guided-intake-browser-gate.mjs'],
      deployed: ['golden:guided-intake'],
    },
  }),
  journey({
    id: 'plus-tools-menu',
    area: 'chat',
    name: 'Open the plus menu and pick a tool',
    entry: 'src/components/StudioToolsMenu.jsx',
    hooks: ['data-quantora-plus-trigger', 'data-quantora-plus-item'],
    modelTurn: true,
    gates: {
      deterministic: ['src/lib/studio-tools-menu.test.js'],
      browser: ['scripts/study-media-browser-gate.mjs'],
    },
    note: 'Proven for one item, the flashcards. Search, deep research and podcast have never been picked by a gate.',
  }),
  journey({
    id: 'prompt-enhance',
    area: 'chat',
    name: 'Polish the prompt with the wand',
    entry: 'src/hooks/usePromptPolish.js',
    serves: ['api/enhance.ts'],
    modelTurn: true,
    gates: {
      deterministic: ['api/_lib/prompt-enhancement.test.ts', 'src/lib/prompt-polish-guard.test.js', 'src/lib/prompt-polish-failure.test.js'],
    },
  }),
  journey({
    id: 'prompt-autocomplete',
    area: 'chat',
    name: 'Inline autocomplete while typing a prompt',
    entry: 'src/components/AiStudio.jsx',
    serves: ['api/autocomplete.ts'],
    modelTurn: true,
    gates: {},
    note: 'The endpoint is proven to refuse a blocked session and to boot (platform rows). Nothing proves a completion ever arrives in the composer.',
  }),
  journey({
    id: 'model-pick-dual-arena',
    area: 'chat',
    name: 'Pick a model, or compare two in the dual arena',
    entry: 'src/components/AiStudio.jsx',
    hooks: ['data-quantora-dual-arena'],
    serves: ['api/models.js'],
    modelTurn: true,
    gates: {
      deterministic: ['src/lib/model-routing.test.js', 'api/_lib/model-catalog.test.js', 'src/lib/no-hardcoded-model-ids.test.js'],
      browser: [
        'scripts/workspace-contract-browser-gate.mjs',
        'scripts/studio-regression-browser-gate.mjs',
        'scripts/travel-browser-release-gate.mjs',
      ],
    },
  }),
  journey({
    id: 'studio-mode-plan-build',
    area: 'chat',
    name: 'Switch Studio between plan and build',
    entry: 'src/components/StudioModeToggle.jsx',
    hooks: ['data-quantora-studio-mode', 'data-quantora-studio-mode-active'],
    gates: { deterministic: ['src/lib/studio-mode.test.js', 'src/lib/build-intent.test.js'] },
    note: 'The mode logic is tested; the toggle has never been clicked by a gate.',
  }),
  journey({
    id: 'turn-lane-planned',
    area: 'chat',
    name: 'Send a brief and have the platform decide what to make from its meaning, not from a word',
    entry: 'src/hooks/useChatStream.js',
    hooks: ['data-quantora-coding-desk-nav', 'data-quantora-workspace-new-chat'],
    modelTurn: true,
    gates: {
      deterministic: ['api/_lib/turn-planner.test.ts', 'src/lib/turn-plan-client.test.js', 'src/lib/office-intent.test.js', 'api/_lib/turn-plan-ledger.test.ts'],
      browser: ['scripts/turn-planner-browser-gate.mjs'],
      deployed: ['golden:brief-with-documents'],
    },
    note: 'Phase 7, first cut (2026-09-06): one model-owned lane per turn — build, office, advisor or chat — reconciled with the keyword rules, which are now the fallback and the corpus. A pinned desk never moves; a build the desk owns is never vetoed; a dead planner changes nothing. Second cut: every plan is recorded (turn_plan_events) and the admin dashboard reads the planner\'s share, its agreement with the rules, where it overruled them, and its latency.',
  }),
  journey({
    id: 'chat-sessions-manage',
    area: 'chat',
    name: 'Start a new chat; rename, search, archive, or file one under a project',
    entry: 'src/components/AiStudio.jsx',
    hooks: [
      'data-quantora-new-chat',
      'data-quantora-chat-rename',
      'data-quantora-sidebar-search-toggle',
      'data-quantora-sidebar-project',
      'data-quantora-sidebar-archived-toggle',
    ],
    gates: {
      deterministic: ['src/lib/project-store.test.js', 'src/lib/session-desks.test.js', 'src/lib/session-activity.test.js'],
      browser: ['scripts/desk-job-review-browser-gate.mjs', 'scripts/second-transaction-browser-gate.mjs'],
      deployed: ['golden:simple-website'],
    },
    note: 'New Chat is proven. Rename, search, archive and projects are helpers only.',
  }),
  journey({
    id: 'workspace-owns-its-chats',
    area: 'chat',
    name: 'Open a chat inside a workspace from its "+", fold its chats, and stay on that desk',
    entry: 'src/components/AiStudio.jsx',
    hooks: [
      'data-quantora-workspace-new-chat',
      'data-quantora-workspace-collapse',
      'data-quantora-workspace-chats',
      'data-quantora-sidebar-chat',
    ],
    gates: {
      deterministic: [
        'src/hooks/useStudioSession.test.js',
        'api/_lib/studio-domain-inference.test.ts',
        'api/_lib/communication/request-normalizer.test.ts',
      ],
      browser: ['scripts/coding-desk-sticky-browser-gate.mjs'],
    },
    note: 'A chat opened from a workspace is pinned to it (2026-09-06): the resolver returns the explicit desk when pinned, and the sticky gate proves a trip question in a coding chat and a money question in a Travel chat both stay put, the chat lists under its workspace, the fold hides and restores it, and leaving a Travel chat for the Coding desk does not rewrite it. Membership is also separated from routing (2026-09-06): the turn router writes inferredDomain, never studioDomain, so a top-level New Chat asking about a trip still opens the Travel desk for the turn and is never filed out of the general list — step 6 of the sticky gate asserts the sidebar lists, and turnDomainSessionPatch is held to never emit a studioDomain key.',
  }),
  journey({
    id: 'long-session-continues',
    area: 'chat',
    name: 'Keep a long session going: old turns fold into a digest, and one click continues in a new chat that carries the goal, facts and desk',
    entry: 'src/components/AiStudio.jsx',
    hooks: ['data-quantora-session-continuity', 'data-quantora-session-handover-start', 'data-quantora-sidebar-chat'],
    gates: {
      deterministic: ['src/lib/history-budget.test.js', 'src/lib/session-continuity.test.js', 'src/hooks/useStudioSession.test.js'],
      browser: ['scripts/session-handover-browser-gate.mjs'],
    },
    note: '2026-09-06: "I left out the earliest 5 messages" and a chip that opened nothing. Turns past the budget now fold into one digest; the chip is one click; the new chat opens by naming what it carried and runs the same build.',
  }),
  journey({
    id: 'fork-resume-session',
    area: 'chat',
    name: 'Fork a message, or resume where a session left off',
    entry: 'src/components/AiStudio.jsx',
    hooks: ['data-quantora-message-fork', 'data-quantora-session-continuity', 'data-quantora-sidebar-resume-chip'],
    gates: {
      deterministic: ['src/lib/session-continuity.test.js'],
      browser: [
        'scripts/studio-regression-browser-gate.mjs',
        'scripts/study-media-browser-gate.mjs',
        'scripts/travel-browser-release-gate.mjs',
      ],
    },
  }),

  // ── coding desk ─────────────────────────────────────────────────────────
  journey({
    id: 'build-from-prompt',
    area: 'coding desk',
    name: 'Build a website or app from a prompt',
    entry: 'src/components/AiStudio.jsx',
    hooks: ['data-quantora-coding-desk-nav', 'data-quantora-code-workspace', 'data-quantora-desk-job', 'data-quantora-build-job'],
    modelTurn: true,
    gates: {
      deterministic: [
        'scripts/stress/pipeline-stress.mjs',
        'src/lib/build-intent.test.js',
        'shared/build-intent-scope.test.js',
        'src/lib/build-session.test.js',
        'src/lib/coding-turn-planner.test.js',
        'src/lib/candidate-patch.test.js',
        'src/lib/outcome-state.test.js',
      ],
      browser: [
        'scripts/coding-desk-must-write-files-browser-gate.mjs',
        'scripts/second-transaction-browser-gate.mjs',
        'scripts/studio-regression-browser-gate.mjs',
        'scripts/coding-desk-sticky-browser-gate.mjs',
        'scripts/desk-edit-honesty-browser-gate.mjs',
      ],
      deployed: ['golden:calculator', 'golden:simple-website', 'golden:business-tool', 'golden:brief-with-documents', 'golden:iterate-heading'],
    },
  }),
  journey({
    id: 'preview-built-site',
    area: 'coding desk',
    name: 'See the build run in Preview',
    entry: 'src/components/ProjectRuntimePreview.jsx',
    hooks: ['data-quantora-real-project-preview', 'data-quantora-preview-error', 'data-quantora-preview-contract-error'],
    serves: ['api/preview-compile.js'],
    gates: {
      deterministic: ['api/_lib/preview-compiler.test.js', 'src/lib/preview-compile-client.test.js', 'scripts/golden-page-state.test.mjs'],
      browser: [
        'scripts/preview-ready-not-stuck-gate.mjs',
        'scripts/project-runtime-failure-browser-gate.mjs',
        'scripts/preview-shell-must-start-gate.mjs',
      ],
      deployed: ['golden:calculator', 'golden:iterate-heading', 'scripts/deployed-shop-preview-gate.mjs'],
    },
  }),
  journey({
    id: 'preview-repair',
    area: 'coding desk',
    name: 'A broken Preview repairs itself, or says it could not',
    entry: 'src/components/LivePreviewCanvas.jsx',
    hooks: ['data-quantora-preview-error'],
    modelTurn: true,
    gates: {
      deterministic: ['src/lib/refinement-loop.test.js', 'src/lib/build-repair.test.js', 'api/_lib/verify-build.test.ts'],
      browser: ['scripts/qir-coding-resume-browser-gate.mjs', 'scripts/project-runtime-failure-browser-gate.mjs'],
    },
  }),
  journey({
    id: 'preview-controls',
    area: 'coding desk',
    name: 'Switch the Preview device, download the build, or ask to Improve it',
    entry: 'src/components/StudioPreviewControls.jsx',
    hooks: ['data-quantora-desk-preview-controls', 'data-quantora-canvas-device-switcher', 'data-quantora-desk-improve', 'data-quantora-desk-download'],
    modelTurn: true,
    gates: {},
    note: 'Four durable hooks and no gate reads any of them.',
  }),
  journey({
    id: 'desk-review-probes',
    area: 'coding desk',
    name: 'Review the build against probed criteria and patch what fails',
    entry: 'src/components/AiStudio.jsx',
    hooks: ['data-quantora-desk-probes', 'data-quantora-desk-probe-ok', 'data-quantora-desk-next', 'data-quantora-desk-claim-filter'],
    modelTurn: true,
    gates: {
      deterministic: ['src/lib/outcome-gap-detection.test.js', 'src/lib/desk-chat-claim-filter.test.js'],
      browser: [
        'scripts/desk-job-review-browser-gate.mjs',
        'scripts/desk-review-patch-browser-gate.mjs',
        'scripts/desk-chat-claim-browser-gate.mjs',
      ],
    },
  }),
  journey({
    id: 'shop-build-cart',
    area: 'coding desk',
    name: 'A shop build shows its photos and prices, and the bag fills',
    entry: 'src/lib/shop-preview-ui.js',
    hooks: ['data-quantora-shop-ui', 'data-quantora-bag', 'data-quantora-price', 'data-quantora-shop-photo'],
    gates: {
      deterministic: ['src/lib/shop-ui-react-vfs.test.js', 'scripts/shop-catalog-photos-scale-gate.mjs'],
      browser: [
        'scripts/shop-preview-act-gate.mjs',
        'scripts/desk-review-patch-browser-gate.mjs',
        'scripts/studio-regression-browser-gate.mjs',
      ],
      deployed: ['scripts/deployed-shop-preview-gate.mjs'],
    },
  }),
  journey({
    id: 'desk-git',
    area: 'coding desk',
    name: 'Desk git: status, diff, commit, and review by hunk',
    entry: 'src/components/StudioGit.jsx',
    hooks: ['data-quantora-studio-git', 'data-quantora-desk-review', 'data-quantora-desk-review-hunk'],
    gates: {
      deterministic: ['src/lib/studio-git.test.js'],
      browser: ['scripts/desk-diff-review-browser-gate.mjs', 'scripts/studio-regression-browser-gate.mjs'],
    },
  }),
  journey({
    id: 'desk-chrome',
    area: 'coding desk',
    name: 'Desk chrome: rails, terminal, file tree, editor, splits and the Publish menu',
    entry: 'src/components/AiStudio.jsx',
    hooks: [
      'data-quantora-desk-rail',
      'data-quantora-studio-terminal',
      'data-quantora-monaco',
      'data-quantora-file-tree',
      'data-quantora-files-preview-split',
      'data-quantora-desk-publish-menu',
    ],
    gates: {
      browser: [
        'scripts/desk-rail-smoke-browser-gate.mjs',
        'scripts/coding-desk-chrome-browser-gate.mjs',
        'scripts/studio-regression-browser-gate.mjs',
      ],
    },
  }),
  journey({
    id: 'desk-rewind',
    area: 'coding desk',
    name: 'Rewind the desk to an earlier checkpoint',
    entry: 'src/components/DeskRewindMenu.jsx',
    hooks: ['data-quantora-desk-rewind'],
    gates: {
      deterministic: [
        'src/lib/desk-checkpoints.test.js',
        'src/lib/desk-checkpoint-delta.test.js',
        'src/lib/desk-checkpoint-client.test.js',
      ],
    },
    serves: ['api/desk-checkpoints.ts'],
    note: 'Checkpoints are tested; the menu has never been opened by a gate. Durable rewind (Phase 7, 2026-09-07): desk-checkpoints.js said in its own header that cross-reload history needed a server-side home, and the obstacle it named was size -- twenty full copies of a working tree per session is not a database row. Each stored checkpoint is now the delta since the one before it, with the tree hash recorded alongside, and the replay verifies that hash after EVERY step. A delta chain has one failure a pile of snapshots does not: a damaged or missing link yields a tree assembled from two moments, which looks fine and is not, so it is refused and located instead -- the caller is told which checkpoint stopped being trustworthy and is handed the last state that verified. A hole in the stored sequence is caught before replay, because applying the wrong delta to the wrong tree would blame an intact checkpoint for the mismatch. A checkpoint too large to store is refused with its size rather than truncated: a partial checkpoint is what someone rewinds TO. Review of #591 found three more: a save REPLACES a session\'s chain rather than adding to it, because the desk trims its own history and renumbers what remains, so checkpoint 21 would arrive claiming the position the dropped one still held and every later read would refuse the chain forever -- each save writes a fresh generation and readers take the newest, so a chain is never seen half-replaced; the rows carry the person\'s source so they cascade on account deletion and appear in the account export, which had still queried only the five tables that predated them; and the desk now reads the stored chain back on session open, rebuilding and re-verifying it locally rather than trusting the answer, and adopting it only when the session has not already moved on.',
  }),
  journey({
    id: 'qir-durable-run',
    area: 'coding desk',
    name: 'A coding run outlives the browser and the worker, and resumes',
    entry: 'src/lib/qir-coding-run-core.js',
    hooks: ['data-quantora-qir-run', 'data-quantora-qir-run-id', 'data-quantora-qir-run-status'],
    serves: ['api/qir-runs.ts', 'api/qir-context.ts', 'api/qir-resources.ts'],
    gates: {
      deterministic: [
        'api/_lib/qir-run-store.test.ts',
        'api/_lib/qir-coding-runtime.test.ts',
        'src/lib/qir-coding-run-core.test.js',
        'src/lib/qir-durability.test.js',
        'src/lib/qir-production-recovery-contract.test.js',
        'shared/qir-persist-diagnosis.test.js',
      ],
      browser: ['scripts/qir-coding-resume-browser-gate.mjs', 'scripts/qir-production-recovery-browser-gate.mjs'],
      deployed: ['scripts/deployed-qir-durability-gate.mjs'],
    },
  }),
  journey({
    id: 'share-preview-link',
    area: 'coding desk',
    name: 'Copy a shareable link to the preview',
    entry: 'src/components/LivePreviewCanvas.jsx',
    serves: ['api/deploy.ts'],
    gates: {
      deterministic: ['src/lib/route-reachability.test.js'],
      browser: ['scripts/desk-publish-browser-gate.mjs'],
    },
    note: 'desk-publish-browser-gate clicks Share link on a site the desk built: /api/deploy receives the built code with the share confirmation header, the URL lands on the clipboard, and a notice by the Publish control says so — the first click found the copy happening in silence (2026-09-06). The deploy function itself is proven to boot on the deployment; it was dead for a day on 2026-08-31 behind a green check.',
  }),
  journey({
    id: 'publish-vercel',
    area: 'coding desk',
    name: 'Publish the build to Vercel',
    entry: 'src/components/LivePreviewCanvas.jsx',
    serves: ['api/deploy.ts', 'api/domains.ts'],
    modelTurn: 'mixed',
    gates: {
      deterministic: ['src/lib/route-reachability.test.js'],
      browser: ['scripts/desk-publish-browser-gate.mjs'],
    },
    note: 'desk-publish-browser-gate opens the dialog, types a project name, and sees /api/deploy receive the built code with the publish confirmation header, /api/domains asked for ideas, and the live URL and domain ideas shown (2026-09-06). A real Vercel deploy is still unproven.',
  }),
  journey({
    id: 'connect-domain',
    area: 'coding desk',
    name: 'Connect a custom domain',
    entry: 'src/components/LivePreviewCanvas.jsx',
    serves: ['api/domains.ts'],
    modelTurn: 'mixed',
    gates: {},
    note: 'The domains function is proven to boot and to refuse a blocked session (platform rows). Nothing proves a domain connects.',
  }),
  journey({
    id: 'deploy-gcp',
    area: 'coding desk',
    name: 'Deploy a full-stack app to Cloud Run',
    entry: 'src/components/LivePreviewCanvas.jsx',
    serves: ['api/deploy-gcp.ts'],
    gates: { deterministic: ['src/lib/route-reachability.test.js'] },
    note: 'Proven to be served; never driven.',
  }),
  journey({
    id: 'github-connect-destination',
    area: 'coding desk',
    name: 'Connect GitHub and choose the repository and branch a build writes to',
    entry: 'src/components/GithubDestinationBar.jsx',
    hooks: ['data-quantora-github-destination', 'data-quantora-github-destination-connect', 'data-quantora-github-destination-menu'],
    serves: ['api/auth.ts', 'api/pipeline.ts'],
    gates: {
      deterministic: [
        'src/lib/github-destination.test.js',
        'src/lib/github-workspace.test.js',
        'api/_lib/github-principal.test.ts',
        'scripts/github-write-seam-gate.mjs',
      ],
    },
    note: 'Five durable hooks; no browser gate has connected GitHub or opened the destination menu.',
  }),
  journey({
    id: 'github-import-repo',
    area: 'coding desk',
    name: 'Import an existing repository into the desk',
    entry: 'src/components/AiStudio.jsx',
    hooks: [
      'data-quantora-github-checkout-status',
      'data-quantora-attachment-menu',
      'data-quantora-github-import-open',
      'data-quantora-github-import-url',
      'data-quantora-github-import-run',
      'data-quantora-github-import-error',
    ],
    serves: ['api/pipeline.ts'],
    gates: {
      deterministic: [
        'src/lib/github-import.test.js',
        'api/_lib/github-checkout.test.ts',
        'api/_lib/repository-preview.test.ts',
        'api/_lib/github-intelligence.test.ts',
        'src/lib/repo-work-comprehension.test.js',
      ],
      browser: ['scripts/repo-work-browser-gate.mjs'],
    },
    note: 'The import works; being understood as a CHANGE afterwards did not. Measured 2026-09-07 with a real repository open on the desk, shouldRefineRunningDesk returned false for 26 of 28 ordinary developer requests -- \'fix the null check in auth.ts\', \'add a test for the retry path\', \'bump the eslint version\' -- and the two that passed were accidents: \'migrate the users TABLE\' matched the UI-parts list on an HTML table, and \'can you fix THEM\' matched the rule for iterating on a preview. The first reading of that number was wrong and the correction is the useful part: those turns were still coding turns, because turnBelongsToBuild covers any message once the desk holds files, so buildMode was never wrong. What they were not is REFINEMENTS. On the same desk with the same files, \'make the header blue\' went out as studioMode build with refineMode true, and \'add a test for the retry path\' went out as studioMode ask with refineMode absent -- a change to existing code described to the server as a fresh request. Every intent signal here had been written for somebody who wants software MADE, so a person who already has a repository was speaking a vocabulary the desk did not contain. repo-work-comprehension.test.js is the comprehension gate for that: precision may never leave 100%, because an invention here is not a wrong answer but a WRITE -- a question about the code read as an instruction to change it moves files while somebody was only asking -- and the recall floor, 100% of the corpus and 8 of 8 holdout phrasings against 7% before, may only ever rise, which at 100% means the gate is strengthened by adding cases rather than by moving a number. It also proves the floor is carried by the new vocabulary rather than reachable without it, so the gate cannot pass with the fix deleted. This journey had never been driven and could not have been: until 2026-09-07 the import path carried no durable hook at all, reachable only by its words -- \'Connect to Github\', then \'Import to Context\' -- and this repository has already paid once for a gate anchored on prose. repo-work-browser-gate.mjs drives it by hook: the repository imports and lands as context, a build turn puts files on the desk, a developer-phrased change goes out carrying refineMode, and a QUESTION about the same code does not. That last step is not decoration: with the question guards removed and the app rebuilt, the question went out as an edit, the prose answer failed the desk\'s own \'did this return files?\' verification, and the loop burned SEVEN retries before giving up -- a person asking a question, billed for eight model calls and told their answer failed.',
  }),
  journey({
    id: 'github-push',
    area: 'coding desk',
    name: 'Push the desk files to a new or existing repository',
    entry: 'src/components/GithubPushPanel.jsx',
    hooks: ['data-quantora-github-push', 'data-quantora-github-push-run', 'data-quantora-github-push-status'],
    serves: ['api/pipeline.ts'],
    gates: {
      deterministic: [
        'src/lib/github-push-payload.test.js',
        'api/_lib/github-write-authorization.test.ts',
        'scripts/github-write-seam-gate.mjs',
      ],
      browser: ['scripts/desk-publish-browser-gate.mjs'],
    },
    note: 'desk-publish-browser-gate opens the Git rail, names a new repository, and runs the push: create-repo and push receive their stages, both desk files travel, the panel reports the outcome and who acted, and its link points at the pushed branch — the link used to vanish after a push whose reply carried no htmlUrl (2026-09-06).',
  }),
  journey({
    id: 'github-pull-requests',
    area: 'coding desk',
    name: 'Open, review, comment on and merge pull requests from the desk',
    entry: 'src/components/GithubPullRequests.jsx',
    hooks: ['data-quantora-github-prs', 'data-quantora-github-merge', 'data-quantora-github-open-pr'],
    serves: ['api/pipeline.ts'],
    gates: {
      deterministic: [
        'api/_lib/github-write-authorization.test.ts',
        'api/_lib/github-tool-promise.test.ts',
        'scripts/github-write-seam-gate.mjs',
      ],
    },
  }),
  journey({
    id: 'office-artifacts',
    area: 'coding desk',
    name: 'Generate and download a PowerPoint, Excel, Word or PDF file',
    entry: 'src/components/OfficePreview.jsx',
    serves: ['api/generate-office.ts'],
    modelTurn: true,
    gates: {
      deterministic: [
        'api/_lib/office-artifact.test.js',
        'api/_lib/office-generation-budget.test.js',
        'api/_lib/office-output-schemas.test.js',
        'src/lib/office-briefing.test.js',
        'src/lib/office-export.test.js',
        'src/lib/office-failure-copy.test.js',
        'src/lib/office-intent.test.js',
        'scripts/office-words.test.mjs',
      ],
      deployed: ['golden:office-document'],
    },
    note: 'The deployed golden asks for a Word file, clicks Download, and opens what the browser received: word/document.xml must carry the title (2026-09-06). Its first run found the generator resolving server keys from the environment alone while chat also reads the gateway, so a preview with a gateway-held Gemini generated with no Gemini; the generator now resolves as chat does, its 502 names every provider asked, and the desk shows that detail. A deck and a workbook are still unopened.',
  }),

  // ── advisor desks ───────────────────────────────────────────────────────
  journey({
    id: 'travel-desk',
    area: 'advisor desks',
    name: 'Plan a trip: flights, stays, places and an itinerary',
    entry: 'src/components/TravelTripBoard.jsx',
    hooks: ['data-quantora-advisor', 'data-quantora-travel-board'],
    serves: ['api/_lib/handlers/travel-search.ts'],
    modelTurn: 'mixed',
    gates: {
      deterministic: [
        'src/lib/travel-comprehension.test.js',
        'api/_lib/travel-search-request.test.ts',
        'api/_lib/travel-dates.test.ts',
        'shared/travel/provider-refusal.test.js',
        'src/lib/travel-hotel-location.test.js',
      ],
      browser: ['scripts/travel-browser-release-gate.mjs'],
    },
  }),
  journey({
    id: 'research-desk',
    area: 'advisor desks',
    name: 'Research: a brief, claims verified, a topic watched, a deep dive',
    entry: 'src/components/ResearchBoard.jsx',
    hooks: ['data-quantora-research-board', 'data-quantora-unproved-claim'],
    modelTurn: true,
    gates: {
      deterministic: [
        'api/_lib/research-verify.test.ts',
        'api/_lib/research-watch.test.ts',
        'api/_lib/research-deep-dive.test.ts',
        'api/_lib/research-claim-verifier.test.ts',
        'src/lib/research-board-actions.test.js',
        'src/lib/research-brief.test.js',
        'shared/research/grounding-marker.test.js',
      ],
    },
    note: 'The workspace contract opens the desk. No gate has run a verify, a watch or a deep dive through the board.',
  }),
  journey({
    id: 'finance-desk',
    area: 'advisor desks',
    name: 'Finance: debt, savings, FX, market data and the advisor',
    entry: 'src/components/FinanceBoard.jsx',
    hooks: ['data-quantora-finance-board', 'data-quantora-finance-action'],
    modelTurn: 'mixed',
    gates: {
      deterministic: [
        'scripts/finance-judgment-gate.mjs',
        'api/_lib/finance-advisor-gateway.test.ts',
        'api/_lib/finance-gateway-guard.test.ts',
        'api/_lib/debt-conversation.test.ts',
        'api/_lib/financial-profile-gateway.test.ts',
        'src/lib/finance-board-brief.test.js',
      ],
      browser: ['scripts/finance-browser-gate.mjs'],
    },
  }),
  journey({
    id: 'study-tutor',
    area: 'advisor desks',
    name: 'Study: a tutor conversation with lessons, pictures and a syllabus',
    entry: 'src/components/StudyTutorShell.jsx',
    hooks: ['data-quantora-study-board', 'data-quantora-study-lesson', 'data-quantora-study-picture', 'data-quantora-study-next-choices'],
    serves: ['api/pipeline.ts'],
    modelTurn: true,
    gates: {
      deterministic: [
        'api/_lib/study-teaching-policy.test.ts',
        'api/_lib/study-adaptive-lesson-loop.test.ts',
        'src/lib/study-conversation-loop.test.js',
        'src/lib/study-teaching-turn.test.js',
        'src/lib/study-representation-gate-contract.test.js',
        'src/lib/study-pictures.test.js',
      ],
      browser: [
        'scripts/study-media-browser-gate.mjs',
        'scripts/study-electricity-browser-gate.mjs',
        'scripts/study-representation-browser-gate.mjs',
      ],
    },
  }),
  journey({
    id: 'study-verified-check',
    area: 'advisor desks',
    name: 'Study: take a verified check and get a verdict',
    entry: 'src/components/StudyTutorShell.jsx',
    hooks: ['data-quantora-study-verified-check', 'data-quantora-study-verified-result'],
    serves: ['api/study-assessment.ts', 'api/study-evidence.ts'],
    gates: {
      deterministic: [
        'api/_lib/study-evidence.test.ts',
        'api/_lib/study-assessment.test.ts',
        'api/_lib/study-verification.test.ts',
        'src/lib/study-evidence-client.test.js',
      ],
      browser: ['scripts/study-media-browser-gate.mjs', 'scripts/study-onboarding-reinforcement-browser-gate.mjs'],
    },
  }),
  journey({
    id: 'study-notebook-flashcards',
    area: 'advisor desks',
    name: 'Study: notebook, flashcards and the assessment history',
    entry: 'src/components/StudyHubLauncher.jsx',
    hooks: ['data-quantora-study-hub-launcher', 'data-quantora-study-notebook', 'data-quantora-study-flashcard'],
    serves: ['api/study-notebook.ts', 'api/study-assessment-history.ts'],
    gates: {
      deterministic: [
        'api/_lib/study-notebook.test.ts',
        'api/_lib/study-assessment-history.test.ts',
        'src/lib/study-notebook-client.test.js',
        'src/lib/study-assessment-history-client.test.js',
      ],
      browser: ['scripts/study-notebook-browser-gate.mjs', 'scripts/study-media-browser-gate.mjs'],
    },
  }),
  journey({
    id: 'study-onboarding',
    area: 'advisor desks',
    name: 'Study: onboarding and the reinforcement board',
    entry: 'src/components/StudyOnboarding.jsx',
    hooks: ['data-quantora-study-onboarding', 'data-quantora-study-reinforcement'],
    serves: ['api/study-onboarding.ts'],
    gates: {
      deterministic: ['api/_lib/study-onboarding.test.ts', 'src/lib/study-reinforcement.test.js'],
      browser: ['scripts/study-onboarding-reinforcement-browser-gate.mjs'],
    },
  }),
  journey({
    id: 'verified-media-links',
    area: 'advisor desks',
    name: 'A video offered in a reply is validated before it is offered',
    entry: 'src/components/VerifiedMediaLink.jsx',
    hooks: ['data-quantora-youtube-validation', 'data-quantora-youtube-play'],
    serves: ['api/_lib/handlers/youtube-validate.ts'],
    gates: {
      deterministic: ['src/lib/youtube-media.test.js'],
      browser: ['scripts/media-profile-browser-gate.mjs', 'scripts/study-media-browser-gate.mjs'],
    },
  }),

  // ── other surfaces ──────────────────────────────────────────────────────
  journey({
    id: 'dream-to-action',
    area: 'other surfaces',
    name: 'Dream-to-Action canvas: an idea becomes a thought, then an action',
    entry: 'src/components/DreamActionCanvas.jsx',
    serves: ['api/pipeline.ts'],
    modelTurn: true,
    parked: true,
    gates: {},
    note: 'Parked on 2026-09-06 to keep the surface inside what the gates can prove: the tab, the landing card and the desk\'s "push to canvas" control render only with VITE_QUANTORA_EXPLORATORY_SURFACES=on. No durable hook, no test, no gate.',
  }),
  journey({
    id: 'quantum-playground',
    area: 'other surfaces',
    name: 'Quantum Playground: build a circuit and watch the state',
    entry: 'src/components/QuantumPlayground.jsx',
    parked: true,
    gates: { deterministic: ['src/lib/quantum/statevector.test.js'] },
    note: 'Parked on 2026-09-06 to keep the surface inside what the gates can prove: the tab and the landing card render only with VITE_QUANTORA_EXPLORATORY_SURFACES=on. The simulator is tested; the playground has no durable hook and no gate.',
  }),
  journey({
    id: 'privacy-vault-byok',
    area: 'other surfaces',
    name: 'Bring your own provider keys for this session',
    entry: 'src/components/PrivacyVault.jsx',
    serves: ['api/_lib/byok-credentials.ts'],
    modelTurn: true,
    gates: { deterministic: ['api/_lib/byok-credentials.test.ts'] },
    note: 'The server reads the keys correctly. Nothing proves the desk sends them, or that a turn runs on them.',
  }),
  journey({
    id: 'feedback-widget',
    area: 'other surfaces',
    name: 'Send product feedback',
    entry: 'src/components/FeedbackWidget.jsx',
    serves: ['api/pipeline.ts'],
    gates: { deterministic: ['api/_lib/feedback-store.test.ts', 'src/lib/feedback-compose.test.js'] },
  }),
  journey({
    id: 'admin-dashboard',
    area: 'other surfaces',
    name: 'Admin: metrics, analytics, feedback triage and the model dashboard',
    entry: 'src/components/AdminDashboard.jsx',
    serves: ['api/admin.ts'],
    gates: {
      deterministic: ['src/lib/model-dashboard-ranking.test.js', 'api/_lib/model-lifecycle.test.js', 'api/_lib/model-store.test.js'],
    },
    note: 'Ranking and lifecycle are tested; the metrics and feedback handlers, and every admin screen, are not.',
  }),
  journey({
    id: 'isolated-desk-route',
    area: 'other surfaces',
    name: 'Open the desk at its own address after signing in',
    entry: 'src/lib/studio-isolation.js',
    hooks: ['data-quantora-isolated-desk'],
    gates: { deterministic: ['src/lib/studio-isolation.test.js'] },
  }),
  journey({
    id: 'desktop-app',
    area: 'other surfaces',
    name: 'Desktop app: open a folder, edit, run a shell, use git, chat, sign out',
    entry: 'desktop/main',
    hooks: ['data-qd-open-folder', 'data-qd-editor', 'data-qd-terminal', 'data-qd-git-status', 'data-qd-chat-send', 'data-qd-signin'],
    gates: {
      deterministic: [
        'desktop/runtime/git.test.ts',
        'desktop/runtime/shell.test.ts',
        'desktop/runtime/workspace-policy.test.ts',
        'desktop/main/api-proxy-policy.test.ts',
      ],
      browser: ['scripts/desktop-smoke-gate.mjs'],
    },
  }),
  journey({
    id: 'turn-reference-id',
    area: 'other surfaces',
    name: 'A turn leaves a reference id, and a failed turn\'s reference resolves to what happened',
    entry: 'src/lib/transaction-trace.js',
    hooks: ['data-quantora-correlation-id'],
    serves: ['api/_lib/transaction-trace.ts', 'api/_lib/handlers/product-event.ts'],
    gates: {
      deterministic: [
        'src/lib/transaction-trace.test.js',
        'api/_lib/transaction-trace.test.ts',
        'src/lib/listening-layer.test.js',
        'shared/trace-story.test.js',
        'src/lib/trace-lookup.test.js',
      ],
      browser: ['scripts/second-transaction-browser-gate.mjs', 'scripts/trace-lookup-browser-gate.mjs'],
      deployed: ['golden:calculator'],
    },
    note: 'The lookup needs the transaction_boundary_events migration applied on the deployment; until then the desk says the trace store did not answer.',
  }),

  // ── platform invariants: not journeys, but every journey stands on them ──
  journey({
    id: 'functions-boot',
    kind: 'platform',
    area: 'platform invariants',
    name: 'Every deployed function boots before its handler runs, and every import resolves in production',
    entry: 'api',
    gates: {
      deterministic: ['scripts/runtime-import-gate.mjs'],
      deployed: ['scripts/deployed-readiness-gate.mjs'],
    },
  }),
  journey({
    id: 'routes-served-and-called',
    kind: 'platform',
    area: 'platform invariants',
    name: 'Every route the desk calls is served, and every served route is called',
    entry: 'vercel.json',
    gates: {
      deterministic: ['scripts/platform-dead-control-gate.mjs', 'scripts/served-route-gate.mjs', 'src/lib/route-reachability.test.js'],
    },
  }),
  journey({
    id: 'endpoints-protected',
    kind: 'platform',
    area: 'platform invariants',
    name: 'Every model-facing endpoint refuses a blocked or missing session',
    entry: 'api/_lib/session-context.ts',
    gates: { deterministic: ['api/_lib/protected-endpoints.test.ts', 'api/_lib/authz-golden-canary.test.ts'] },
  }),
  journey({
    id: 'claims-backed',
    kind: 'platform',
    area: 'platform invariants',
    name: 'No capability chip or tool description promises what nothing answers',
    entry: 'src/lib/capability-claims.js',
    gates: { deterministic: ['scripts/capability-claims-gate.mjs'] },
  }),
  journey({
    id: 'dead-wires',
    kind: 'platform',
    area: 'platform invariants',
    name: 'Nothing tested is reachable by nothing, and hooks are declared in dependency order',
    entry: 'src/lib/wiring-audit.js',
    gates: { deterministic: ['scripts/wiring-gate.mjs', 'scripts/hook-dependency-order-gate.mjs'] },
  }),
  journey({
    id: 'hostile-reply-safety',
    kind: 'platform',
    area: 'platform invariants',
    name: 'A hostile or malformed model reply cannot destroy the build',
    entry: 'scripts/stress',
    gates: {
      deterministic: ['scripts/stress/pipeline-stress.mjs', 'src/lib/never-discard-model-output.test.js', 'src/lib/chat-turn-safety.test.js'],
    },
  }),
  journey({
    id: 'experience-budget',
    kind: 'platform',
    area: 'platform invariants',
    name: 'The shell, a workspace switch and the input stay inside their time budgets',
    entry: 'src/components/AiStudio.jsx',
    gates: { browser: ['scripts/platform-experience-browser-gate.mjs'] },
  }),
  journey({
    id: 'models-governed',
    kind: 'platform',
    area: 'platform invariants',
    name: 'Models are listed, canaried, routed and retired on evidence',
    entry: 'api/models.js',
    gates: {
      deterministic: [
        'api/_lib/model-canary.test.js',
        'api/_lib/model-smoke-test.test.js',
        'api/_lib/model-execution-policy.test.ts',
        'api/_lib/server-key-resolution.test.ts',
        'api/_lib/user-paid-quota.test.ts',
        'api/_lib/user-paid-quota-wiring.test.ts',
        'src/lib/model-outcome-routing.test.js',
        'src/lib/latency-tie-breaker.test.js',
        'scripts/provider-health.test.mjs',
      ],
      deployed: ['scripts/provider-health-probe.mjs'],
    },
    note: 'Two brakes, opposite by design (2026-09-07): the platform spend gate reads OpenRouter\'s own meter and fails CLOSED, because unknown spend is never zero spend and a guess spends real money. The per-user quota counts one account\'s paid calls in a rolling window and fails OPEN, because that meter is per key and shared, so a quota outage would deny every user the paid rung to bound an overrun the dollar ceiling already bounds. Its unset limit is a real number, not infinity, so the protection cannot exist in the repository and not on the deployment the way OPENROUTER_SPEND_CEILING_USD did. The wiring gate reads chat-handler because this repo has already shipped a whole cost-control subsystem that nothing called. Latency became a routing input (2026-09-07): the platform recorded it per turn and carried avgLatencyMs on every signal while nothing read it, and both rankers settled an exact tie on catalogue position instead. It now settles on measured speed, positionally: within a run of equal merit the positions held by measured routes are collected, those routes are ordered among themselves by latency, and they are written back into exactly those positions, so merit cannot be crossed and a route nobody has timed never moves. The first cut scored each route instead and gave an unmeasured one a zero, which sits mid-range and silently ranked it ahead of every slow route and behind every fast one on no evidence; review of #590 caught it. The obvious repair -- compare latency only when both sides are measured -- is unsound, because slow/unknown/fast in catalogue order demands a cycle and Array.prototype.sort has no defined result for an intransitive comparator. The same review found the number itself wrong: the view averages latency over successful rows only, so combining a model\'s categories unweighted let one sample outvote a hundred, harmless while nothing read it and load-bearing the moment routing did. The provider watch (2026-09-06): every half hour the production deployment\'s readiness, live Gemini probe and free OpenRouter credential probe are read and judged; a missing, refused, capped, exhausted or unreachable provider fails the scheduled run, which is what GitHub emails the owner about. server-key-resolution.test.ts reads every api/ file: one that takes GEMINI_API_KEY from the environment without consulting the gateway resolves keys differently from chat and dies on a gateway-only deployment, as the Office generator did on 2026-09-06.',
  }),
  journey({
    id: 'gates-anchored',
    kind: 'platform',
    area: 'platform invariants',
    name: 'The gates anchor on hooks the app publishes, read the page state the desk writes, and pin the browser they run',
    entry: 'src/lib/deployed-gate-contract.test.js',
    gates: {
      deterministic: [
        'src/lib/deployed-gate-contract.test.js',
        'scripts/golden-page-state.test.mjs',
        'scripts/golden-engine-refusal.test.mjs',
        'scripts/golden-plan.test.mjs',
        'scripts/zip-entry.test.mjs',
        'scripts/business-tool-reconcile.test.mjs',
        'scripts/workflow-playwright-pin.test.mjs',
        'scripts/test-failure-summary.test.mjs',
      ],
    },
    note: 'A red check whose evidence cannot be read (2026-09-07): one test of 1630 failed in CI and could not be identified through any route. The TAP reporter prints a failure inline and ends with counters only, so the name was nine thousand lines above the end; GitHub\'s job-log API serves roughly the last five thousand lines at any requested size, and the raw download is on a host this tooling cannot reach. That is rule 1 defeated -- the log is the evidence, and here there was none -- and it is precisely the pressure that gets a real defect labelled flaky. Both suite runners now stream their output unchanged and append a block naming every failure, its assertion and the frame in the project, so a failure anywhere in a 13,000-line run is readable from the last dozen lines.',
  }),
  journey({
    id: 'inventory-true',
    kind: 'platform',
    area: 'platform invariants',
    name: 'This ledger names only gates that exist and run, claims every gate on disk, and its number is true',
    entry: 'src/lib/journey-gate-inventory.js',
    gates: { deterministic: ['scripts/journey-gate-inventory-gate.mjs', 'src/lib/journey-gate-inventory.test.js'] },
  }),
]);

/* ─── pure functions ─────────────────────────────────────────────────────── */

export function journeyStatus(row) {
  const gates = row?.gates || {};
  if ((gates.browser?.length || 0) + (gates.deployed?.length || 0) > 0) return 'proven';
  if ((gates.deterministic?.length || 0) > 0) return 'helpers';
  return 'nothing';
}

export function summarizeJourneys(journeys = JOURNEYS) {
  const parkedRows = journeys.filter((row) => row.kind !== 'platform' && row.parked === true);
  const user = journeys.filter((row) => row.kind !== 'platform' && row.parked !== true);
  const platform = journeys.filter((row) => row.kind === 'platform');
  const byStatus = { proven: [], helpers: [], nothing: [] };
  for (const row of user) byStatus[journeyStatus(row)].push(row.id);
  const deployed = user.filter((row) => (row.gates.deployed?.length || 0) > 0).map((row) => row.id);
  return {
    total: user.length,
    proven: byStatus.proven.length,
    helpers: byStatus.helpers.length,
    nothing: byStatus.nothing.length,
    parked: parkedRows.length,
    deployed: deployed.length,
    platform: platform.length,
    provenPercent: user.length ? Math.round((100 * byStatus.proven.length) / user.length) : 0,
    provenIds: byStatus.proven,
    helpersOnly: byStatus.helpers,
    unguarded: byStatus.nothing,
    parkedIds: parkedRows.map((row) => row.id),
    deployedIds: deployed,
  };
}

/*
 * A drop is a regression. A stale floor is a lie in the other direction: the
 * file would say fewer journeys are proven than are, and the next drop back
 * to that number would pass. Both fail, so the floor IS the count.
 */
export function floorProblems(summary, floors = FLOORS) {
  const problems = [];
  for (const key of ['proven', 'deployed']) {
    const actual = summary[key];
    const floor = floors[key];
    if (actual < floor) {
      problems.push(`${key} journeys fell to ${actual}, below the floor of ${floor}. A journey lost its gate; restore it or say which and why.`);
    } else if (actual > floor) {
      problems.push(`${key} journeys rose to ${actual}; raise FLOORS.${key} in src/lib/journey-gate-inventory.js to ${actual} so the file states the number.`);
    }
  }
  return problems;
}

export function isGoldenGate(name) {
  return typeof name === 'string' && name.startsWith('golden:');
}

/*
 * Every gate string a journey names, mapped to the journeys that name it.
 * Golden transactions are kept apart: they are names in a roster, not files.
 */
export function claimedGates(journeys = JOURNEYS) {
  const files = new Map();
  const golden = new Map();
  for (const row of journeys) {
    for (const level of GATE_LEVELS) {
      for (const name of row.gates[level] || []) {
        const target = isGoldenGate(name) ? golden : files;
        const key = isGoldenGate(name) ? name.slice('golden:'.length) : name;
        if (!target.has(key)) target.set(key, []);
        target.get(key).push(row.id);
      }
    }
  }
  return { files, golden };
}

const GATE_PATH = /^(?:api|src|shared|scripts|desktop)\/[\w./-]+\.(?:mjs|cjs|js|ts)$/;

export function validateInventoryShape(journeys = JOURNEYS) {
  const problems = [];
  const seen = new Set();
  for (const row of journeys) {
    if (!row.id || typeof row.id !== 'string') problems.push('a journey has no id');
    else if (seen.has(row.id)) problems.push(`journey id "${row.id}" is listed twice`);
    seen.add(row.id);
    if (!['user', 'platform'].includes(row.kind)) problems.push(`journey "${row.id}" has kind "${row.kind}"; expected user or platform`);
    if (typeof row.parked !== 'boolean') problems.push(`journey "${row.id}" has parked "${row.parked}"; expected true or false`);
    if (row.parked === true && row.kind === 'platform') problems.push(`journey "${row.id}" is a platform invariant and cannot be parked`);
    if (row.parked === true && !String(row.note || '').trim()) problems.push(`journey "${row.id}" is parked without a note saying why and what brings it back`);
    if (!row.name) problems.push(`journey "${row.id}" has no name`);
    if (!row.area) problems.push(`journey "${row.id}" has no area`);
    if (!row.entry) problems.push(`journey "${row.id}" names no entry point`);
    for (const level of GATE_LEVELS) {
      for (const name of row.gates[level] || []) {
        if (isGoldenGate(name)) {
          if (level !== 'deployed') problems.push(`journey "${row.id}" lists ${name} under ${level}; a golden transaction is a deployed gate`);
          if (!/^golden:[a-z0-9-]+$/.test(name)) problems.push(`journey "${row.id}" has a malformed golden name "${name}"`);
        } else if (!GATE_PATH.test(name)) {
          problems.push(`journey "${row.id}" names "${name}", which is not a repo-relative path to a test or gate`);
        }
      }
    }
  }
  return problems;
}

/* ─── workflow reading ───────────────────────────────────────────────────── */

/*
 * A deliberately small reading of a GitHub Actions file: jobs, steps, and for
 * each step its name, id, `continue-on-error`, `uses` and `run`. Enough to
 * answer "does this script run, and is its outcome read?" without a YAML
 * dependency that would itself need vetting.
 */
export function parseWorkflowSteps(text) {
  const lines = String(text || '').split('\n');
  const jobsAt = lines.findIndex((line) => line.trimEnd() === 'jobs:');
  if (jobsAt < 0) return [];
  const steps = [];
  let job = null;
  let step = null;
  let runBlockIndent = -1;

  const assign = (key, value, indent) => {
    if (key === 'name') step.name = value.trim();
    else if (key === 'id') step.id = value.trim();
    else if (key === 'uses') step.uses = value.trim();
    else if (key === 'continue-on-error') step.continueOnError = value.trim() === 'true';
    else if (key === 'run') {
      if (/^[|>][-+]?\s*$/.test(value.trim())) {
        step.run = '';
        runBlockIndent = indent;
      } else {
        step.run = value.trim();
      }
    }
  };

  for (let i = jobsAt + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
    if (runBlockIndent >= 0) {
      if (trimmed === '' || indent > runBlockIndent) {
        step.run += `${trimmed}\n`;
        continue;
      }
      runBlockIndent = -1;
    }
    const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobMatch) {
      job = jobMatch[1];
      step = null;
      continue;
    }
    if (!job || trimmed === '' || trimmed.startsWith('#')) continue;
    const stepStart = /^(\s*)- ([\w-]+):\s*(.*)$/.exec(line);
    if (stepStart) {
      step = { job, name: '', id: '', uses: '', run: '', continueOnError: false, indent: stepStart[1].length };
      steps.push(step);
      assign(stepStart[2], stepStart[3], indent + 2);
      continue;
    }
    if (!step) continue;
    const keyMatch = /^(\s*)([\w-]+):\s*(.*)$/.exec(line);
    if (keyMatch && keyMatch[1].length === step.indent + 2) assign(keyMatch[2], keyMatch[3], keyMatch[1].length);
  }
  return steps.map(({ indent, ...rest }) => rest);
}

export function enforcedOutcomeIds(text) {
  return new Set([...String(text || '').matchAll(/steps\.([\w-]+)\.outcome/g)].map((match) => match[1]));
}

/*
 * The 2026-08-31 class: a step wrapped in continue-on-error whose outcome
 * nobody reads reports success by construction. A muted step is fine only
 * when a later step reads `steps.<id>.outcome` and fails on it.
 */
export function mutedButUnenforcedSteps(steps, enforcedIds) {
  return steps.filter((step) => step.continueOnError && (!step.id || !enforcedIds.has(step.id)));
}

const SCRIPT_TOKEN = /(?:^|[\s'"`=])((?:api|src|shared|scripts|desktop)\/[\w./-]+\.(?:mjs|cjs|js|ts|mts))(?=$|[\s'"`;&|)])/g;

/*
 * The script files a shell command runs, following `npm run` through
 * package.json and `&&` chains. `npm run test:all` therefore expands to
 * every gate the umbrella runs, which is how a gate wired only there is
 * still counted as wired.
 */
export function commandsToScripts(command, packageScripts = {}, seen = new Set()) {
  const out = new Set();
  for (const part of String(command || '').split(/&&|\|\||;|\n/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const npmRun = /^npm run ([\w:.-]+)/.exec(trimmed);
    if (npmRun) {
      const name = npmRun[1];
      if (seen.has(name)) continue;
      seen.add(name);
      for (const script of commandsToScripts(packageScripts[name] || '', packageScripts, seen)) out.add(script);
      continue;
    }
    for (const match of trimmed.matchAll(SCRIPT_TOKEN)) out.add(match[1]);
  }
  return [...out];
}

export function scriptImports(source) {
  return [...new Set(
    [...String(source || '').matchAll(/(?:import\(|from)\s*['"](\.{1,2}\/[\w./-]+\.mjs)['"]/g)].map((match) => match[1]),
  )];
}

/*
 * Where a script runs: a step that names it, or a wired script that imports
 * it (preview-ready-not-stuck runs shop-preview-act and the preview lifecycle
 * gate by import, and neither appears in a workflow by name).
 */
export function wiringOf(script, runBy, importers, seen = new Set()) {
  if (runBy.has(script)) return runBy.get(script);
  if (seen.has(script)) return null;
  seen.add(script);
  for (const importer of importers.get(script) || []) {
    const via = wiringOf(importer, runBy, importers, seen);
    if (via) return `${via} (imported by ${importer})`;
  }
  return null;
}

export function runnerRoots(runnerSource) {
  const match = /const ROOTS = \[([^\]]*)\]/.exec(String(runnerSource || ''));
  return match ? [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
}

/* ─── the human-readable ledger ──────────────────────────────────────────── */

const basename = (name) => (isGoldenGate(name) ? name : name.slice(name.lastIndexOf('/') + 1));
const cell = (names) => (names.length ? names.map((name) => `\`${basename(name)}\``).join(', ') : '—');
const modelCell = (value) => (value === 'mixed' ? 'mixed' : value ? 'yes' : 'no');
const STATUS_WORD = { proven: 'proven', helpers: 'helpers only', nothing: 'nothing', parked: 'parked' };

export function renderInventoryMarkdown(journeys = JOURNEYS, floors = FLOORS) {
  const summary = summarizeJourneys(journeys);
  const user = journeys.filter((row) => row.kind !== 'platform');
  const platform = journeys.filter((row) => row.kind === 'platform');
  const byId = new Map(journeys.map((row) => [row.id, row]));
  const areas = [...new Set(user.map((row) => row.area))];
  const lines = [];
  lines.push('# Journey-versus-gate inventory');
  lines.push('');
  lines.push('<!-- Generated by `node scripts/journey-gate-inventory-gate.mjs --write` from src/lib/journey-gate-inventory.js. Do not edit by hand: the gate fails while this file is stale. -->');
  lines.push('');
  lines.push(`**${summary.proven} of ${summary.total} user journeys are proven (${summary.provenPercent}%)** — a browser or deployed gate exercises the journey itself. ${summary.helpers} more have their helpers tested and the journey never exercised. ${summary.nothing} have nothing. ${summary.deployed} are proven against a live deployment.${summary.parked ? ` ${summary.parked} more are parked: hidden behind a build flag, unreachable in this build, counted apart.` : ''}`);
  lines.push('');
  lines.push(`Floors that may only rise: proven ≥ ${floors.proven}, on the deployment ≥ ${floors.deployed}. The gate fails on a drop and on a stale floor, so these are the counts.`);
  lines.push('');
  lines.push('## What a level proves');
  lines.push('');
  lines.push('| level | what runs | what it proves |');
  lines.push('|---|---|---|');
  lines.push('| deterministic | a unit or contract test, or a gate with no browser and no model | the helpers behind a journey — not the journey; the attachments path had passing helpers on the day it dropped four files |');
  lines.push('| browser | headless Chromium through the real rendered UI, upstreams stubbed | the journey, on this build |');
  lines.push('| deployed | the same against a live deployment; a `golden:` name is one of the deployed golden transactions, a real model turn | the journey, in production |');
  lines.push('');
  lines.push('## Unproven journeys — the list to work down');
  lines.push('');
  for (const status of ['nothing', 'helpers', 'parked']) {
    const ids = status === 'nothing' ? summary.unguarded : status === 'helpers' ? summary.helpersOnly : summary.parkedIds;
    if (status === 'parked' && !ids.length) continue;
    lines.push(`### ${status === 'nothing' ? `Nothing (${ids.length})` : status === 'helpers' ? `Helpers only (${ids.length})` : `Parked (${ids.length}) — unreachable in this build, not counted above`}`);
    lines.push('');
    if (!ids.length) lines.push('_none_');
    for (const id of ids) {
      const row = byId.get(id);
      lines.push(`- **${row.name}** (\`${row.id}\`, ${row.area})${row.note ? ` — ${row.note}` : ''}`);
    }
    lines.push('');
  }
  lines.push('## User journeys');
  lines.push('');
  for (const area of areas) {
    lines.push(`### ${area}`);
    lines.push('');
    lines.push('| journey | what a user does | model turn | deterministic | browser | deployed | status |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const row of user.filter((candidate) => candidate.area === area)) {
      lines.push(`| \`${row.id}\` | ${row.name} | ${modelCell(row.modelTurn)} | ${cell(row.gates.deterministic)} | ${cell(row.gates.browser)} | ${cell(row.gates.deployed)} | ${row.parked ? STATUS_WORD.parked : STATUS_WORD[journeyStatus(row)]} |`);
    }
    lines.push('');
  }
  lines.push('## Platform invariants');
  lines.push('');
  lines.push('Not journeys, and not counted above, but every journey stands on them.');
  lines.push('');
  lines.push('| invariant | what must hold | deterministic | browser | deployed |');
  lines.push('|---|---|---|---|---|');
  for (const row of platform) {
    lines.push(`| \`${row.id}\` | ${row.name} | ${cell(row.gates.deterministic)} | ${cell(row.gates.browser)} | ${cell(row.gates.deployed)} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
