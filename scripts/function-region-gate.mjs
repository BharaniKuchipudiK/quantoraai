#!/usr/bin/env node
/**
 * Keep server functions beside the platform's primary Supabase project.
 *
 * Project persistence is synchronous and latency-sensitive. The database is in
 * Tokyo, so letting Vercel use its default US function region adds an ocean to
 * every Supabase REST round trip and has produced intermittent 4-second save
 * timeouts. This gate makes the intended deployment topology explicit.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const expectedRegions = ['hnd1'];

if (JSON.stringify(config.regions) !== JSON.stringify(expectedRegions)) {
  console.error('Function region gate FAILED: Vercel Functions must run in Tokyo (hnd1).');
  console.error(`  Expected vercel.json regions: ${JSON.stringify(expectedRegions)}`);
  console.error(`  Received: ${JSON.stringify(config.regions ?? null)}`);
  console.error('  Supabase is in Tokyo; a default US function region makes every database');
  console.error('  round trip cross the Pacific and can exceed the project save deadline.');
  process.exit(1);
}

console.log('Function region gate passed — Vercel Functions are pinned to Tokyo (hnd1).');
