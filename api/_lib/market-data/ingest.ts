/**
 * Market-data ingestion orchestrator (ADR-025, P1).
 *
 * Runs each provider's fetch, then persists the normalized rows through the
 * store's writers. A single provider failing does not abort the others — a bad
 * upstream should degrade coverage, not the whole run. Writers are injectable so
 * this is testable without a database.
 *
 * This module is only ever invoked by the out-of-band ingestion job
 * (scripts/ingest-market-data.ts, run by the Market Data Ingestion workflow).
 * Nothing in the served app imports it, so it cannot affect any workspace.
 */

import {
  writeInstruments,
  writeFxRates,
  writeFundamentals,
  type Instrument,
  type FxRate,
  type Fundamental,
} from "../market-data-store.js";
import type { MarketDataProvider, ProviderOutcome } from "./provider.js";
import { frankfurterProvider } from "./frankfurter-provider.js";
import { secInstrumentsProvider } from "./sec-provider.js";

export type Writers = {
  writeInstruments: (rows: Instrument[]) => Promise<boolean>;
  writeFxRates: (rows: FxRate[]) => Promise<boolean>;
  writeFundamentals: (rows: Fundamental[]) => Promise<boolean>;
};

const defaultWriters: Writers = { writeInstruments, writeFxRates, writeFundamentals };

/** Keep each upsert body modest even when a provider returns thousands of rows. */
const WRITE_CHUNK = 1_000;

export function defaultProviders(): MarketDataProvider[] {
  return [frankfurterProvider(), secInstrumentsProvider()];
}

/** Returns true only if every chunk was accepted by the store. A rejected write
 *  (store down / non-2xx) must not be mistaken for a successful ingestion. */
async function writeChunked<T>(rows: T[], write: (batch: T[]) => Promise<boolean>): Promise<boolean> {
  let allWritten = true;
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const wrote = await write(rows.slice(i, i + WRITE_CHUNK));
    if (!wrote) allWritten = false;
  }
  return allWritten;
}

export async function runIngestion(
  providers: MarketDataProvider[] = defaultProviders(),
  writers: Writers = defaultWriters,
): Promise<ProviderOutcome[]> {
  const outcomes: ProviderOutcome[] = [];
  for (const provider of providers) {
    const outcome: ProviderOutcome = {
      provider: provider.id,
      ok: false,
      wrote: { instruments: 0, fxRates: 0, fundamentals: 0 },
    };
    try {
      const data = await provider.fetch();
      const rejected: string[] = [];
      if (data.instruments?.length) {
        if (await writeChunked(data.instruments, writers.writeInstruments)) {
          outcome.wrote.instruments = data.instruments.length;
        } else {
          rejected.push("instruments");
        }
      }
      if (data.fxRates?.length) {
        if (await writeChunked(data.fxRates, writers.writeFxRates)) {
          outcome.wrote.fxRates = data.fxRates.length;
        } else {
          rejected.push("fxRates");
        }
      }
      if (data.fundamentals?.length) {
        if (await writeChunked(data.fundamentals, writers.writeFundamentals)) {
          outcome.wrote.fundamentals = data.fundamentals.length;
        } else {
          rejected.push("fundamentals");
        }
      }
      // A rejected write is an ingestion failure, not a silent success — otherwise
      // the workflow goes green while nothing was persisted.
      if (rejected.length) {
        outcome.error = `store rejected writes: ${rejected.join(", ")}`;
      } else {
        outcome.ok = true;
      }
    } catch (err: any) {
      outcome.error = err?.message || String(err);
    }
    outcomes.push(outcome);
  }
  return outcomes;
}
