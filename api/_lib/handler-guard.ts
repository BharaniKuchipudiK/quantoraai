/**
 * A serverless handler that cannot fail blank.
 *
 * An uncaught throw in a Vercel handler is not an error page: it is
 * FUNCTION_INVOCATION_FAILED, with no body, no JSON and no message the
 * frontend can read or a person can act on. On the auth entrypoint — the first
 * thing a new person touches, since the frontend calls `?route=session` on
 * load — that is indistinguishable from the whole site being down.
 *
 * This is a NET, not a fix. It cannot make a broken route work and does not
 * try. It converts a blank crash into a readable status the frontend can
 * render, plus a log line naming the failing route. The success path is
 * untouched: the wrapped handler's own return value is passed straight back.
 */
export type ApiHandler = (req: any, res: any) => any;

export function guardHandler(
  handler: ApiHandler,
  {
    label = () => "",
    status = 503,
    message = "This service is temporarily unavailable. Please try again in a moment.",
    log = console.error,
  }: {
    label?: (req: any) => string;
    status?: number;
    message?: string;
    log?: (...args: any[]) => void;
  } = {},
): ApiHandler {
  return async (req: any, res: any) => {
    try {
      return await handler(req, res);
    } catch (error: any) {
      let which = "(unknown)";
      // Deriving the label must not itself throw, or the net has a hole in it.
      try { which = label(req) || "(none)"; } catch { /* keep the placeholder */ }
      /*
       * The route only. No request body and no headers: this wraps the auth
       * endpoint, and those carry passwords, tokens and cookies — a crash log
       * is not a place to put them.
       */
      log(`Handler "${which}" threw:`, error?.message || error);
      /*
       * A stream already opened cannot be turned into a JSON error; writing a
       * second set of headers throws again, inside the catch. Bail quietly and
       * let the request end as it is.
       */
      if (res?.headersSent) return undefined;
      return res.status(status).json({ error: message });
    }
  };
}
