import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { compileBrowserProject } from '../lib/browser-project-runtime.js';

const START_TIMEOUT_MS = 15_000;

function fingerprint(vfs) {
  try {
    return JSON.stringify(Object.entries(vfs || {}).map(([path, file]) => [path, typeof file === 'string' ? file : file?.content ?? file?.code ?? '']));
  } catch {
    return String(Date.now());
  }
}

export default function BrowserProjectPreview({ vfs, onRuntimeStateChange }) {
  const iframeRef = useRef(null);
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [documentHtml, setDocumentHtml] = useState('');
  const [state, setState] = useState({ kind: 'compiling', message: 'Preparing your preview…' });
  const projectKey = useMemo(() => fingerprint(vfs), [vfs]);

  useEffect(() => {
    let cancelled = false;
    setDocumentHtml('');
    setState({ kind: 'compiling', message: 'Preparing your preview…' });

    import('typescript')
      .then((ts) => {
        if (cancelled) return;
        const compiled = compileBrowserProject(vfs, ts);
        if (cancelled) return;
        setState({ kind: 'starting', message: 'Preparing your preview…', entry: compiled.entry });
        setDocumentHtml(compiled.html);
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ kind: 'failed', message: String(error?.message || 'Preview compiler could not start.') });
      });

    return () => { cancelled = true; };
  }, [projectKey, runtimeVersion, vfs]);

  useEffect(() => {
    onRuntimeStateChange?.(state);
  }, [state, onRuntimeStateChange]);

  useEffect(() => {
    if (!documentHtml) return undefined;
    let finished = false;
    const timer = window.setTimeout(() => {
      if (finished) return;
      setState({
        kind: 'failed',
        message: 'The preview took too long to start. Quantora stopped the attempt instead of leaving you on an endless loading screen.',
      });
    }, START_TIMEOUT_MS);

    const onMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data;
      if (!payload?.__quantoraProjectPreview) return;
      if (payload.kind === 'ready') {
        finished = true;
        window.clearTimeout(timer);
        setState({ kind: 'ready', message: 'Preview ready', bodyText: String(payload.bodyText || '') });
        return;
      }
      if (payload.kind === 'error') {
        finished = true;
        window.clearTimeout(timer);
        setState({ kind: 'failed', message: String(payload.message || 'The project reported a runtime error.') });
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, [documentHtml]);

  const retry = () => setRuntimeVersion((value) => value + 1);

  return (
    <div
      data-quantora-browser-project-preview="true"
      data-runtime-state={state.kind}
      style={{ width: '100%', height: '100%', minHeight: 0, position: 'relative', background: '#fff', overflow: 'hidden' }}
    >
      {documentHtml && (
        <iframe
          ref={iframeRef}
          key={`${projectKey}-${runtimeVersion}`}
          title="Quantora project preview"
          srcDoc={documentHtml}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
        />
      )}

      {(state.kind === 'compiling' || state.kind === 'starting') && (
        <div
          data-quantora-preview-preparing="true"
          role="status"
          aria-live="polite"
          style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#fff', color: '#475569' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', font: '700 13px/1.4 Inter,system-ui,sans-serif' }}>
            <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '999px', background: '#f97316', boxShadow: '0 0 0 5px rgba(249,115,22,.10)' }} />
            {state.message}
          </div>
        </div>
      )}

      {state.kind === 'ready' && (
        <div
          data-quantora-preview-verified="true"
          title="Project runtime started successfully"
          style={{
            position: 'absolute', right: '12px', bottom: '12px', zIndex: 4,
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '5px 8px', borderRadius: '999px',
            color: '#047857', background: 'rgba(236,253,245,.94)',
            border: '1px solid rgba(16,185,129,.24)',
            font: '700 10px/1 Inter,system-ui,sans-serif',
            pointerEvents: 'none',
          }}
        >
          <ShieldCheck size={12} /> Running
        </div>
      )}

      {state.kind === 'failed' && (
        <div
          role="alert"
          style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '28px', background: '#fff' }}
        >
          <div style={{ maxWidth: '560px', color: '#334155', fontFamily: 'Inter,system-ui,sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', color: '#b91c1c', fontWeight: 800, marginBottom: '8px' }}>
              <AlertTriangle size={18} /> Preview needs attention
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '13px', lineHeight: 1.55 }}>
              {state.message}
            </p>
            <button
              type="button"
              onClick={retry}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 11px', borderRadius: '9px', border: '1px solid #cbd5e1',
                background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} /> Retry preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}