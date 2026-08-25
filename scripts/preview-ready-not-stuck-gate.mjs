#!/usr/bin/env node
/**
 * Start-with-10 / Fox & Wolf shop must reach a Preview-ready HTML document with
 * ≥1 loadable img (data-URI) and a working Add to Cart bag — not hang on
 * “getting ready” while Review already shows foxwolf_*.svg files.
 *
 * Delegates to shop-preview-act-gate (path-first embed + prod sandbox).
 */
import { runShopPreviewActGate } from './shop-preview-act-gate.mjs';

await runShopPreviewActGate().catch((error) => {
  console.error('Preview-ready gate FAILED:', error?.stack || error);
  process.exitCode = 1;
});
