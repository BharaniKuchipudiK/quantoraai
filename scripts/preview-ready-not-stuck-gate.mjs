#!/usr/bin/env node
/**
 * Preview release gate for both rendering families:
 *
 * - Start-with-10 / Fox & Wolf shop must reach a Preview-ready HTML document
 *   with a loadable image and working cart instead of hanging on startup.
 * - React/VFS project Preview must make compiler/runtime failures terminal,
 *   ignore a late ready after failure, and allow the next generation to recover.
 */
import { runShopPreviewActGate } from './shop-preview-act-gate.mjs';

await runShopPreviewActGate().catch((error) => {
  console.error('Preview-ready shop gate FAILED:', error?.stack || error);
  process.exitCode = 1;
});

// This module owns its browser lifecycle and sets process.exitCode on failure.
// Keep it under the existing required Preview-ready CI step so this regression
// cannot become an optional smoke test.
await import('./project-runtime-failure-browser-gate.mjs');
