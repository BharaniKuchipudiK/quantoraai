import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildPreviewSandbox } from '../lib/preview-utils.js';

export default function ProjectRuntimePreview({ vfs }) {
  const frameRef = useRef(null);
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

    (async () => {
      try {
        const response = await fetch('/api/preview-compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vfs: JSON.parse(serializedVfs) }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.html) {
          throw new Error(payload?.error || `Preview compilation failed (${response.status}).`);
        }
        if (!active) return;
        setHtml(payload.html);
      } catch (compileError) {
        if (!active || controller.signal.aborted) return;
        setError(compileError?.message || 'Preview compilation failed.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [serializedVfs]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!event.data?.__quantoraProjectPreview) return;
      if (event.data.kind === 'error') {
        setError(String(event.data.message || 'Preview runtime error.'));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div
      data-quantora-real-project-preview="true"
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
