// Stable entrypoint shared by blocking CI and exact-deployment verification.
// The original circuit/static proof is preserved byte-for-byte in its module.
// Every module must finish successfully; no swallowed errors or paid generation.
await import('./study-native-lab-component-proof.mjs');
await import('./study-session-continuity-browser-proof.mjs');
await import('./study-cloud-continuity-browser-proof.mjs');
