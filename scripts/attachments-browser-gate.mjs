#!/usr/bin/env node
/**
 * Keep the established attachment journey byte-for-byte and prepend the
 * near-5 MiB transport proof. The existing core exits with the authoritative
 * process status, so a failure in either journey fails the same CI step.
 */
await import('./attachments-5mib-browser-gate.mjs');
await import('./attachments-browser-gate-core.mjs');
