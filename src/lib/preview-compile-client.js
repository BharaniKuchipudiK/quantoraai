import { correlationHeaders } from './transaction-trace.js';

export const PREVIEW_COMPILE_TIMEOUT_MS = 20_000;

export class PreviewCompileError extends Error {
  constructor(message, { code = 'compile-failed', httpStatus = null } = {}) {
    super(message);
    this.name = 'PreviewCompileError';
    this.code = code;
    this.httpStatus = Number.isInteger(httpStatus) ? httpStatus : null;
  }
}

function safeCompilerMessage(value, fallback) {
  const text = String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  return text || fallback;
}

/**
 * Client boundary for the project preview compiler.
 *
 * A caller AbortSignal represents navigation/unmount and must stay silent.
 * The internal deadline is different: it is a terminal preview failure so the
 * desk can never remain on "Preview is starting…" behind a hung request.
 */
export async function requestPreviewCompilation({
  vfs,
  correlationId,
  goldenTransaction = null,
  signal = null,
  timeoutMs = PREVIEW_COMPILE_TIMEOUT_MS,
  fetchFn = globalThis.fetch,
} = {}) {
  if (typeof fetchFn !== 'function') {
    throw new PreviewCompileError('Preview compilation is unavailable.', { code: 'compile-client-unavailable' });
  }

  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = Boolean(signal?.aborted);
  const abortFromCaller = () => {
    callerAborted = true;
    controller.abort();
  };

  if (callerAborted) {
    throw new PreviewCompileError('Preview compilation was cancelled.', { code: 'compile-aborted' });
  }
  signal?.addEventListener?.('abort', abortFromCaller, { once: true });

  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, Number(timeoutMs) || PREVIEW_COMPILE_TIMEOUT_MS));

  try {
    const response = await fetchFn('/api/preview-compile', {
      method: 'POST',
      headers: correlationHeaders(correlationId, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        vfs: vfs || {},
        correlationId,
        ...(goldenTransaction ? { goldenTransaction } : {}),
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new PreviewCompileError(
        safeCompilerMessage(payload?.error, `Preview compilation failed (${response.status}).`),
        { code: 'compile-http-error', httpStatus: response.status },
      );
    }
    if (!payload?.html) {
      throw new PreviewCompileError('Preview compiler returned no runnable document.', {
        code: 'compile-invalid-response',
        httpStatus: response.status,
      });
    }
    return payload;
  } catch (error) {
    if (timedOut) {
      throw new PreviewCompileError('Preview compilation timed out. Please retry.', { code: 'compile-timeout' });
    }
    if (callerAborted || signal?.aborted) {
      throw new PreviewCompileError('Preview compilation was cancelled.', { code: 'compile-aborted' });
    }
    if (error instanceof PreviewCompileError) throw error;
    throw new PreviewCompileError('Preview compilation failed before the compiler responded.', {
      code: 'compile-network-error',
    });
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }
}
