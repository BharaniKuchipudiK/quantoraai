import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildPreviewSandbox } from '../lib/preview-utils.js';
import { normalizeClientCorrelationId, previewMessageMatchesCompile, recordClientBoundary } from '../lib/transaction-trace.js';
import { requestPreviewCompilation } from '../lib/preview-compile-client.js';

const PREVIEW_RENDER_TIMEOUT_MS = 7_000;

export default function ProjectRuntimePreview({ vfs, correlationId, goldenTransaction = null, onDeskProbe, onStatusChange }) {
  const frameRef = useRef(null);
  const renderedRef = useRef(false);
  const terminalRef = useRef(false);
  const generationRef = useRef(0);
  const compiledIdRef = useRef(normalizeClientCorrelationId(correlationId));
  const onDeskProbeRef = useRef(onDeskProbe);
  onDeskProbeRef.current = onDeskProbe;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const deliveredRef = useRef(false);
  const [html, setHtml] = useState('');
  /*
   * Read through a ref inside the message listener, which is subscribed once.
   * Putting `html` in that effect's deps would tear down and re-add the
   * listener exactly when the shell is announcing itself, and embed-ready
   * would be missed.
   */
  const htmlRef = useRef('');
  const [delivered, setDelivered] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const serializedVfs = useMemo(() => JSON.stringify(vfs || {}), [vfs]);
  htmlRef.current = html;

  useEffect(() => {
    const controller = new AbortController();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let active = true;

    setLoading(true);
    setError('');
    setHtml('');
    // Invalidate the previous iframe immediately. A late message from the old
    // contentWindow must not certify the generation we are compiling now.
    frameRef.current = null;
    renderedRef.current = false;
    terminalRef.current = false;
    deliveredRef.current = false;
    setDelivered(false);
    onStatusChangeRef.current?.('compiling');
    compiledIdRef.current = normalizeClientCorrelationId(correlationId);
    // Facts observed on the previous build must not vouch for this one.
    onDeskProbeRef.current?.(null);

    (async () => {
      try {
        const payload = await requestPreviewCompilation({
          vfs: JSON.parse(serializedVfs),
          correlationId,
          goldenTransaction,
          signal: controller.signal,
        });
        if (!active || generation !== generationRef.current || terminalRef.current) return;
        compiledIdRef.current = normalizeClientCorrelationId(payload.correlationId)
          || normalizeClientCorrelationId(correlationId);
        setHtml(payload.html);
        void recordClientBoundary(correlationId, 'browser.preview-response', 'compiled', {
          transaction: goldenTransaction,
          fileCount: Object.keys(JSON.parse(serializedVfs)).length,
        });
      } catch (compileError) {
        if (!active || generation !== generationRef.current || compileError?.code === 'compile-aborted') return;
        if (terminalRef.current) return;
        terminalRef.current = true;
        const message = compileError?.message || 'Preview compilation failed.';
        setError(message);
        onStatusChangeRef.current?.('failed', message);
        void recordClientBoundary(correlationId, 'browser.preview-response', 'failed', {
          transaction: goldenTransaction,
          detailCode: compileError?.code || 'compile-response-failed',
          ...(Number.isInteger(compileError?.httpStatus) ? { httpStatus: compileError.httpStatus } : {}),
        });
      } finally {
        if (active && generation === generationRef.current) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [serializedVfs, correlationId, goldenTransaction]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== frameRef.current?.contentWindow) return;

      /*
       * The shell announcing itself. It is a DIFFERENT marker from the compiled
       * app's (__quantora vs __quantoraProjectPreview), so the two can never be
       * mistaken for one another — the shell saying "ready" must never satisfy
       * the generated application's obligation to say it rendered.
       */
      if (event.data?.__quantora && event.data.kind === 'embed-ready') {
        if (deliveredRef.current || !htmlRef.current) return;
        deliveredRef.current = true;
        event.source.postMessage({ __quantoraPreviewHtml: htmlRef.current }, '*');
        setDelivered(true);
        return;
      }

      if (!event.data?.__quantoraProjectPreview) return;
      if (!previewMessageMatchesCompile({
        requestId: correlationId,
        compiledId: compiledIdRef.current,
        eventId: event.data.correlationId,
      })) return;

      // Desk facts are allowed after the iframe has declared ready. They are
      // observational, not a terminal-state transition.
      if (event.data.kind === 'desk-probe') {
        if (event.data.facts && typeof event.data.facts === 'object') {
          onDeskProbeRef.current?.(event.data.facts);
        }
        return;
      }

      // ready/error are terminal for one compiled generation. A late ready may
      // never resurrect a generation that already timed out or crashed.
      if (terminalRef.current) return;

      if (event.data.kind === 'error') {
        terminalRef.current = true;
        const runtimeMessage = String(event.data.message || 'Preview runtime error.');
        setError(runtimeMessage);
        onStatusChangeRef.current?.('failed', runtimeMessage);
        void recordClientBoundary(correlationId, 'browser.iframe', 'failed', {
          transaction: goldenTransaction,
          detailCode: runtimeMessage.includes('rendered no content') ? 'runtime-empty-root' : 'runtime-exception',
        });
      } else if (event.data.kind === 'ready' && !renderedRef.current) {
        terminalRef.current = true;
        renderedRef.current = true;
        onStatusChangeRef.current?.('ready');
        void recordClientBoundary(correlationId, 'browser.iframe', 'rendered', {
          transaction: goldenTransaction,
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [correlationId, goldenTransaction]);

  useEffect(() => {
    /*
     * Starts on DELIVERY, not on compilation. The shell has to load and
     * announce itself before the generated app exists at all, so starting the
     * clock when `html` arrived charged that round trip against the app's seven
     * seconds.
     */
    if (!delivered || error || renderedRef.current || terminalRef.current) return undefined;
    // The compiled iframe itself promises a terminal ready/error event within
    // five seconds. Give message delivery two extra seconds, then fail visibly
    // instead of leaving the parent status on “starting” forever.
    const timer = setTimeout(() => {
      if (renderedRef.current || terminalRef.current) return;
      terminalRef.current = true;
      const message = 'Preview compiled, but the generated application did not report that it rendered.';
      setError(message);
      onStatusChangeRef.current?.('failed', message);
      void recordClientBoundary(correlationId, 'browser.iframe', 'failed', {
        transaction: goldenTransaction,
        detailCode: 'runtime-no-ready',
      });
    }, PREVIEW_RENDER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [delivered, error, correlationId, goldenTransaction]);

  return (
    <div
      data-quantora-real-project-preview="true"
      data-quantora-correlation-id={normalizeClientCorrelationId(correlationId) || undefined}
      data-quantora-preview-error={error || undefined}
      style={{ width: '100%', height: '100%', minHeight: 0, background: '#ffffff', position: 'relative' }}
    >
      {loading && (
        <div
          data-quantora-preview-loading="true"
          style={{ padding: 18, color: '#64748b', fontSize: 13 }}
        >
          Compiling preview…
        </div>
      )}
      {error && (
        <div
          data-quantora-preview-error="true"
          role="alert"
          style={{ padding: 18, color: '#b91c1c', fontSize: 13, whiteSpace: 'pre-wrap' }}
        >
          Preview could not run: {error}
        </div>
      )}
      {html && !error && (
        <iframe
          ref={frameRef}
          title="Quantora generated app preview"
          /*
           * THE SHELL, NOT srcDoc.
           *
           * A srcdoc document INHERITS the embedder's CSP, and the app's CSP is
           * `script-src 'self' blob:` with no 'unsafe-inline'. So every inline
           * script in a generated application was refused, the harness never
           * ran, and the parent timed out with "compiled, but the generated
           * application did not report that it rendered" — which is exactly
           * what the deployed golden reported on aa79bb5, with two "Refused to
           * execute inline script" errors sitting in the console next to it.
           *
           * /preview/embed.html is a real same-origin response, so it carries
           * its OWN relaxed CSP (vercel.json /preview/* and the meta tag in the
           * shell) instead of inheriting the app's.
           *
           * LivePreviewCanvas learned this and says so at the top of its file;
           * the fix was never carried across to this component. Same defect,
           * one component over — the class was left open (§7).
           *
           * The sandbox is UNCHANGED and still withholds allow-same-origin:
           * same-origin *serving* is what supplies the shell's CSP, and the
           * sandbox is what keeps the generated code at an opaque origin with
           * no access to ours.
           */
          src="/preview/embed.html"
          sandbox={buildPreviewSandbox()}
          style={{ width: '100%', height: '100%', minHeight: 420, border: 0, background: '#ffffff' }}
        />
      )}
    </div>
  );
}
