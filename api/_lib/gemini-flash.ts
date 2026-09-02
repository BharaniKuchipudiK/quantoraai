/**
 * Picking a servable Gemini flash model — because LISTED IS NOT SERVABLE.
 *
 * On 2026-09-02 the Research deep dive called `client.models.list()`, took
 * the first id containing "flash", and got a 2.5-era flash id — which the
 * list still returns while generateContent rejects it: "no longer available
 * to new users … please update to the newer flash". The no-retired-ids
 * invariant guards against PINNED ids in code; this guards the discovery
 * path it pushed everyone onto. (The retired id is spelled out only in the
 * test fixture — writing it here would trip that very gate.)
 *
 * Two rules:
 * - Rank flash candidates by the version embedded in the id, newest first —
 *   the retired ones are, by construction, the old ones.
 * - When the provider rejects a candidate as retired/not-found, ADVANCE to
 *   the next candidate instead of surfacing the failure; only a non-retired
 *   error (quota, auth, network) propagates.
 */

export const GEMINI_FLASH_PICK_VERSION = "gemini-flash-2026-09-02.1";

const MAX_CANDIDATES = 3;

/**
 * An error whose message was WRITTEN FOR THE USER — a plain sentence, never
 * a provider response body. Route catches may echo `.message` from this
 * class and nothing else: the @google/genai SDK throws with the raw JSON
 * response body as `message`, and on 2026-09-02 exactly that body reached
 * the Research board through a catch-all `err?.message`.
 */
export class UserFacingError extends Error {}

/** Newest-first flash ids, by the version number embedded in the id. */
export function rankGeminiFlashIds(ids: string[]): string[] {
  const version = (id: string): number => {
    const match = id.match(/gemini-(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : 0;
  };
  return ids
    .filter((id) => id.includes("gemini") && id.includes("flash"))
    .sort((left, right) => version(right) - version(left) || left.localeCompare(right));
}

/** A rejection that means "this model id, not this request". */
export function isRetiredModelError(err: unknown): boolean {
  const status = Number((err as any)?.status ?? (err as any)?.code);
  const message = String((err as any)?.message || "");
  return status === 404
    || /NOT_FOUND/i.test(message)
    || /no longer available/i.test(message);
}

export async function listGeminiModelIds(client: {
  models: { list: () => Promise<AsyncIterable<{ name?: string }>> };
}): Promise<string[]> {
  const ids: string[] = [];
  const list = await client.models.list();
  for await (const model of list) {
    if (model?.name) ids.push(model.name.replace(/^models\//, ""));
  }
  return ids;
}

/**
 * Run `call(modelId)` against the newest servable flash: try ranked
 * candidates in order, advancing past retired ids, rethrowing the first
 * real error. Fails with a plain sentence — never a provider body — when
 * every candidate is retired.
 */
export async function withNewestGeminiFlash<T>(
  ids: string[],
  call: (modelId: string) => Promise<T>,
): Promise<T> {
  const candidates = rankGeminiFlashIds(ids).slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) throw new UserFacingError("No Gemini flash model available.");
  let lastRetired: unknown = null;
  for (const modelId of candidates) {
    try {
      return await call(modelId);
    } catch (err) {
      if (!isRetiredModelError(err)) throw err;
      lastRetired = err;
      console.warn(`Gemini model ${modelId} rejected as retired; trying next candidate.`);
    }
  }
  console.warn("Every Gemini flash candidate was rejected as retired:", (lastRetired as any)?.message);
  throw new UserFacingError("No currently servable Gemini flash model was found.");
}
