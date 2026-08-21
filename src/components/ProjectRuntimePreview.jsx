import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildPreviewSandbox } from '../lib/preview-utils.js';
import { correlationHeaders, normalizeClientCorrelationId, recordClientBoundary } from '../lib/transaction-trace.js';

export default function ProjectRuntimePreview({ vfs, correlationId, goldenTransaction = null }) {
  const frameRef = useRef(null);
  const renderedRef = useRef(false);
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
        setHtml(payload.html);
        void recordClientBoundary(correlationId, 'browser.preview-response', 'compiled', {
          transaction: goldenTransaction,
          fileCount: Object.keys(JSON.parse(serializedVfs)).length,
        });
      } catch (compileError) {
        if (!active || controller.signal.aborted) return;
        setError(compileError?.message || 'Preview compilation failed.');
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
      const eventCorrelationId = normalizeClientCorrelationId(event.data.correlationId);
      if (normalizeClientCorrelationId(correlationId) && eventCorrelationId !== correlationId) return;
      if (event.data.kind === 'error') {
        const runtimeMessage = String(event.data.message || 'Preview runtime error.');
        setError(runtimeMessage);
        void recordClientBoundary(correlationId, 'browser.iframe', 'failed', {
          transaction: goldenTransaction,
          detailCode: runtimeMessage.includes('rendered no content') ? 'runtime-empty-root' : 'runtime-exception',
        });
      } else if (event.data.kind === 'ready' && !renderedRef.current) {
        renderedRef.current = true;
        void recordClientBoundary(correlationId, 'browser.iframe', 'rendered', {
          transaction: goldenTransaction,
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [correlationId, goldenTransaction]);

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
