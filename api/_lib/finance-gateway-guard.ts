/**
 * Resilience wrapper for the deterministic Finance gateways (ADR-025).
 *
 * The Finance gateways run in pipeline.ts BEFORE the normal chat runtime and,
 * critically, OUTSIDE its try/catch. Each one reads stored data or does
 * arithmetic and streams a grounded answer. Their dependencies are already
 * defensive (the stores swallow network/DB errors and return null/[]), but
 * "nothing throws today" is not the same as "a throw can never reach the user".
 * This guard is the belt-and-suspenders layer: an unexpected throw degrades
 * gracefully instead of leaking a raw 500 / stack trace.
 *
 *  - If the response has NOT been opened yet, it returns false so the pipeline
 *    falls through to normal chat — the user still gets an answer, just not the
 *    deterministic one.
 *  - If the stream was already opened (a mid-stream failure), it closes the
 *    stream cleanly and reports the turn as handled, so the client sees a
 *    terminated response rather than a hung socket.
 *
 * Isolation: this only wraps the Finance gateways. A non-Finance turn returns
 * false from the gateway body before any work, so the guard is a pass-through.
 */
export async function guardFinanceGateway(
  name: string,
  res: any,
  run: () => Promise<boolean>,
): Promise<boolean> {
  try {
    return await run();
  } catch (err: any) {
    console.error(`[finance-gateway:${name}] unexpected error:`, err?.message || err);
    const alreadyStreaming = Boolean(res?.headersSent || res?.writableEnded);
    if (alreadyStreaming) {
      // Response already opened — we cannot fall through to chat. End it cleanly.
      try {
        res.end();
      } catch {
        /* socket already closed — nothing to do */
      }
      return true;
    }
    // Nothing sent yet — let the pipeline continue to normal chat.
    return false;
  }
}
