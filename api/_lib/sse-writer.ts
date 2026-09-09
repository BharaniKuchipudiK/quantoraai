import { traceSseChatSuccessSettled } from './transaction-trace.js';

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
  /*
   * Every engine this turn actually ran, as DATA.
   *
   * One browser attempt is up to four server ones: the inference ladder works
   * down its own rungs behind a single request. Which rungs burned was reported
   * only inside a human-readable status label — and prose is invisible to
   * routing, the lesson coding-outcome-spine.js already records for its retry
   * chip. So the desk counted one attempt, the terminal copy under-reported
   * what was tried, and the durable mission believed the other rungs were still
   * untried and routed the next turn straight into one.
   */
  spentEngineIds?: string[];
};

export type SseTerminalSuccessSink = (payload: unknown) => false | Promise<boolean>;

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
  private committed = false;

  constructor(
    private readonly res: SseResponse,
    private readonly terminalSuccessSink: SseTerminalSuccessSink = traceSseChatSuccessSettled,
  ) {}

  get isStarted() {
    return this.started || this.res.headersSent === true;
  }

  /** True only after user-visible token text. Status heartbeats must not block provider fallback. */
  get isCommitted() {
    return this.committed;
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
    this.committed = true;
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
        ...(failure.spentEngineIds?.length ? { spentEngineIds: [...failure.spentEngineIds] } : {}),
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

    /*
     * A successful chat's terminal trace must land before the serverless socket
     * closes. The old handler called trace() after sse.done(), which meant the
     * response could end — and the instance could freeze — while the durable
     * store write was still in flight. Failures already use awaited traceFinal.
     *
     * Only a real chat-success payload produces a Promise. Synthetic/non-chat
     * done() calls still close synchronously, so the generic SSE contract does
     * not acquire a hidden delay.
     */
    const settleTerminalSuccess = finalPayload === undefined
      ? false
      : this.terminalSuccessSink(finalPayload);

    this.finished = true;
    const endResponse = () => {
      if (!this.res.writableEnded && !this.res.destroyed) this.res.end();
    };

    if (settleTerminalSuccess && typeof (settleTerminalSuccess as Promise<boolean>).then === 'function') {
      void Promise.resolve(settleTerminalSuccess)
        .catch(() => false)
        .finally(endResponse);
      return;
    }

    endResponse();
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