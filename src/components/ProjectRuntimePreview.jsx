import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildPreviewSandbox } from '../lib/preview-utils.js';
import { correlationHeaders, normalizeClientCorrelationId, previewMessageMatchesCompile, recordClientBoundary } from '../lib/transaction-trace.js';

export default function ProjectRuntimePreview({ vfs, correlationId, goldenTransaction = null, onDeskProbe, onStatusChange }) {
  const frameRef = useRef(null);
  const renderedRef = useRef(false);
  const compiledIdRef = useRef(normalizeClientCorrelationId(correlationId));
  const onDeskProbeRef = useRef(onDeskProbe);
  onDeskProbeRef.current = onDeskProbe;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const serializedVfs = useMemo(() => JSON.stringify(vfs || {}), [vfs]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError('');
    setHtml('');
    renderedRef.current = false;
    onStatusChangeRef.current?.('compiling');
    compiledIdRef.current = normalizeClientCorrelationId(correlationId);
    // Facts observed on the previous build must not vouch for this one.
    onDeskProbeRef.current?.(null);

    (async () => {
      try {
        const response = await fetch('/api/preview-compile', {
          method: 'POST',
          headers: correlationHeaders(correlationId, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            vfs: JSON.parse(serializedVfs),
            correlationId,
            ...(goldenTransaction ? { goldenTransaction } : {}),
          }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.html) {
          throw new Error(payload?.error || `Preview compilation failed (${response.status}).`);
        }
        if (!active) return;
        compiledIdRef.current = normalizeClientCorrelationId(payload.correlationId)
          || normalizeClientCorrelationId(correlationId);
        setHtml(payload.html);
        void recordClientBoundary(correlationId, 'browser.preview-response', 'compiled', {
          transaction: goldenTransaction,
          fileCount: Object.keys(JSON.parse(serializedVfs)).length,
        });
      } catch (compileError) {
        if (!active || controller.signal.aborted) return;
        const message = compileError?.message || 'Preview compilation failed.';
        setError(message);
        onStatusChangeRef.current?.('failed', message);
        void recordClientBoundary(correlationId, 'browser.preview-response', 'failed', {
          transaction: goldenTransaction,
          detailCode: 'compile-response-failed',
        });
      } finally {
        if (active) setLoading(false);
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
      if (!event.data?.__quantoraProjectPreview) return;
      if (!previewMessageMatchesCompile({
        requestId: correlationId,
        compiledId: compiledIdRef.current,
        eventId: event.data.correlationId,
      })) return;
      if (event.data.kind === 'error') {
        const runtimeMessage = String(event.data.message || 'Preview runtime error.');
        setError(runtimeMessage);
        onStatusChangeRef.current?.('failed', runtimeMessage);
        void recordClientBoundary(correlationId, 'browser.iframe', 'failed', {
          transaction: goldenTransaction,
          detailCode: runtimeMessage.includes('rendered no content') ? 'runtime-empty-root' : 'runtime-exception',
        });
      } else if (event.data.kind === 'desk-probe') {
        if (event.data.facts && typeof event.data.facts === 'object') {
          onDeskProbeRef.current?.(event.data.facts);
        }
      } else if (event.data.kind === 'ready' && !renderedRef.current) {
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
    if (!html || error || renderedRef.current) return undefined;
    // The compiled iframe itself promises a terminal ready/error event within
    // five seconds. Give message delivery two extra seconds, then fail visibly
    // instead of leaving the parent status on “starting” forever.
    const timer = setTimeout(() => {
      if (renderedRef.current) return;
      const message = 'Preview compiled, but the generated application did not report that it rendered.';
      setError(message);
      onStatusChangeRef.current?.('failed', message);
    }, 7000);
    return () => clearTimeout(timer);
  }, [html, error]);

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
          srcDoc={html}
          sandbox={buildPreviewSandbox()}
          style={{ width: '100%', height: '100%', minHeight: 420, border: 0, background: '#ffffff' }}
        />
      )}
    </div>
  );
}
