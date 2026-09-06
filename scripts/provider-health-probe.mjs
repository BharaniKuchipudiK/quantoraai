#!/usr/bin/env node
/*
 * THE PROVIDER WATCH — every half hour, against production, with an email.
 *
 * Reads the deployment's readiness snapshot, its live Gemini probe and its
 * free OpenRouter credential probe, judges them with scripts/lib/provider-
 * health.mjs, prints one PROVIDER HEALTH line LAST, and exits 1 when a
 * provider is missing, refused, capped, exhausted or unreachable — which
 * fails the scheduled workflow, and a failed scheduled workflow is the one
 * thing GitHub emails the repository's owner about without being asked.
 *
 * Node only: no dependency install, so the run costs seconds and nothing
 * can break it but the deployment it is watching.
 */
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assessProviderHealth } from './lib/provider-health.mjs';

const BASE_URL = String(process.env.QUANTORA_E2E_BASE_URL || '').replace(/\/+$/, '');
const CANARY_TOKEN = String(process.env.QUANTORA_GOLDEN_CANARY_TOKEN || '');
const VERCEL_BYPASS_TOKEN = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '');
const ARTIFACT_DIR = process.env.QUANTORA_PROVIDER_HEALTH_DIR || 'artifacts/provider-health';
const READ_TIMEOUT_MS = Number(process.env.QUANTORA_PROVIDER_HEALTH_TIMEOUT_MS || 25_000);

if (!/^https:\/\//.test(BASE_URL)) throw new Error('QUANTORA_E2E_BASE_URL must be an HTTPS deployment URL.');
if (CANARY_TOKEN.length < 24) throw new Error('QUANTORA_GOLDEN_CANARY_TOKEN is missing or too short — the probes answer only the canary or an admin.');

const headers = {
  'X-Quantora-Golden-Canary': CANARY_TOKEN,
  ...(VERCEL_BYPASS_TOKEN ? { 'x-vercel-protection-bypass': VERCEL_BYPASS_TOKEN } : {}),
};

/** One read: status and parsed body, or nulls — the assessor names silence UNREACHABLE. */
async function read(pathWithQuery) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${pathWithQuery}`, { headers, signal: controller.signal });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch (error) {
    console.error(`${pathWithQuery}: ${error?.message || error}`);
    return { status: null, body: null };
  } finally {
    clearTimeout(timer);
  }
}

const startedAt = new Date().toISOString();
const health = await read('/api/inference-health');
const gemini = await read('/api/inference-health?probe=gemini');
const openrouter = await read('/api/inference-health?probe=openrouter&generate=0');
const result = assessProviderHealth({ health, gemini, openrouter });

mkdirSync(ARTIFACT_DIR, { recursive: true });
writeFileSync(`${ARTIFACT_DIR}/provider-health.json`, `${JSON.stringify({
  baseUrl: BASE_URL,
  startedAt,
  completedAt: new Date().toISOString(),
  ok: result.ok,
  failures: result.failures,
  notes: result.notes,
  health: health.body,
  gemini: gemini.body,
  openrouter: openrouter.body,
}, null, 2)}\n`);
writeFileSync(`${ARTIFACT_DIR}/verdict.txt`, `${result.verdict}\n`);

for (const note of result.notes) console.log(`  ${note}`);
for (const failure of result.failures) console.error(`  ${failure}`);
if (gemini.body?.verdict) console.log(`  Gemini says: ${String(gemini.body.verdict).replace(/\s+/g, ' ').slice(0, 300)}`);
if (openrouter.body?.verdict) console.log(`  OpenRouter says: ${String(openrouter.body.verdict).replace(/\s+/g, ' ').slice(0, 300)}`);
console.log(`\n${result.verdict}`);
if (!result.ok) process.exitCode = 1;
