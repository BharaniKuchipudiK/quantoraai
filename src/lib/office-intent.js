/*
 * The Office-intent detector lives in shared/ so the server's turn planner can
 * run the same deterministic rules as the client (Phase 7). This file keeps
 * every existing import path working.
 */
export * from '../../shared/office-intent.js';
