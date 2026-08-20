import React, { useEffect, useRef, useState } from 'react';

const MONACO_VERSION = '0.52.2';
const MONACO_BASE = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min`;
const MONACO_VS = `${MONACO_BASE}/vs`;

let monacoPromise = null;
const workerUrls = new Map();

function workerUrl(label) {
  if (workerUrls.has(label)) return workerUrls.get(label);
  const source = `self.MonacoEnvironment={baseUrl:'${MONACO_BASE}/'};importScripts('${MONACO_VS}/base/worker/workerMain.js');`;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  workerUrls.set(label, url);
  return url;
}

function loadMonaco() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Monaco requires a browser.'));
  if (window.monaco?.editor) return Promise.resolve(window.monaco);
  if (monacoPromise) return monacoPromise;

  monacoPromise = new Promise((resolve, reject) => {
    const configure = () => {
      try {
        if (!window.require?.config) throw new Error('Monaco AMD loader did not initialize.');
        window.MonacoEnvironment = {
          getWorkerUrl(_moduleId, label) {
            return workerUrl(label || 'editor');
          },
        };
        window.require.config({ paths: { vs: MONACO_VS } });
        window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
      } catch (error) {
        reject(error);
      }
    };

    const existing = document.querySelector('script[data-quantora-monaco-loader="true"]');
    if (existing) {
      if (window.require?.config) configure();
      else existing.addEventListener('load', configure, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `${MONACO_VS}/loader.js`;
    script.async = true;
    script.dataset.quantoraMonacoLoader = 'true';
    script.onload = configure;
    script.onerror = () => reject(new Error('Unable to load the Monaco editor runtime.'));
    document.head.appendChild(script);
  });

  return monacoPromise;
}

function languageForPath(path = '') {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.scss')) return 'scss';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  return 'plaintext';
}

function severityName(monaco, value) {
  if (value === monaco.MarkerSeverity.Error) return 'error';
  if (value === monaco.MarkerSeverity.Warning) return 'warning';
  return 'info';
}

export default function MonacoSurface({
  path,
  value,
  onChange,
  onDiagnostics,
  isLight = false,
  readOnly = false,
}) {
  const hostRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const contentDisposableRef = useRef(null);
  const markerDisposableRef = useRef(null);
  const suppressChangeRef = useRef(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    loadMonaco()
      .then((monaco) => {
        if (cancelled || !hostRef.current || editorRef.current) return;
        monacoRef.current = monaco;

        monaco.languages.typescript?.javascriptDefaults?.setEagerModelSync?.(true);
        monaco.languages.typescript?.typescriptDefaults?.setEagerModelSync?.(true);

        editorRef.current = monaco.editor.create(hostRef.current, {
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 14,
          lineHeight: 22,
          fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, monospace',
          fontLigatures: true,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          renderWhitespace: 'selection',
          wordWrap: 'off',
          padding: { top: 14, bottom: 14 },
          roundedSelection: true,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          stickyScroll: { enabled: true },
          suggest: { preview: true },
          inlineSuggest: { enabled: true },
          readOnly,
          theme: isLight ? 'vs' : 'vs-dark',
        });

        markerDisposableRef.current = monaco.editor.onDidChangeMarkers((uris) => {
          const model = editorRef.current?.getModel();
          if (!model || !uris.some((uri) => uri.toString() === model.uri.toString())) return;
          const markers = monaco.editor.getModelMarkers({ resource: model.uri }).map((marker, index) => ({
            id: `${model.uri.toString()}:${marker.startLineNumber}:${marker.startColumn}:${index}`,
            source: 'editor',
            severity: severityName(monaco, marker.severity),
            message: marker.message,
            path,
            line: marker.startLineNumber,
            column: marker.startColumn,
            code: typeof marker.code === 'string' ? marker.code : marker.code?.value || null,
          }));
          onDiagnostics?.(markers);
        });
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error?.message || 'Unable to load code editor.');
      });

    return () => {
      cancelled = true;
      contentDisposableRef.current?.dispose?.();
      markerDisposableRef.current?.dispose?.();
      editorRef.current?.dispose?.();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor || !path) return;

    const uri = monaco.Uri.parse(`file:///${path.replace(/^\/+/, '')}`);
    let model = monaco.editor.getModel(uri);
    if (!model) model = monaco.editor.createModel(value || '', languageForPath(path), uri);

    if (model.getLanguageId() !== languageForPath(path)) {
      monaco.editor.setModelLanguage(model, languageForPath(path));
    }

    suppressChangeRef.current = true;
    if (model.getValue() !== (value || '')) model.setValue(value || '');
    editor.setModel(model);
    editor.updateOptions({ readOnly });
    monaco.editor.setTheme(isLight ? 'vs' : 'vs-dark');
    suppressChangeRef.current = false;

    contentDisposableRef.current?.dispose?.();
    contentDisposableRef.current = model.onDidChangeContent(() => {
      if (suppressChangeRef.current) return;
      onChange?.(model.getValue());
    });

    const markers = monaco.editor.getModelMarkers({ resource: model.uri }).map((marker, index) => ({
      id: `${model.uri.toString()}:${marker.startLineNumber}:${marker.startColumn}:${index}`,
      source: 'editor',
      severity: severityName(monaco, marker.severity),
      message: marker.message,
      path,
      line: marker.startLineNumber,
      column: marker.startColumn,
      code: typeof marker.code === 'string' ? marker.code : marker.code?.value || null,
    }));
    onDiagnostics?.(markers);
  }, [path, value, onChange, onDiagnostics, isLight, readOnly]);

  if (loadError) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24, background: isLight ? '#ffffff' : '#0b1020', color: '#ef4444', fontFamily: 'system-ui' }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <strong>Code editor could not start.</strong>
          <div style={{ marginTop: 8, color: isLight ? '#64748b' : '#94a3b8', fontSize: 13 }}>{loadError}</div>
        </div>
      </div>
    );
  }

  return <div ref={hostRef} data-quantora-monaco-editor="true" style={{ width: '100%', height: '100%', minHeight: 0 }} />;
}
