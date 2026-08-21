export type SseResponse = {
  headersSent?: boolean;
  writableEnded?: boolean;
  destroyed?: boolean;
  writeHead(status: number, headers: Record<string, string>): unknown;
  write(chunk: string): unknown;
  end(): unknown;
  flush?: () => unknown;
};

export type StreamFailure = {
  message: string;
  code?: string;
  retryable?: boolean;
  provider?: string;
  requestId?: string;
  correlationId?: string;
};

/**
 * Single owner for an SSE response lifecycle.
 *
 * Once start() has sent headers, callers must never switch back to JSON. A
 * provider failure after that point is represented as a structured SSE event,
 * followed by [DONE], then the socket is ended exactly once.
 */
export class SseWriter {
  private started = false;
  private finished = false;

  constructor(private readonly res: SseResponse) {}

  get isStarted() {
    return this.started || this.res.headersSent === true;
  }

  get isFinished() {
    return this.finished || this.res.writableEnded === true || this.res.destroyed === true;
  }

  start() {
    if (this.isStarted || this.isFinished) return;
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    this.started = true;
  }

  event(payload: unknown) {
    if (this.isFinished) return;
    this.start();
    this.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    this.res.flush?.();
  }

  text(text: string) {
    if (!text || this.isFinished) return;
    this.event({ text });
  }

  status(payload: Record<string, unknown>) {
    if (this.isFinished) return;
    this.event({ status: payload });
  }

  fail(failure: StreamFailure) {
    if (this.isFinished) return;
    this.event({
      error: {
        message: failure.message,
        code: failure.code || 'STREAM_ERROR',
        retryable: failure.retryable === true,
        provider: failure.provider || null,
        requestId: failure.requestId || null,
        correlationId: failure.correlationId || null,
      },
    });
    this.done();
  }

  done(finalPayload?: unknown) {
    if (this.isFinished) return;
    if (finalPayload !== undefined) this.event(finalPayload);
    if (!this.isFinished) {
      this.start();
      this.res.write('data: [DONE]\n\n');
    }
    this.finished = true;
    if (!this.res.writableEnded && !this.res.destroyed) this.res.end();
  }
}

export async function readWithIdleTimeout<T>(
  reader: { read(): Promise<{ done: boolean; value?: T }> },
  idleMs: number,
  label = 'upstream stream',
): Promise<{ done: boolean; value?: T }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} was idle for more than ${idleMs}ms.`)), idleMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function remainingBudgetMs(startedAt: number, totalBudgetMs: number) {
  return Math.max(0, totalBudgetMs - (Date.now() - startedAt));
}

export function assertBudget(startedAt: number, totalBudgetMs: number, label = 'request') {
  if (remainingBudgetMs(startedAt, totalBudgetMs) <= 0) {
    throw new Error(`${label} exceeded its ${totalBudgetMs}ms execution budget.`);
  }
}
